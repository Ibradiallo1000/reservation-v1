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
  const reservationIdFromPath = pathParts[1] === 'payment' ? pathParts[2] : undefined;
  const state = (location.state || {}) as {
    reservationId?: string;
    companyId?: string;
    agencyId?: string;
  };
  const reservationId = state.reservationId ?? reservationIdFromPath;
  const companyId = state.companyId;
  const agencyId = state.agencyId;

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
      // Resolve reservation (publicReservations gives companyId, agencyId)
      const pubRef = doc(db, 'publicReservations', reservationId);
      const pubSnap = await getDoc(pubRef);
      if (!pubSnap.exists()) {
        setError('Réservation introuvable.');
        setLoading(false);
        return;
      }
      const pub = pubSnap.data() as { companyId?: string; agencyId?: string; slug?: string };
      const cid = companyId ?? pub.companyId;
      const aid = agencyId ?? pub.agencyId;
      if (!cid || !aid) {
        setError('Réservation invalide.');
        setLoading(false);
        return;
      }
      if (pub.slug && pub.slug !== slug) {
        setError('Réservation introuvable.');
        setLoading(false);
        return;
      }

      const resRef = doc(db, 'companies', cid, 'agences', aid, 'reservations', reservationId);
      const resSnap = await getDoc(resRef);
      if (!resSnap.exists()) {
        setError('Réservation introuvable.');
        setLoading(false);
        return;
      }
      const r = resSnap.data() as Record<string, unknown>;
      const statut = (r.statut as string) || '';
      if (statut.toLowerCase() !== 'en_attente_paiement') {
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
      const normHeure = (v: unknown): string => toStr(v);
      setReservation({
        id: reservationId,
        companyId: cid,
        agencyId: aid,
        nomClient: toStr(r.nomClient),
        telephone: toStr(r.telephoneOriginal ?? r.telephone),
        depart: toStr(r.depart),
        arrivee: toStr(r.arrivee),
        date: normDate(r.date),
        heure: normHeure(r.heure),
        montant: Number(r.montant ?? r.montant_total ?? 0),
        seatsGo: Number(r.seatsGo ?? 1),
        statut: toStr(r.statut),
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

      const pmSnap = await getDocs(
        query(collection(db, 'paymentMethods'), where('companyId', '==', cid))
      );
      const pms: Record<string, PaymentMethodInfo> = {};
      pmSnap.forEach((d) => {
        const data = d.data() as Record<string, unknown>;
        const name = data.name as string;
        if (name) {
          pms[name] = {
            url: data.defaultPaymentUrl as string | undefined,
            logoUrl: data.logoUrl as string | undefined,
            ussdPattern: data.ussdPattern as string | undefined,
            merchantNumber: data.merchantNumber as string | undefined,
          };
        }
      });
      setPaymentMethods(pms);
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

  const handleSelectMethod = (key: string) => {
    if (!reservation || !company || !slug) return;
    const method = paymentMethods[key];
    if (!method) return;

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

    try {
      sessionStorage.setItem('reservationDraft', JSON.stringify(draft));
      sessionStorage.setItem('companyInfo', JSON.stringify(companyInfo));
    } catch { /* quota / private */ }

    const ussd = method.ussdPattern
      ?.replace('MERCHANT', method.merchantNumber || '')
      .replace('AMOUNT', String(reservation.montant));

    if (ussd) {
      try {
        sessionStorage.setItem('lastUssdCode', ussd);
      } catch { /* ignore */ }
      navigate(`/${slug}/upload-preuve/${reservation.id}`, {
        replace: false,
        state: { draft, companyInfo, paymentMethodKey: key },
      });
      window.location.href = `tel:${encodeURIComponent(ussd)}`;
      return;
    }

    navigate(`/${slug}/upload-preuve/${reservation.id}`, {
      replace: false,
      state: { draft, companyInfo, paymentMethodKey: key },
    });

    if (method.url) {
      try {
        new URL(method.url);
        window.open(method.url, '_blank', 'noopener,noreferrer');
      } catch {
        // ignore
      }
    }
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
                    {method.merchantNumber && (
                      <span className="text-sm text-gray-500">
                        ({t('paymentMerchantCode')}: <span className="font-mono">{method.merchantNumber}</span>)
                      </span>
                    )}
                  </div>
                  <div
                    className="flex items-center justify-center w-8 h-8 rounded-full text-white shadow-lg flex-shrink-0"
                    style={{ backgroundColor: secondaryColor }}
                  >
                    <Check className="w-4 h-4" />
                  </div>
                </button>
                {ussdCode && (
                  <a
                    href={`tel:${encodeURIComponent(ussdCode)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectMethod(key);
                    }}
                    className="flex items-center justify-center gap-2 mt-4 px-5 py-4 rounded-full text-white font-semibold shadow-[0_10px_25px_rgba(0,0,0,0.2)] active:scale-95 transition w-full"
                    style={{
                      background: `linear-gradient(to right, ${secondaryColor}, ${primaryColor})`,
                      boxShadow: `0 10px 25px ${secondaryColor}73`,
                    }}
                  >
                    <Phone className="w-5 h-5 flex-shrink-0" />
                    <span className="font-mono text-sm sm:text-base truncate max-w-[240px]">
                      {ussdCode}
                    </span>
                  </a>
                )}
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
