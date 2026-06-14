// Step 2 — Payment method selection (after reservation created)
import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { Check, Phone } from 'lucide-react';
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

  const load = useCallback(async () => {
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
          console.log('[PaymentMethodPage] methodDoc', {
            methodId,
            raw: m,
          });
          const name = String(m.name ?? methodId);

          const legacyUssdTemplate = (m.ussdTemplate ?? m.ussdPattern ?? '') as string | undefined;
          const legacyMerchantNumber = String(cfg.merchantCode ?? m.merchantNumber ?? '');
          const legacyPhoneNumber = (cfg.phoneNumber ?? m.phoneNumber ?? cfg.merchantCode ?? '') as string | undefined;

          pms[name] = {
            url: m.defaultPaymentUrl as string | undefined,
            logoUrl: m.logoUrl as string | undefined,
            ussdPattern: legacyUssdTemplate,
            merchantNumber: legacyMerchantNumber,
          };

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
    console.log('[PaymentMethodPage] available payment methods', paymentMethods);
    if (!reservation || !company || !slug) return;
    const method = paymentMethods[key];
    console.log('[PaymentMethodPage] selected payment method', method);
    if (!method) return;

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

    // Determine method type based on global data (we only stored ussdPattern + merchantNumber + url)
    const isUssd = Boolean(method.ussdPattern);
    const isPaymentLink = Boolean(method.url) && !isUssd;

    // We can't reliably detect wallet_number with current PaymentMethodInfo shape.
    // Heuristic: if url absent but merchantNumber exists and no ussdPattern => wallet number.
    const isWalletNumber = !isUssd && !isPaymentLink && Boolean(method.merchantNumber);

    // 1) USSD: call tel: first, then show continue CTA (no immediate redirect)
    if (isUssd) {
      try {
        if (finalUssdCode) sessionStorage.setItem('lastUssdCode', finalUssdCode);
      } catch {
        /* ignore */
      }
      window.location.href = `tel:${encodeURIComponent(finalUssdCode)}`;

      // Mark selected method locally; UI will render continue button
      setSelectedMethodKey(key);
      return;
    }

    // 2) wallet_number: show modal with number + instructions + 'J’ai effectué le paiement'
    if (isWalletNumber) {
      setSelectedMethodKey(key);
      setShowInstructionsModal(true);
      return;
    }

    // 3) payment_link: open link then show continue CTA
    if (isPaymentLink) {
      if (method.url) {
        try {
          new URL(method.url);
          window.open(method.url, '_blank', 'noopener,noreferrer');
        } catch {
          // ignore
        }
      }
      setSelectedMethodKey(key);
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
      {/* USSD / Wallet confirmations (temp): continue CTA */}
      {selectedMethodKey && (
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4">
          {paymentMethods[selectedMethodKey]?.ussdPattern ? null : (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-sm font-semibold text-gray-900">Paiement effectué ?</div>
              <div className="mt-2 text-sm text-gray-600">
                Une fois le paiement réalisé, continuez vers l’envoi de la preuve.
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!reservation || !selectedMethodKey) return;
                  const uploadPreuvePath = pathBase
                    ? `/${pathBase}/upload-preuve/${reservation.id}`
                    : `/upload-preuve/${reservation.id}`;

                  navigate(uploadPreuvePath, {
                    replace: false,
                    state: {
                      // minimal state: on laisse UploadPreuvePage redéduire si nécessaire
                      paymentMethodKey: selectedMethodKey,
                      companyId: reservation.companyId,
                      agencyId: reservation.agencyId,
                    },
                  });
                }}
                className="mt-3 w-full flex justify-center py-3 px-4 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: primaryColor }}
              >
                Continuer vers l’envoi de preuve
              </button>
            </div>
          )}
        </div>
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

        <p className="text-gray-700 font-medium">{t('paymentChooseMethod')}</p>

        {/* Payment cards: single row [Logo] Name (Code marchand: xxx) [✓] + USSD code button */}
        <div className="space-y-4">
          {Object.entries(paymentMethods).map(([key, method]) => {
            const ussdCode = method.ussdPattern
              ? method.ussdPattern
                  .replace('MERCHANT', method.merchantNumber || '')
                  .replace('AMOUNT', String(reservation.montant))
              : '';
            const isSelected = selectedMethodKey === key;
            return (
              <div
                key={key}
                className="relative rounded-2xl bg-white shadow-xl border p-4 transition hover:shadow-2xl"
                style={{
                  borderColor: `${secondaryColor}4D`,
                  boxShadow: '0 12px 25px rgba(0,0,0,0.15)',
                  ...(isSelected
                    ? {
                        boxShadow: `0 0 25px ${secondaryColor}59, 0 12px 25px rgba(0,0,0,0.15)`,
                        outline: `2px solid ${secondaryColor}`,
                        outlineOffset: 2,
                      }
                    : {}),
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedMethodKey(key);
                    handleSelectMethod(key);
                  }}
                  className="w-full flex items-center gap-3 text-left focus:outline-none"
                >
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-xl bg-gray-50 overflow-hidden">
                    {method.logoUrl ? (
                      <LazyLoadImage
                        src={method.logoUrl}
                        alt={key}
                        className="h-10 w-10 object-contain"
                        effect="opacity"
                      />
                    ) : (
                      <span className="font-bold text-lg" style={{ color: secondaryColor }}>
                        {key.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center flex-wrap gap-x-2 gap-y-0">
                    <span className="text-lg font-semibold text-gray-900 capitalize">
                      {key.replace(/_/g, ' ')}
                    </span>
                    {method.ussdPattern ? (
                      <span className="text-sm text-gray-500">Paiement USSD</span>
                    ) : null}
                    {!method.ussdPattern && method.merchantNumber ? (
                      <span className="text-sm text-gray-500">Mobile Money</span>
                    ) : null}
                  </div>
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full text-white shadow-lg flex-shrink-0"
                    style={{ backgroundColor: secondaryColor }}
                  >
                    <Check className="w-4 h-4" />
                  </div>
                </button>
                {/* USSD: on déclenche le tel: dans handleSelectMethod (pas de redirection upload-preuve immédiate). */}
                {ussdCode && null}
              </div>
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
