import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { db } from '@/firebaseConfig';
import { doc, getDoc, updateDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';
import { SectionCard } from '@/ui';
import { XCircle, Loader2, Info, Phone } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import ReservationStepHeader from '../components/ReservationStepHeader';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '@/utils/color';
import ErrorScreen from '@/shared/ui/ErrorScreen';
import LoadingScreen from '@/shared/ui/LoadingScreen';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';

// ===================== DEBUG / LOGGER =====================
const DEBUG = true;
const NS = '[UploadPreuvePage]';
const log = {
  info: (...args: any[]) => DEBUG && console.log(NS, ...args),
  warn: (...args: any[]) => DEBUG && console.warn(NS, ...args),
  error: (...args: any[]) => DEBUG && console.error(NS, ...args),
  group: (label: string) => DEBUG && console.group(`${NS} ${label}`),
  groupEnd: () => DEBUG && console.groupEnd(),
};
// =========================================================

interface ReservationDraft {
  agencyId: string;
  preuveMessage: string;
  id?: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  seatsGo: number;
  seatsReturn?: number;
  tripType: 'aller_simple' | 'aller_retour';
  montant: number;
  companyId?: string;
  companyName?: string;
  companySlug?: string;
  // ⚠️ On ne force pas referenceCode ici
  referenceCode?: string;
}

interface PaymentMethod {
  url?: string;
  logoUrl?: string;
  ussdPattern?: string;
  merchantNumber?: string;
}
interface PaymentMethods { [key: string]: PaymentMethod | null | undefined; }

interface CompanyInfo {
  couleurSecondaire: string | undefined;
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  couleurPrimaire?: string;
  logoUrl?: string;
  paymentMethods?: PaymentMethods;
  slug?: string;
}

interface UploadPreuvePageProps {
  /** When user returns via recovery, RouteResolver passes reservationId from URL (e.g. /:slug/upload-preuve/:reservationId) */
  reservationIdFromPath?: string;
}

const UploadPreuvePage: React.FC<UploadPreuvePageProps> = ({ reservationIdFromPath }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const language = i18n.language?.startsWith('en') ? 'en' : 'fr';
  const location = useLocation();
  const { slug } = useParams<{ slug: string; id?: string }>();
  const isOnline = useOnlineStatus();

  // Récup context navigation si présent (depuis PaymentMethodPage ou autre)
  const { draft: locationDraft, companyInfo: locationCompanyInfo, paymentMethodKey: statePaymentMethodKey } = (location.state as any) || {};
  const reservationId = reservationIdFromPath;

  // States UI / data
  const [reservationDraft, setReservationDraft] = useState<ReservationDraft | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [transactionReference, setTransactionReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ======= Chargement initial (location.state > sessionStorage > Firestore by reservationId) =======
  const loadInitialData = useCallback(async () => {
    log.group('loadInitialData');
    try {
      setLoadingData(true);
      setError(null);

      let parsedCompanyInfo: CompanyInfo | null = null;

      // 1) Depuis location.state (navigation directe depuis PaymentMethodPage)
      if (locationDraft && locationCompanyInfo) {
        log.info('Init from location.state');
        parsedCompanyInfo = locationCompanyInfo;
        setReservationDraft(locationDraft);
        if (statePaymentMethodKey) setPaymentMethod(statePaymentMethodKey);
      } else {
        // 2) Depuis sessionStorage (cas de refresh page, tab restée ouverte)
        const savedDraft = sessionStorage.getItem('reservationDraft');
        const savedCompanyInfo = sessionStorage.getItem('companyInfo');
        log.info('Init from sessionStorage', { hasDraft: !!savedDraft, hasCompany: !!savedCompanyInfo });

        if (savedDraft && savedCompanyInfo) {
          const parsedDraft = JSON.parse(savedDraft) as ReservationDraft;
          parsedCompanyInfo = JSON.parse(savedCompanyInfo) as CompanyInfo;
          if (!parsedDraft?.depart || !parsedDraft?.arrivee) {
            throw new Error('Données de réservation incomplètes');
          }
          setReservationDraft(parsedDraft);
        } else if (reservationId && slug) {
          // 3) Depuis Firestore par reservationId (retour après USSD / reload)
          log.info('Init from Firestore by reservationId', { reservationId });
          const pubRef = doc(db, 'publicReservations', reservationId);
          const pubSnap = await getDoc(pubRef);
          if (!pubSnap.exists()) {
            throw new Error('Réservation introuvable');
          }
          const pub = pubSnap.data() as { companyId?: string; agencyId?: string; slug?: string };
          const companyId = pub.companyId;
          const agencyId = pub.agencyId;
          const companySlug = pub.slug || slug;
          if (!companyId || !agencyId) {
            throw new Error('Données de réservation incomplètes');
          }
          const resRef = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);
          const resSnap = await getDoc(resRef);
          if (!resSnap.exists()) {
            throw new Error('Réservation introuvable');
          }
          const resData = resSnap.data() as Record<string, unknown>;
          const statut = ((resData.statut as string) || '').toLowerCase();
          if (statut !== 'en_attente_paiement') {
            throw new Error(statut === 'confirme' || statut === 'preuve_recue' ? 'Cette réservation a déjà été traitée.' : 'Cette réservation n\'est plus en attente de preuve.');
          }
          const companyRef = doc(db, 'companies', companyId);
          const companySnap = await getDoc(companyRef);
          if (!companySnap.exists()) {
            throw new Error('Compagnie introuvable');
          }
          const companyData = companySnap.data() as Record<string, unknown>;
          const draft: ReservationDraft = {
            id: reservationId,
            agencyId,
            companyId,
            companySlug,
            companyName: (companyData.nom as string) || (companyData.name as string) || 'Compagnie',
            nomClient: (resData.nomClient as string) || '',
            telephone: (resData.telephone as string) || '',
            depart: (resData.depart as string) || '',
            arrivee: (resData.arrivee as string) || '',
            date: (resData.date as string) || '',
            heure: (resData.heure as string) || '',
            seatsGo: typeof resData.seatsGo === 'number' ? resData.seatsGo : 1,
            seatsReturn: 0,
            tripType: 'aller_simple',
            montant: typeof resData.montant === 'number' ? resData.montant : 0,
            preuveMessage: '',
          };
          setReservationDraft(draft);
          parsedCompanyInfo = {
            id: companyId,
            name: (companyData.nom as string) || (companyData.name as string) || 'Compagnie',
            primaryColor: (companyData.primaryColor as string) || (companyData.couleurPrimaire as string),
            secondaryColor: (companyData.couleurSecondaire as string),
            couleurPrimaire: (companyData.couleurPrimaire as string),
            couleurSecondaire: (companyData.couleurSecondaire as string),
            logoUrl: (companyData.logoUrl as string) || '',
            slug: (companyData.slug as string) || companySlug,
          };
        } else {
          throw new Error('Aucune donnée de réservation valide trouvée');
        }
      }

      // 3) Paiements + styles compagnie
      if (parsedCompanyInfo?.id) {
        const paymentSnap = await getDocs(
          query(collection(db, 'paymentMethods'), where('companyId', '==', parsedCompanyInfo.id))
        );

        const methods: PaymentMethods = {};
        paymentSnap.forEach((docSnap) => {
          const data = docSnap.data();
          if (data.name) {
            methods[data.name] = {
              logoUrl: data.logoUrl || '',
              url: data.defaultPaymentUrl || '',
              ussdPattern: data.ussdPattern || '',
              merchantNumber: data.merchantNumber || '',
            };
          }
        });
        log.info('Payment methods', Object.keys(methods));

        const companyRef = doc(db, 'companies', parsedCompanyInfo.id);
        const snap = await getDoc(companyRef);

        if (snap.exists()) {
          const companyData = snap.data() as any;
          setCompanyInfo({
            ...parsedCompanyInfo,
            paymentMethods: methods,
            primaryColor: companyData.primaryColor || companyData.couleurPrimaire || '#3b82f6',
            secondaryColor: companyData.secondaryColor || companyData.couleurSecondaire || '#93c5fd',
            logoUrl: companyData.logoUrl || '',
          });
          log.info('Company info merged', { styles: { primary: companyData.couleurPrimaire, secondary: companyData.couleurSecondaire } });
          return;
        } else {
          throw new Error('Compagnie introuvable dans Firestore');
        }
      }

      throw new Error('Impossible de récupérer les infos de la compagnie');
    } catch (error) {
      log.error('loadInitialData error', error);
      setError(error instanceof Error ? error.message : 'Erreur inconnue');
    } finally {
      setLoadingData(false);
      log.groupEnd();
    }
  }, [locationDraft, locationCompanyInfo, statePaymentMethodKey, reservationId, slug]);

  useEffect(() => { loadInitialData(); }, [loadInitialData]);

  const handleSubmitProof = async () => {
    if (!transactionReference.trim()) return;
    if (!reservationDraft || !reservationDraft.id) {
      setError('Réservation introuvable.');
      return;
    }

    setUploading(true);
    setError(null);
    log.group('handleSubmitProof');

    try {
      const reservationRef = doc(
        db,
        'companies',
        reservationDraft.companyId!,
        'agences',
        reservationDraft.agencyId!,
        'reservations',
        reservationDraft.id!
      );
      const docSnap = await getDoc(reservationRef);
      if (!docSnap.exists()) {
        setError('Réservation introuvable.');
        return;
      }
      const data = docSnap.data() as Record<string, unknown>;
      const currentStatut = ((data.statut as string) || '').toLowerCase();
      if (currentStatut !== 'en_attente_paiement') {
        setError('Cette réservation a expiré ou a déjà été traitée.');
        return;
      }

      const trimmed = transactionReference.trim();
      await updateDoc(reservationRef, {
        statut: 'preuve_recue',
        preuveMessage: trimmed,
        paymentReference: trimmed,
        transactionReference: trimmed,
        ...(paymentMethod ? { preuveVia: paymentMethod } : {}),
        proofSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      sessionStorage.removeItem('reservationDraft');
      sessionStorage.removeItem('companyInfo');
      sessionStorage.removeItem('lastUssdCode');
      try { localStorage.removeItem('pendingReservation'); } catch {}
      log.info('Proof submitted → redirect to receipt');
      navigate(`/${reservationDraft.companySlug || slug}/receipt/${reservationDraft.id}`, { replace: true });
    } catch (err) {
      log.error('handleSubmitProof error', err);
      setError('Une erreur est survenue lors de l\'envoi.');
    } finally {
      setUploading(false);
      log.groupEnd();
    }
  };

  // ======= RENDUS UI =======
  if (loadingData) {
    const themeConfig = {
      colors: {
        primary: companyInfo?.couleurPrimaire || '#3b82f6',
        text: companyInfo?.couleurPrimaire ? safeTextColor(companyInfo.couleurPrimaire) : '#ffffff',
        background: '#f9fafb'
      }
    };
    return <LoadingScreen colors={themeConfig.colors} />;
  }

  if (!reservationDraft || !companyInfo) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <SectionCard title="Impossible de charger les données" icon={XCircle} className="max-w-md w-full shadow-md">
          <p className="text-sm text-gray-600 mb-4">
            {error || "Une erreur est survenue pendant le chargement."}
          </p>
          {!isOnline && (
            <p className="text-xs text-amber-700 mb-4">
              Connexion indisponible. Vérifiez le réseau puis réessayez.
            </p>
          )}
          <p className="text-xs text-gray-500 mb-4">Réessayez ou retournez à l'accueil pour reprendre votre réservation.</p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={loadInitialData}
              className="w-full px-4 py-3 rounded-lg font-medium text-white hover:opacity-95"
              style={{ backgroundColor: companyInfo?.couleurPrimaire || '#3b82f6' }}
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={() => navigate(`/${slug || ''}`)}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              Retour
            </button>
          </div>
        </SectionCard>
      </div>
    );
  }

  const themeConfig = {
    colors: {
      primary: companyInfo.primaryColor || companyInfo.couleurPrimaire || '#3b82f6',
      secondary: companyInfo.secondaryColor || companyInfo.couleurSecondaire || '#93c5fd',
      text: companyInfo.primaryColor ? safeTextColor(companyInfo.primaryColor) : '#ffffff',
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {!isOnline && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            Connexion instable: l’envoi de la preuve peut échouer.
          </div>
        </div>
      )}
      <ReservationStepHeader
        onBack={() => navigate(-1)}
        primaryColor={themeConfig.colors.primary}
        secondaryColor={themeConfig.colors.secondary}
        title={t('uploadProofStepTitle')}
        subtitle={reservationDraft ? `${reservationDraft.depart} → ${reservationDraft.arrivee}` : undefined}
        logoUrl={companyInfo.logoUrl}
      />

      <main className="max-w-4xl mx-auto px-4 py-6 pb-24 -mt-2 space-y-6">
        <p className="text-sm text-center px-2" style={{ color: themeConfig.colors.primary }}>
          Si vous venez d&apos;effectuer le paiement, merci d&apos;envoyer votre preuve pour finaliser la réservation.
        </p>
        {typeof window !== 'undefined' && sessionStorage.getItem('lastUssdCode') && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                const code = sessionStorage.getItem('lastUssdCode');
                if (code) window.location.href = `tel:${encodeURIComponent(code)}`;
              }}
              className="inline-flex items-center gap-2 rounded-xl border-2 py-2 px-4 text-sm font-medium transition hover:bg-gray-50 active:scale-[0.98]"
              style={{ borderColor: `${themeConfig.colors.secondary}99`, color: themeConfig.colors.primary }}
            >
              <Phone className="w-4 h-4" aria-hidden />
              Recomposer le code USSD
            </button>
          </div>
        )}
        {/* 3D floating route summary card */}
        <div
          className="relative bg-white rounded-2xl p-4 shadow-xl border"
          style={{
            borderColor: `${themeConfig.colors.secondary}4D`,
            boxShadow: '0 12px 25px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-gray-900">
                {reservationDraft.depart} → {reservationDraft.arrivee}
              </div>
              <div className="text-sm text-gray-600 mt-1">
                {formatDateDepart(reservationDraft.date, reservationDraft.heure, language)}
              </div>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-sm text-gray-500">
                {reservationDraft.seatsGo === 1 ? '1 place' : `${reservationDraft.seatsGo} places`}
              </span>
              <span className="text-xl font-bold" style={{ color: themeConfig.colors.primary }}>
                {money(reservationDraft.montant)}
              </span>
            </div>
          </div>
        </div>

        {/* Payment details premium card */}
        <div
          className="mt-6 bg-white rounded-2xl p-5 shadow-xl border transition hover:shadow-2xl"
          style={{ borderColor: `${themeConfig.colors.secondary}33` }}
        >
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Info className="w-5 h-5" style={{ color: themeConfig.colors.primary }} />
            {t('paymentDetails')}
          </h2>
          <p className="text-sm text-gray-600 mt-2">
            {t('paymentDetailsInstruction')}
          </p>
          <label className="block text-sm font-medium text-gray-700 mt-4">{t('transactionReference')} *</label>
          <textarea
            required
            placeholder="Paiement MTN Mobile Money - Réf : SX8T9K - 05/07/2024"
            value={transactionReference}
            onChange={(e) => setTransactionReference(e.target.value)}
            className="w-full mt-3 rounded-xl border p-4 focus:ring-2 focus:outline-none min-h-[120px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)]"
            style={{
              borderColor: `${themeConfig.colors.secondary}66`,
            }}
          />
          {error && <ErrorDisplay error={error} />}

          <button
            type="button"
            disabled={uploading || !transactionReference.trim()}
            onClick={handleSubmitProof}
            className={`mt-6 w-full py-4 rounded-full font-semibold active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
              transactionReference.trim() && !uploading ? 'text-white' : 'bg-gray-300 text-gray-500'
            }`}
            style={
              transactionReference.trim() && !uploading
                ? {
                    background: `linear-gradient(to right, ${themeConfig.colors.secondary}, ${themeConfig.colors.primary})`,
                    boxShadow: `0 10px 25px ${themeConfig.colors.secondary}66`,
                  }
                : undefined
            }
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin inline" />
                {t('sendingProof')}
              </span>
            ) : (
              t('sendPaymentProof')
            )}
          </button>
        </div>
      </main>
    </div>
  );
};

/** Date with locale: FR "4 mars 2026 à 05:00", EN "March 4, 2026 at 05:00" */
function formatDateDepart(dateStr: string, heureStr: string, language: string): string {
  try {
    if (!dateStr || !heureStr) return `${dateStr ?? ''} ${heureStr ?? ''}`.trim();
    const d = parseISO(`${dateStr}T${heureStr}:00`);
    const isFr = language === 'fr';
    if (isFr) {
      const datePart = format(d, 'd MMMM yyyy', { locale: fr }).toLowerCase();
      const timePart = format(d, 'HH:mm');
      return `${datePart} à ${timePart}`;
    }
    return format(d, "d MMMM yyyy 'at' HH:mm", { locale: enUS });
  } catch {
    return language === 'fr' ? `${dateStr} à ${heureStr}` : `${dateStr} at ${heureStr}`;
  }
}

const ErrorDisplay: React.FC<{ error: string }> = ({ error }) => (
  <div className="border-l-4 p-4 rounded-lg" style={{ backgroundColor: hexToRgba('#ef4444', 0.05), borderColor: '#ef4444' }}>
    <div className="flex items-start gap-3">
      <XCircle className="h-5 w-5 mt-0.5" style={{ color: '#ef4444' }} />
      <p className="text-sm" style={{ color: '#991b1b' }}>{error}</p>
    </div>
  </div>
);

export default UploadPreuvePage;
