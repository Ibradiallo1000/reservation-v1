// Step 2 — Payment method selection (after reservation created)
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { Check, Phone, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import ReservationStepHeader from '../components/ReservationStepHeader';
import PaymentInstructionsModal, { getPaymentInstructionsSeen } from '../components/PaymentInstructionsModal';
import { enUS } from 'date-fns/locale';
import { fr } from 'date-fns/locale';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { getDisplayPhone } from '@/utils/phoneUtils';
import { getPublicPathBase } from '../utils/subdomain';
import { isReservationAwaitingPayment } from '../utils/onlineReservationStatus';
import {
  fetchReservationFromNestedPath,
  readPendingReservationPointer,
} from '../utils/pendingReservation';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

interface ReservationRow {
  id: string;
  companyId: string;
  agencyId: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  seatsGo: number;
  statut?: string;
}

interface PaymentMethodInfo {
  url?: string;
  logoUrl?: string;
  ussdPattern?: string;
  merchantNumber?: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  logoUrl?: string;
  slug?: string;
}

const formatCity = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/** Date with locale: FR "4 mars 2026 à 05:00", EN "March 4, 2026 at 05:00" */
function formatSummaryDate(dateStr: string, heureStr: string, language: string) {
  try {
    const d = dateStr && heureStr ? parseISO(`${dateStr}T${heureStr}:00`) : parseISO(dateStr || new Date().toISOString().slice(0, 10));
    const isFr = language === 'fr';
    if (isFr) {
      return format(d, "d MMMM yyyy 'à' HH:mm", { locale: fr });
    }
    return format(d, "d MMMM yyyy 'at' HH:mm", { locale: enUS });
  } catch {
    return language === 'fr' ? `${dateStr} à ${heureStr}` : `${dateStr} at ${heureStr}`;
  }
}

interface PaymentMethodPageProps {
  slug?: string;
}

export default function PaymentMethodPage({ slug: slugProp }: PaymentMethodPageProps = {}) {
  const { t, i18n } = useTranslation();
  const { slug: slugFromParams } = useParams<{ slug: string }>();
  const slug = slugProp ?? slugFromParams ?? '';
  const pathBase = getPublicPathBase(slug);
  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const language = i18n.language?.startsWith('en') ? 'en' : 'fr';

  const pathParts = location.pathname.split('/').filter(Boolean);
  // Sous-domaine (prod) : /payment/:id → pathParts = ['payment', id]. Path (dev) : /:slug/payment/:id → pathParts = [slug, 'payment', id].
  const reservationIdFromPath =
    pathParts[0] === 'payment' ? pathParts[1] : (pathParts[1] === 'payment' ? pathParts[2] : undefined);
  const state = (location.state || {}) as {
    reservationId?: string;
    companyId?: string;
    agencyId?: string;
  };
  const pendingStored = readPendingReservationPointer();
  const reservationId =
    state.reservationId ?? reservationIdFromPath ?? pendingStored?.reservationId;
  let companyId = state.companyId ?? pendingStored?.companyId;
  let agencyId = state.agencyId ?? pendingStored?.agencyId;

  const [reservation, setReservation] = useState<ReservationRow | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<Record<string, PaymentMethodInfo>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMethodKey, setSelectedMethodKey] = useState<string | null>(null);
  const [showInstructionsModal, setShowInstructionsModal] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [walletModalKey, setWalletModalKey] = useState<string | null>(null);

const load = useCallback(async () => {
    console.log("[PaymentMethodPage] BUILD_VERSION", "payment-methods-v2");
    console.log(
      "[PaymentMethodPage] sw controller",
      (navigator as any).serviceWorker?.controller ? "present" : "absent"
    );

    if (!slug || !reservationId) {
      setError('Données de réservation manquantes.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      let cid = companyId ?? '';
      let aid = agencyId ?? '';
      if (!cid || !aid) {
        const prSnap = await getDoc(doc(db, 'publicReservations', reservationId));
        if (prSnap.exists()) {
          const p = prSnap.data() as Record<string, unknown>;
          cid = String(p.companyId ?? cid);
          aid = String(p.agencyId ?? aid);
        }
      }
      if (!cid || !aid) {
        setError('Données de réservation manquantes. Retournez à l’accueil ou retrouvez votre réservation.');
        setLoading(false);
        return;
      }

      const snap = await fetchReservationFromNestedPath(db, cid, aid, reservationId);
      if (!snap) {
        setError('Réservation introuvable. Utilisez le lien reçu par email ou le lien de votre billet.');
        setLoading(false);
        return;
      }
      if (!isReservationAwaitingPayment(snap.status)) {
        setError('Cette réservation n’est plus en attente de paiement.');
        setLoading(false);
        return;
      }
      const toStr = (v: unknown): string => (typeof v === 'string' ? v : '');
      const normDate = (v: unknown): string => {
        if (typeof v === 'string') return v;
        if (v && typeof v === 'object' && 'seconds' in v) return new Date((v as { seconds: number }).seconds * 1000).toISOString().slice(0, 10);
        return '';
      };
      setReservation({
        id: reservationId,
        companyId: cid,
        agencyId: aid,
        nomClient: toStr(snap.nomClient),
        telephone: toStr(snap.telephoneOriginal ?? snap.telephone),
        depart: toStr(snap.depart),
        arrivee: toStr(snap.arrivee),
        date: normDate(snap.date),
        heure: toStr(snap.heure),
        montant: Number(snap.montant ?? (snap as any).montant_total ?? 0),
        seatsGo: Number(snap.seatsGo ?? 1),
        statut: toStr(snap.status),
      });

      const compSnap = await getDoc(doc(db, 'companies', cid));
      if (compSnap.exists()) {
        const c = compSnap.data() as Record<string, unknown>;
        setCompany({
          id: compSnap.id,
          name: (c.nom as string) || (c.name as string) || '',
          couleurPrimaire: (c.couleurPrimaire as string) || (c.primaryColor as string) || '#2563eb',
          couleurSecondaire: (c.couleurSecondaire as string) || (c.secondaryColor as string) || '#93c5fd',
          logoUrl: c.logoUrl as string | undefined,
          slug: c.slug as string | undefined,
        });
      }

      // 1) Récupération des configs actives de la compagnie
      const cfgSnap = await getDocs(
        query(
          collection(db, 'companies', cid, 'paymentConfigs')
        )
      );

      const activeConfigs = cfgSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((c) => Boolean(c.isEnabled ?? c.active ?? false));

      // 2) Pour chaque config, charger la méthode globale paymentMethods/{methodId}
      const pms: Record<string, PaymentMethodInfo> = {};

      await Promise.all(
        activeConfigs.map(async (cfg) => {
          const methodId = String(cfg.methodId ?? cfg.id ?? '');
          if (!methodId) return;

          const mSnap = await getDoc(doc(db, 'paymentMethods', methodId));
          if (!mSnap.exists()) return;

          const m = mSnap.data() as Record<string, any>;

          const methodDocData = m;
          const configData = cfg;

          // Merge complète : on conserve les champs PaymentMethodInfo nécessaires au modal Wave.
          const mergedMethod: any = {
            id: methodId,
            name: methodDocData?.name ?? methodId,
            logoUrl: methodDocData?.logoUrl,
            type: methodDocData?.type,
            providerCode: methodDocData?.providerCode,
            ussdTemplate: methodDocData?.ussdTemplate ?? '',
            ussdPattern:
              methodDocData?.ussdTemplate ??
              methodDocData?.ussdPattern ??
              '',
            merchantCode: configData?.merchantCode ?? '',
            merchantNumber: configData?.merchantCode ?? configData?.merchantNumber ?? '',
            phoneNumber: configData?.phoneNumber ?? '',
            instructions: methodDocData?.instructions ?? '',
            active: configData?.active === true && configData?.isEnabled === true,
            url: methodDocData?.defaultPaymentUrl,
            ussdPatternLegacy: methodDocData?.ussdTemplate ?? methodDocData?.ussdPattern,
          };

          console.log('[PaymentMethodPage] payment method doc', methodDocData);
          console.log('[PaymentMethodPage] payment config doc', configData);
          console.log('[PaymentMethodPage] merged method', mergedMethod);
          // debug: merged method card state

          console.log(
            '[PaymentMethodPage] paymentMethods state',
            pms
          );

          console.log('[PaymentMethodPage] methodDoc', {
            methodId,
            raw: m,
          });
          const name = String(m.name ?? methodId);

          const legacyUssdTemplate = (m.ussdTemplate ?? m.ussdPattern ?? '') as string | undefined;
          const legacyMerchantNumber = String(cfg.merchantCode ?? m.merchantNumber ?? '');
          const legacyPhoneNumber = (cfg.phoneNumber ?? m.phoneNumber ?? cfg.merchantCode ?? '') as string | undefined;

          pms[name] = {
            url: mergedMethod.url as string | undefined,
            logoUrl: mergedMethod.logoUrl as string | undefined,
            ussdPattern: mergedMethod.ussdPattern as string,
            merchantNumber: mergedMethod.merchantNumber as string,
            merchantCode: mergedMethod.merchantCode as string,
            phoneNumber: mergedMethod.phoneNumber as string,
            name: mergedMethod.name,
            type: mergedMethod.type,
            providerCode: mergedMethod.providerCode,
            instructions: mergedMethod.instructions,
            active: mergedMethod.active,
          } as any;

          // NOTE: phoneNumber existe pour le futur modal Wave, mais n’est pas utilisé ici.
          void legacyPhoneNumber;

          // injecter aussi phoneNumber dans les instructions/url si besoin plus tard
        })
      );

      setPaymentMethods(pms);
      console.log('[PaymentMethodPage] available payment methods', pms);
      
      console.log('[PaymentMethodPage] reservation', {
        id: reservationId,
        statut: toStr(snap.statut),
        montant: Number(snap.montant ?? 0),
      });
      console.log('[PaymentMethodPage] company', compSnap.exists() ? { id: compSnap.id } : null);
      console.log('[PaymentMethodPage] activeConfigs', activeConfigs.map((c) => c.methodId ?? c.id));
      console.log('[PaymentMethodPage] paymentMethods keys', Object.keys(pms));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, [slug, reservationId, companyId, agencyId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!loading && reservation && company && !getPaymentInstructionsSeen()) {
      setShowInstructionsModal(true);
    }
  }, [loading, reservation, company]);

  const primaryColor = company?.couleurPrimaire ?? '#2563eb';
  const secondaryColor = company?.couleurSecondaire ?? '#93c5fd';

  const handleSelectMethod = async (key: string) => {
    console.log('[PaymentMethodPage] handleSelectMethod received', paymentMethods[key]);
    if (!reservation || !company || !slug) return;
    const method = paymentMethods[key];
    if (!method) return;
    setErrorBanner(null);
    setWalletModalKey(null);

    // Temporary: final USSD code + logs
    const finalUssdCode = (method.ussdPattern || '')
      ? (method.ussdPattern || '')
          .replace('MERCHANT', method.merchantNumber || '')
          .replace('AMOUNT', String(reservation.montant))
      : '';

    console.log('[PaymentMethodPage] selected method', method);
    console.log('[PaymentMethodPage] final ussd code', finalUssdCode);

    const uploadPreuvePath = pathBase
      ? `/${pathBase}/upload-preuve/${reservation.id}`
      : `/upload-preuve/${reservation.id}`;

    // Draft/companyInfo must be passed to UploadPreuvePage only AFTER payment confirmation
    const draft = {
      id: reservation.id,
      agencyId: reservation.agencyId,
      companyId: reservation.companyId,
      companyName: company.name,
      companySlug: slug,
      nomClient: reservation.nomClient,
      telephone: getDisplayPhone(reservation),
      depart: reservation.depart,
      arrivee: reservation.arrivee,
      date: reservation.date,
      heure: reservation.heure,
      seatsGo: reservation.seatsGo,
      seatsReturn: 0,
      tripType: 'aller_simple' as const,
      montant: reservation.montant,
      preuveMessage: '',
    };

    const companyInfo = {
      id: company.id,
      name: company.name,
      primaryColor: company.couleurPrimaire,
      secondaryColor: company.couleurSecondaire,
      couleurPrimaire: company.couleurPrimaire,
      couleurSecondaire: company.couleurSecondaire,
      logoUrl: company.logoUrl,
      slug: company.slug,
    };

    // Determine method type based on global data (legacy fields)
    const isUssd = Boolean(method.ussdPattern);
    const isPaymentLink = Boolean(method.url) && !isUssd;

    // Wave uses legacy merchantNumber; the real phoneNumber is not currently wired into PaymentMethodInfo.
    // For now, we treat non-USSD/non-link as wallet_number.
    const isWalletNumber = !isUssd && !isPaymentLink;

    // 1) USSD: call tel: and then navigate to UploadPreuvePage with computed code
    if (isUssd) {
      if (!finalUssdCode) {
        setErrorBanner('USSD indisponible : impossible de recomposer le code.');
        return;
      }

      try {
        sessionStorage.setItem('lastUssdCode', finalUssdCode);
      } catch {
        /* ignore */
      }

      window.location.href = `tel:${encodeURIComponent(finalUssdCode)}`;

      const uploadPreuvePathFinal = uploadPreuvePath;
      navigate(uploadPreuvePathFinal, {
        replace: false,
        state: {
          paymentMethodName: key,
          paymentType: 'ussd',
          finalUssdCode,
          reservationId: reservation.id,
          companyId: reservation.companyId,
          agencyId: reservation.agencyId,
          paymentMethodKey: key,
        },
      });
      return;
    }

    // 2) wallet_number: open modal/panel (no tel:, no direct navigate)
    if (isWalletNumber) {
      setWalletModalKey(key);
      setSelectedMethodKey(key);
      return;
    }

    // 3) payment_link: open link then navigate to proof
    if (isPaymentLink) {
      if (method.url) {
        try {
          new URL(method.url);
          window.open(method.url, '_blank', 'noopener,noreferrer');
        } catch {
          // ignore
        }
      }

      navigate(uploadPreuvePath, {
        replace: false,
        state: {
          paymentMethodName: key,
          paymentType: 'payment_link',
          reservationId: reservation.id,
          companyId: reservation.companyId,
          agencyId: reservation.agencyId,
          paymentMethodKey: key,
        },
      });
      return;
    }

    // Fallback: redirect to upload-preuve
    navigate(uploadPreuvePath, {
      replace: false,
      state: {
        draft,
        companyInfo,
        paymentMethodKey: key,
        companyId: reservation.companyId,
        agencyId: reservation.agencyId,
      },
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500 text-sm">Chargement…</div>
      </div>
    );
  }

  if (error || !reservation || !company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-gray-50">
        <p className="text-red-600 text-sm mb-4">{error || 'Réservation introuvable.'}</p>
        <button
          type="button"
          onClick={() => navigate(pathBase ? `/${pathBase}/booking` : '/booking', { replace: true })}
          className="px-4 py-2 rounded-lg font-medium text-white"
          style={{ backgroundColor: primaryColor }}
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {showInstructionsModal && (
        <PaymentInstructionsModal
          primaryColor={primaryColor}
          secondaryColor={secondaryColor}
          onClose={() => setShowInstructionsModal(false)}
        />
      )}
      {/* USSD / Wallet confirmations (wallet_number modal real JSX) */}
      {errorBanner && (
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 mt-3">
          <div className="rounded-xl border border-red-200 bg-red-50 text-red-800 px-4 py-3 text-sm font-medium">
            {errorBanner}
          </div>
        </div>
      )}

      {walletModalKey && reservation && company && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border" style={{ borderColor: `${secondaryColor}4D` }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden">
                  {paymentMethods[walletModalKey]?.logoUrl ? (
                    <LazyLoadImage
                      src={paymentMethods[walletModalKey]!.logoUrl!}
                      alt={walletModalKey}
                      className="h-10 w-10 object-contain"
                      effect="opacity"
                    />
                  ) : (
                    <span className="font-bold" style={{ color: secondaryColor }}>
                      {walletModalKey.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-sm text-gray-500">Méthode</div>
                  <div className="text-lg font-semibold text-gray-900">{walletModalKey.replace(/_/g, ' ')}</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setWalletModalKey(null);
                  setSelectedMethodKey(null);
                }}
                className="text-gray-500 hover:text-gray-700 font-bold text-lg"
                aria-label="Close"
              >
                ×
              </button>
            </div>

              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              {(() => {
                const method = paymentMethods[walletModalKey!];
                const walletPhoneNumber = (method as any)?.phoneNumber || (method as any)?.merchantNumber || '';
                if (!walletPhoneNumber) {
                  return (
                    <div className="text-sm font-semibold text-red-700">
                      Numéro de réception non configuré
                    </div>
                  );
                }

                const copyToClipboard = async (value: string) => {
                  if (!value) return;

                  try {
                    if (navigator.clipboard?.writeText) {
                      await navigator.clipboard.writeText(value);
                    } else {
                      const textarea = document.createElement('textarea');
                      textarea.value = value;
                      textarea.style.position = 'fixed';
                      textarea.style.opacity = '0';
                      document.body.appendChild(textarea);
                      textarea.focus();
                      textarea.select();
                      document.execCommand('copy');
                      document.body.removeChild(textarea);
                    }

                    toast.success('Numéro copié');
                    setTimeout(() => {}, 2000);
                  } catch (error) {
                    console.error('[PaymentMethodPage] copy failed', error);
                  }
                };

                return (
                  <>
                    <div className="text-xs font-medium text-gray-500 uppercase">Numéro de réception</div>
                    <div className="mt-1 text-base font-semibold text-gray-900">{walletPhoneNumber}</div>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyToClipboard(walletPhoneNumber)}
                        className="flex-1 rounded-lg border border-gray-300 bg-white py-2 text-sm font-semibold"
                      >
                        Copier le numéro
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const uploadPreuvePath = pathBase
                            ? `/${pathBase}/upload-preuve/${reservation.id}`
                            : `/upload-preuve/${reservation.id}`;

                          navigate(uploadPreuvePath, {
                            replace: false,
                            state: {
                              paymentMethodName: walletModalKey,
                              paymentType: 'wallet_number',
                              phoneNumber: walletPhoneNumber,
                              reservationId: reservation.id,
                              paymentMethodKey: walletModalKey,
                              companyId: reservation.companyId,
                              agencyId: reservation.agencyId,
                            },
                          });
                        }}
                        className="flex-1 rounded-lg bg-white py-2 text-sm font-semibold"
                        style={{ borderColor: `${secondaryColor}4D`, color: secondaryColor }}
                      >
                        J’ai effectué le paiement
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>

            <div className="mt-4 text-sm text-gray-600">
              Une fois le paiement effectué, revenez dans l’application pour envoyer votre preuve.
            </div>
          </div>
        </div>
      )}

      {/* Ancien continue CTA : désactivé pour éviter redirections prématurées */}
      {selectedMethodKey && !walletModalKey && (
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4" />
      )}

      <ReservationStepHeader
        onBack={() => navigate(-1)}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        title={t('paymentStepTitle')}
        logoUrl={company.logoUrl}
      />

      <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4 -mt-2">
        {/* 3D floating route + price card */}
        <div
          className="relative bg-white rounded-2xl p-4 shadow-xl border"
          style={{
            borderColor: `${secondaryColor}4D`,
            boxShadow: `0 12px 25px rgba(0,0,0,0.15), 0 0 0 1px ${secondaryColor}4D`,
          }}
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="font-semibold text-gray-900">
                {formatCity(reservation.depart)} → {formatCity(reservation.arrivee)}
              </div>
              <div className="text-sm text-gray-500 mt-0.5">
                {formatSummaryDate(reservation.date, reservation.heure, language)}
              </div>
            </div>
            <div className="text-xl font-bold" style={{ color: primaryColor }}>
              {money(reservation.montant)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Wallet className="h-5 w-5 text-orange-500" />
          <p className="text-lg font-semibold text-slate-900">{t('paymentChooseMethod')}</p>
        </div>

        {/* Payment cards compact buttons (visual-only) */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
          {Object.entries(paymentMethods).map(([key, method]) => {
            const isSelected = selectedMethodKey === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  console.log('[PaymentMethodPage] card click payload', method);
                  setSelectedMethodKey(key);
                  handleSelectMethod(key);
                }}
                className={[
                  "inline-flex items-center justify-center gap-2",
                  "h-12 px-3 min-w-[92px] max-w-[140px]",
                  "rounded-xl border bg-white shadow-sm",
                  "transition active:scale-[0.98]",
                ].join(" ")}
                style={{
                  borderColor: isSelected ? primaryColor : `${secondaryColor}4D`,
                  boxShadow: isSelected
                    ? `0 8px 20px rgba(0,0,0,0.08), 0 0 0 1px ${primaryColor}`
                    : '0 6px 14px rgba(0,0,0,0.06)',
                  backgroundColor: isSelected ? `${secondaryColor}12` : 'white',
                }}
              >
                {method.logoUrl ? (
                  <LazyLoadImage
                    src={method.logoUrl}
                    alt={key}
                    className="h-7 w-7 object-contain shrink-0"
                    effect="opacity"
                  />
                ) : (
                  <span className="font-bold text-base" style={{ color: secondaryColor }}>
                    {key.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="text-xs font-semibold truncate">{key.replace(/_/g, ' ')}</span>
              </button>
            );
          })}
        </div>

        {Object.keys(paymentMethods).length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-4">
            Aucun moyen de paiement configuré. Contactez la compagnie.
          </p>
        )}
      </main>
    </div>
  );
}
