import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import { db } from '@/firebaseConfig';
import { doc, updateDoc, serverTimestamp, setDoc, getDoc } from 'firebase/firestore';
import {
  clearPendingReservation,
  fetchReservationFromNestedPath,
  readPendingReservationPointer,
  reservationExpiresAtMs,
} from '../utils/pendingReservation';
import { SectionCard } from '@/ui';
import { XCircle, Loader2, Info, Phone } from 'lucide-react';
import ReservationStepHeader from '../components/ReservationStepHeader';
import { getPublicPathBase, getSlugFromSubdomain } from '../utils/subdomain';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '@/utils/color';
import LoadingScreen from '@/shared/ui/LoadingScreen';
import { format, parseISO } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { getDisplayPhone } from '@/utils/phoneUtils';
import { ensurePendingOnlinePaymentFromReservation } from '@/services/paymentService';
import { isReservationAwaitingPayment } from '../utils/onlineReservationStatus';
import {
  enrichPublicCompanyForUploadPreuve,
  loadPublicCompanyInfoSessionThenFirestore,
} from '../utils/loadPublicCompanyInfo';
import { toast } from 'sonner';

const DEBUG = typeof import.meta !== 'undefined' ? Boolean(import.meta.env?.DEV) : false;
const NS = '[UploadPreuvePage]';
const log = {
  info: (...args: unknown[]) => DEBUG && console.log(NS, ...args),
  warn: (...args: unknown[]) => DEBUG && console.warn(NS, ...args),
  error: (...args: unknown[]) => DEBUG && console.error(NS, ...args),
  group: (label: string) => DEBUG && console.group(`${NS} ${label}`),
  groupEnd: () => DEBUG && console.groupEnd(),
};

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
  referenceCode?: string;
}

interface PaymentMethod {
  url?: string;
  logoUrl?: string;
  ussdPattern?: string;
  merchantNumber?: string;
}

interface PaymentMethods {
  [key: string]: PaymentMethod | null | undefined;
}

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

type ParsedPaymentSMS = {
  amount: number | null;
  transactionId: string | null;
  success: boolean;
};

type SmsValidationLevel = 'valid' | 'suspicious' | 'invalid' | null;

interface UploadPreuvePageProps {
  reservationIdFromPath?: string;
}

function extractFirestoreErrorCode(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    return String((err as { code?: unknown }).code ?? '');
  }
  return '';
}

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
  <div
    className="border-l-4 p-4 rounded-lg"
    style={{ backgroundColor: hexToRgba('#ef4444', 0.05), borderColor: '#ef4444' }}
  >
    <div className="flex items-start gap-3">
      <XCircle className="h-5 w-5 mt-0.5" style={{ color: '#ef4444' }} />
      <p className="text-sm" style={{ color: '#991b1b' }}>
        {error}
      </p>
    </div>
  </div>
);

const UploadPreuvePage: React.FC<UploadPreuvePageProps> = ({ reservationIdFromPath }) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const language = i18n.language?.startsWith('en') ? 'en' : 'fr';
  const location = useLocation();
  const { slug, id: idParam } = useParams<{ slug?: string; id?: string }>();
  const isOnline = useOnlineStatus();

  const locationState = (location.state || {}) as {
    draft?: ReservationDraft;
    paymentMethodKey?: string;
    companyId?: string;
    agencyId?: string;
  };

  const { draft: locationDraft, paymentMethodKey: statePaymentMethodKey } = locationState;
  const reservationId = reservationIdFromPath ?? idParam;

  const [reservationDraft, setReservationDraft] = useState<ReservationDraft | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [smsText, setSmsText] = useState('');
  const [parsed, setParsed] = useState<ParsedPaymentSMS | null>(null);
  const [validation, setValidation] = useState<SmsValidationLevel>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitInFlightRef = useRef(false);
  const [loadErrorKind, setLoadErrorKind] = useState<
    'expired' | 'not_found' | 'invalid' | 'other' | null
  >(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 3;

  const parsePaymentSMS = useCallback((text: string): ParsedPaymentSMS => {
    const raw = String(text || '');
    const amountMatch = raw.match(/(\d+)\s*FCFA/i);
    const transactionMatch = raw.match(/ID\s*:\s*([A-Z0-9.-]+)/i);
    const success = /succes/i.test(raw);

    return {
      amount: amountMatch ? Number(amountMatch[1]) : null,
      transactionId: transactionMatch ? String(transactionMatch[1]) : null,
      success,
    };
  }, []);

  const validateSMS = useCallback(
    (
      smsParsed: ParsedPaymentSMS,
      reservation: { payment?: { totalAmount?: number }; montant?: number }
    ): SmsValidationLevel => {
      const expectedAmount = Number(reservation?.payment?.totalAmount ?? reservation?.montant ?? 0);

      if (!smsParsed.success) return 'invalid';
      if (smsParsed.amount == null) return 'invalid';
      if (smsParsed.amount !== expectedAmount) return 'invalid';
      if (!smsParsed.transactionId) return 'suspicious';

      return 'valid';
    },
    []
  );

  useEffect(() => {
    const trimmed = smsText.trim();

    if (!trimmed || !reservationDraft) {
      setParsed(null);
      setValidation(null);
      return;
    }

    const smsParsed = parsePaymentSMS(trimmed);
    setParsed(smsParsed);
    setValidation(
      validateSMS(smsParsed, {
        payment: { totalAmount: reservationDraft.montant },
        montant: reservationDraft.montant,
      })
    );
  }, [smsText, reservationDraft, parsePaymentSMS, validateSMS]);

  const loadInitialData = useCallback(async () => {
    log.group('loadInitialData');

    try {
      setLoadingData(true);
      setError(null);
      setLoadErrorKind(null);
      setCompanyInfo(null);

      let resolvedDraft: ReservationDraft;

      if (reservationId) {
        if (statePaymentMethodKey) setPaymentMethod(statePaymentMethodKey);

        const pending = readPendingReservationPointer();
        const companyId =
          locationState.companyId ?? pending?.companyId ?? locationDraft?.companyId;
        const agencyId = locationState.agencyId ?? pending?.agencyId ?? locationDraft?.agencyId;

        if (!companyId || !agencyId) {
          const pathBase = getPublicPathBase(slug || '');
          navigate(pathBase ? `/${pathBase}/retrouver-reservation` : '/retrouver-reservation', {
            replace: true,
          });
          return;
        }

        log.info('Init from nested Firestore', { reservationId, companyId, agencyId });
        const snapshot = await fetchReservationFromNestedPath(db, companyId, agencyId, reservationId);

        if (!snapshot) {
          setLoadErrorKind('not_found');
          setError('Réservation introuvable.');
          clearPendingReservation();
          return;
        }

        const expMs = reservationExpiresAtMs(snapshot);
        if (expMs != null && Date.now() > expMs) {
          setLoadErrorKind('expired');
          setError('Votre réservation a expiré.');
          clearPendingReservation();
          return;
        }

        if (!isReservationAwaitingPayment(snapshot.status)) {
          setLoadErrorKind('invalid');
          setError("Cette réservation n'est plus disponible.");
          clearPendingReservation();
          return;
        }

        const companySlug =
          (snapshot.companySlug as string) || (snapshot.slug as string) || slug || '';

        resolvedDraft = {
          id: reservationId,
          agencyId,
          companyId,
          companySlug,
          companyName: (snapshot.companyName as string) || 'Compagnie',
          nomClient: (snapshot.nomClient as string) || '',
          telephone: getDisplayPhone(
            snapshot as { telephoneOriginal?: string | null; telephone?: string | null }
          ),
          depart: (snapshot.depart as string) || '',
          arrivee: (snapshot.arrivee as string) || '',
          date: (snapshot.date as string) || '',
          heure: (snapshot.heure as string) || '',
          seatsGo: typeof snapshot.seatsGo === 'number' ? snapshot.seatsGo : 1,
          seatsReturn: 0,
          tripType: 'aller_simple',
          montant: typeof snapshot.montant === 'number' ? snapshot.montant : 0,
          preuveMessage: '',
          referenceCode: (snapshot.referenceCode as string) || undefined,
        };
      } else if (locationDraft?.companyId && locationDraft?.agencyId && locationDraft.id) {
        log.info('Init sans id d’URL (brouillon navigation uniquement)');
        resolvedDraft = {
          ...locationDraft,
          preuveMessage: locationDraft.preuveMessage ?? '',
        };
        if (statePaymentMethodKey) setPaymentMethod(statePaymentMethodKey);
      } else {
        setLoadErrorKind('not_found');
        setError('Réservation introuvable.');
        return;
      }

      const companyId = resolvedDraft.companyId!;
      const loaded = await loadPublicCompanyInfoSessionThenFirestore(companyId);

      if (!loaded.ok) {
        setLoadErrorKind('other');
        throw new Error(loaded.message);
      }

      const enriched = await enrichPublicCompanyForUploadPreuve(loaded.info);

      setCompanyInfo({
        couleurSecondaire: enriched.couleurSecondaire ?? enriched.secondaryColor,
        id: enriched.id,
        name: enriched.name,
        primaryColor: enriched.primaryColor,
        secondaryColor: enriched.secondaryColor,
        couleurPrimaire: enriched.couleurPrimaire ?? enriched.primaryColor,
        logoUrl: enriched.logoUrl,
        paymentMethods: enriched.paymentMethods as PaymentMethods,
        slug: enriched.slug,
      });

      setReservationDraft(resolvedDraft);
      log.info('Payment methods', Object.keys(enriched.paymentMethods ?? {}));
    } catch (err) {
      log.error('loadInitialData error', err);
      setCompanyInfo(null);
      setLoadErrorKind((prev) => prev ?? 'other');
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoadingData(false);
      log.groupEnd();
    }
  }, [
    locationDraft,
    statePaymentMethodKey,
    reservationId,
    slug,
    locationState.companyId,
    locationState.agencyId,
    navigate,
  ]);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  useEffect(() => {
    if (!DEBUG || loadingData || !reservationDraft || !companyInfo) return;
    log.info('companyInfo', companyInfo);
    log.info('paymentMethods', companyInfo.paymentMethods ?? {});
    log.info('reservation', reservationDraft);
  }, [loadingData, reservationDraft, companyInfo]);

  const handleSubmitProof = async () => {
  if (submitInFlightRef.current || uploading || !smsText.trim() || validation === 'invalid') return;

  if (!reservationDraft || !reservationDraft.id || !reservationDraft.companyId || !reservationDraft.agencyId) {
    setError('Réservation introuvable.');
    return;
  }

  submitInFlightRef.current = true;
  setUploading(true);
  setError(null);
  retryCountRef.current = 0;
  log.group('handleSubmitProof');

  const submitWithRetry = async (retryCount: number): Promise<void> => {
    try {
      const trimmed = smsText.trim();
      const parsedForSave = parsed ?? parsePaymentSMS(trimmed);
      const level: Exclude<SmsValidationLevel, null> =
        validation === 'valid'
          ? 'valid'
          : validation === 'suspicious'
            ? 'suspicious'
            : 'invalid';

      const paymentStatus = validation === 'valid' ? 'auto_detected' : 'declared_paid';

      // 1. Sauvegarder dans publicReservations (pour le client)
      const publicReservationRef = doc(db, 'publicReservations', reservationDraft.id!);
      
      await setDoc(publicReservationRef, {
        status: 'payé',
        preuveMessage: trimmed,
        paymentReference: parsedForSave.transactionId || null,
        transactionReference: parsedForSave.transactionId || null,
        preuveVia: paymentMethod || '',
        paymentMethod: paymentMethod || '',
        amount: reservationDraft.montant,
        payment: {
          smsText: trimmed,
          parsed: parsedForSave,
          validationLevel: level,
          status: paymentStatus,
          totalAmount: reservationDraft.montant,
        },
        updatedAt: serverTimestamp(),
        proofSubmittedAt: serverTimestamp(),
        reservationId: reservationDraft.id,
        companyId: reservationDraft.companyId,
        agencyId: reservationDraft.agencyId,
        nomClient: reservationDraft.nomClient,
        telephone: reservationDraft.telephone,
        depart: reservationDraft.depart,
        arrivee: reservationDraft.arrivee,
        date: reservationDraft.date,
        heure: reservationDraft.heure,
        seatsGo: reservationDraft.seatsGo,
        montant: reservationDraft.montant,
      }, { merge: true });

      // 2. CRITIQUE: Mettre à jour la réservation originale pour l'opérateur digital
      // Utiliser une approche avec retry spécifique pour les permissions
      const reservationRef = doc(
        db,
        'companies',
        reservationDraft.companyId!,
        'agences',
        reservationDraft.agencyId,
        'reservations',
        reservationDraft.id!
      );
      
      // Essayer plusieurs fois avec un délai
      let reservationUpdateSuccess = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await updateDoc(reservationRef, {
            status: 'payé',
            statut: 'payé',
            preuveMessage: trimmed,
            paymentReference: parsedForSave.transactionId || null,
            transactionReference: parsedForSave.transactionId || null,
            preuveVia: paymentMethod || '',
            paymentStatus: paymentStatus,
            proofSubmittedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          reservationUpdateSuccess = true;
          log.info('Réservation originale mise à jour avec succès');
          break;
        } catch (updateError: any) {
          log.warn(`Tentative ${attempt + 1}/3 échouée:`, updateError?.code);
          if (attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
          }
        }
      }
      
      if (!reservationUpdateSuccess) {
        // Si la mise à jour échoue, créer un document de notification pour l'opérateur
        const notificationRef = doc(db, 'companies', reservationDraft.companyId!, 'pendingProofs', reservationDraft.id!);
        await setDoc(notificationRef, {
          reservationId: reservationDraft.id,
          preuveMessage: trimmed,
          transactionId: parsedForSave.transactionId,
          amount: reservationDraft.montant,
          createdAt: serverTimestamp(),
          needsReview: true,
        }, { merge: true });
        log.info('Notification créée pour l\'opérateur');
      }

      clearPendingReservation();

      try {
        sessionStorage.removeItem('lastUssdCode');
      } catch {
        // ignore
      }

      // Synchronisation avec le système de paiement (optionnel)
      try {
        const ensure = await ensurePendingOnlinePaymentFromReservation({
          companyId: reservationDraft.companyId!,
          agencyId: reservationDraft.agencyId,
          reservationId: reservationDraft.id!,
          montant: reservationDraft.montant,
          paymentMethodLabel: paymentMethod,
        });

        if (!ensure.ok) {
          log.warn('ensurePendingOnlinePaymentFromReservation', ensure.error);
        }
      } catch (secondaryErr) {
        log.warn('ensurePendingOnlinePaymentFromReservation failed', secondaryErr);
      }

      log.info('Proof submitted successfully → redirect to receipt');

      const pathBase = getPublicPathBase(
        reservationDraft.companySlug || getSlugFromSubdomain() || slug || ''
      );

      navigate(
        pathBase
          ? `/${pathBase}/receipt/${reservationDraft.id}`
          : `/receipt/${reservationDraft.id}`,
        {
          replace: true,
          state: {
            companyId: reservationDraft.companyId,
            agencyId: reservationDraft.agencyId,
          },
        }
      );
      
    } catch (err) {
      log.error('handleSubmitProof error', err);
      
      const code = extractFirestoreErrorCode(err);
      const errorMessage = err instanceof Error ? err.message : '';
      const isRateLimit = code === 'resource-exhausted' || 
                         errorMessage.includes('429') ||
                         errorMessage.includes('Too Many Requests');
      
      if (isRateLimit && retryCount < MAX_RETRIES) {
        const delay = Math.pow(2, retryCount) * 1000;
        log.info(`Rate limit, retry ${retryCount + 1}/${MAX_RETRIES} in ${delay}ms`);
        setError(`Le serveur est occupé, tentative ${retryCount + 1}/${MAX_RETRIES}...`);
        
        setTimeout(async () => {
          await submitWithRetry(retryCount + 1);
        }, delay);
        return;
      }
      
      if (code === 'permission-denied' || errorMessage.includes('permission')) {
        // La preuve est dans publicReservations, mais pas dans la réservation
        // L'opérateur devra vérifier manuellement
        setError(
          "Votre preuve a été enregistrée. Un opérateur devra la valider manuellement."
        );
        // Rediriger quand même vers le reçu
        setTimeout(() => {
          const pathBase = getPublicPathBase(
            reservationDraft?.companySlug || getSlugFromSubdomain() || slug || ''
          );
          navigate(
            pathBase
              ? `/${pathBase}/receipt/${reservationDraft?.id}`
              : `/receipt/${reservationDraft?.id}`,
            { replace: true }
          );
        }, 2000);
      } else if (code === 'resource-exhausted') {
        setError(
          "Le serveur est momentanément occupé. Votre preuve n'a pas encore été enregistrée. Attendez quelques secondes puis réessayez."
        );
      } else {
        setError("Une erreur est survenue lors de l'envoi. Veuillez réessayer.");
      }
      
      submitInFlightRef.current = false;
      setUploading(false);
    }
  };

  await submitWithRetry(0);
  
  submitInFlightRef.current = false;
  setUploading(false);
  log.groupEnd();
};

  if (loadingData) {
    const themeConfig = {
      colors: {
        primary: companyInfo?.couleurPrimaire || '#3b82f6',
        text: companyInfo?.couleurPrimaire ? safeTextColor(companyInfo.couleurPrimaire) : '#ffffff',
        background: '#f9fafb',
      },
    };

    return <LoadingScreen colors={themeConfig.colors} />;
  }

  if (!reservationDraft || !companyInfo) {
    const pathBase = getPublicPathBase(slug || '');
    const homePath = pathBase ? `/${pathBase}` : slug ? `/${slug}` : '/';

    const title =
      loadErrorKind === 'expired'
        ? 'Réservation expirée'
        : loadErrorKind === 'not_found'
          ? 'Réservation introuvable'
          : loadErrorKind === 'invalid'
            ? 'Réservation indisponible'
            : "Impossible d'afficher cette page";

    const primary =
      loadErrorKind === 'expired'
        ? 'Votre réservation a expiré.'
        : loadErrorKind === 'not_found'
          ? 'Réservation introuvable.'
          : loadErrorKind === 'invalid'
            ? "Cette réservation n'est plus disponible."
            : error || 'Une erreur est survenue pendant le chargement.';

    const actionLabel =
      loadErrorKind === 'expired'
        ? 'Recommencer'
        : loadErrorKind === 'not_found'
          ? 'Accueil'
          : "Retour à l’accueil";

    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
        <SectionCard title={title} icon={XCircle} className="max-w-md w-full shadow-md">
          <p className="text-sm text-gray-600 mb-4">{primary}</p>
          {!isOnline && (
            <p className="text-xs text-amber-700 mb-4">
              Connexion indisponible. Vérifiez le réseau, puis ouvrez à nouveau la page depuis
              l’accueil de la compagnie.
            </p>
          )}
          <button
            type="button"
            onClick={() => navigate(homePath, { replace: true })}
            className="w-full px-4 py-3 rounded-lg font-medium text-white hover:opacity-95"
            style={{ backgroundColor: '#3b82f6' }}
          >
            {actionLabel}
          </button>
        </SectionCard>
      </div>
    );
  }

  const themeConfig = {
    colors: {
      primary: companyInfo.primaryColor || companyInfo.couleurPrimaire || '#3b82f6',
      secondary: companyInfo.secondaryColor || companyInfo.couleurSecondaire || '#93c5fd',
      text: companyInfo.primaryColor ? safeTextColor(companyInfo.primaryColor) : '#ffffff',
    },
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {!isOnline && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            Connexion instable : l’envoi de la preuve peut échouer.
          </div>
        </div>
      )}

      <ReservationStepHeader
        onBack={() => navigate(-1)}
        primaryColor={themeConfig.colors.primary}
        secondaryColor={themeConfig.colors.secondary}
        title={t('uploadProofStepTitle')}
        logoUrl={companyInfo.logoUrl}
      />

      <main className="max-w-4xl mx-auto px-4 py-6 pb-24 -mt-2 space-y-6">
        <p className="text-sm text-center px-2" style={{ color: themeConfig.colors.primary }}>
          Si vous venez d’effectuer le paiement, merci d’envoyer votre preuve pour finaliser la
          réservation.
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
              style={{
                borderColor: `${themeConfig.colors.secondary}99`,
                color: themeConfig.colors.primary,
              }}
            >
              <Phone className="w-4 h-4" aria-hidden />
              Recomposer le code USSD
            </button>
          </div>
        )}

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

        <div
          className="mt-6 bg-white rounded-2xl p-5 shadow-xl border transition hover:shadow-2xl"
          style={{ borderColor: `${themeConfig.colors.secondary}33` }}
        >
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Info className="w-5 h-5" style={{ color: themeConfig.colors.primary }} />
            {t('paymentDetails')}
          </h2>

          <p className="text-sm text-gray-600 mt-2">
            Collez le message ou la confirmation de paiement reçue.
          </p>

          <label className="block text-sm font-medium text-gray-700 mt-4">
            Message ou confirmation de paiement *
          </label>

          <textarea
            required
            placeholder="Collez ici le SMS de paiement reçu après l’opération"
            value={smsText}
            onChange={(e) => setSmsText(e.target.value)}
            className="w-full mt-3 rounded-xl border p-4 focus:ring-2 focus:outline-none min-h-[120px] shadow-[inset_0_2px_4px_rgba(0,0,0,0.05)] bg-white text-gray-900 placeholder-gray-500"
            style={{
              borderColor: `${themeConfig.colors.secondary}66`,
            }}
          />

          {validation === 'valid' && parsed && (
            <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              <div className="font-semibold">Paiement détecté</div>
              <div className="mt-1">
                Montant : {parsed.amount != null ? `${parsed.amount} FCFA` : '—'}
              </div>
              <div>Référence détectée : {parsed.transactionId || '—'}</div>
              {paymentMethod && <div>Portefeuille détecté : {paymentMethod}</div>}
            </div>
          )}

          {validation === 'suspicious' && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Paiement partiellement reconnu. Une vérification complémentaire sera nécessaire.
            </div>
          )}

          {validation === 'invalid' && smsText.trim() && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              Ce message ne correspond pas à un paiement valide pour cette réservation.
            </div>
          )}

          {error && <ErrorDisplay error={error} />}

          <button
            type="button"
            disabled={uploading || !smsText.trim() || validation === 'invalid'}
            onClick={handleSubmitProof}
            className={`mt-6 w-full py-4 rounded-full font-semibold active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 ${
              smsText.trim() && !uploading && validation !== 'invalid'
                ? 'text-white'
                : 'bg-gray-300 text-gray-500'
            }`}
            style={
              smsText.trim() && !uploading && validation !== 'invalid'
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
                {error?.includes('tentative') ? 'Nouvelle tentative...' : t('sendingProof')}
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

export default UploadPreuvePage;