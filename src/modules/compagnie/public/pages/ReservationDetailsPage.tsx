// src/pages/ReservationDetailsPage.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  doc, onSnapshot, getDoc, getDocs, collection, query, where,
  updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { resolveReservationById, resolveReservationByToken } from '../utils/resolveReservation';
import { SectionCard, StatusBadge } from '@/ui';
import {
  ChevronLeft, MapPin, Clock, Calendar, CheckCircle, XCircle, Loader2,
  CreditCard, Ticket, Heart, ChevronRight, Hash, Upload, ShieldCheck, Shield
} from 'lucide-react';
import type { DocumentReference } from 'firebase/firestore';
import TicketOnline from '../components/ticket/TicketOnline';
import ReservationStepHeader from '../components/ReservationStepHeader';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import { useWindowSize } from '@react-hook/window-size';
import { hexToRgba, safeTextColor } from '@/utils/color';
import type { ReservationStatus } from '@/types/reservation';
import { showTicketDirect as showTicketDirectUtil, canViewReceiptPage } from '@/utils/reservationStatusUtils';
import { getDisplayPhone } from '@/utils/phoneUtils';
import { useTranslation } from 'react-i18next';

type PaymentMethod = 'mobile_money' | 'carte_bancaire' | 'espèces' | 'autre' | 'en_ligne' | 'guichet' | string;

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  telephoneOriginal?: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  seatsGo: number;
  seatsReturn: number;
  tripType: string;
  referenceCode?: string;

  // === NOUVEAUX STATUTS ===
  statut: ReservationStatus;
  canal?: PaymentMethod;

  // === Autres champs ===
  statutEmbarquement?: string;
  boarded?: boolean;
  boardedAt?: any;
  paidAt?: any;
  validatedAt?: any;
  paymentMethodLabel?: string;
  reason?: string;
  refusalReason?: string;

  companyId: string;
  companySlug: string;
  companyName?: string;
  updatedAt?: string;
  agencyId?: string;
  agencyNom?: string;
  agenceNom?: string;
  publicToken?: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  primaryColor?: string;
  couleurPrimaire?: string;
  logoUrl?: string;
  secondaryColor?: string;
}

/* ====== Mémoire locale ====== */
const PENDING_KEY = 'pendingReservation';
const STEP_KEY = (slug?: string) => `mb:lastStep:${slug || ''}`;

const readPending = () => {
  try { const raw = localStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};

// 🔴 CORRECTION CRITIQUE : Fonction de nettoyage améliorée
const clearPending = () => {
  try { 
    localStorage.removeItem(PENDING_KEY); 
    console.log('🧹 pendingReservation nettoyé du localStorage');
  } catch (e) {
    console.error('Erreur lors du nettoyage localStorage:', e);
  }
  
  try { 
    sessionStorage.removeItem('reservationDraft');
    console.log('🧹 reservationDraft nettoyé du sessionStorage');
  } catch (e) {
    console.error('Erreur lors du nettoyage sessionStorage:', e);
  }
  
  // Nettoyage supplémentaire des clés obsolètes
  try {
    const keysToRemove = [
      'currentReservation',
      'lastReservationId',
      'pending_payment',
      'mb_pending'
    ];
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
  } catch (e) {}
};

const PAYMENT_METHODS = {
  mobile_money: { text: 'Mobile Money', icon: <CreditCard className="h-4 w-4" /> },
  carte_bancaire: { text: 'Carte bancaire', icon: <CreditCard className="h-4 w-4" /> },
  espèces: { text: 'Espèces', icon: <CreditCard className="h-4 w-4" /> },
  autre: { text: 'Autre moyen', icon: <CreditCard className="h-4 w-4" /> }
} as const;

const getPaymentChip = (label?: string) =>
  label ? { text: label, icon: <CreditCard className="h-4 w-4" /> }
        : { text: 'Non précisé', icon: <CreditCard className="h-4 w-4" /> };

const getDateLocale = (language: string) => (language === 'en' ? 'en-US' : 'fr-FR');

function formatCompactDate(dateString: string, locale: string) {
  return new Date(dateString).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatEmissionDate(locale: string) {
  return new Date().toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ====== Configuration des étapes (labels come from t() in component) ====== */
const STEPS_KEYS = [
  { key: 'verification', labelKey: 'reservationStepAwaitingValidation', descKey: 'reservationStepDescVerification', icon: <Upload className="h-4 w-4" />, isFinal: false },
  { key: 'confirme', labelKey: 'reservationStepConfirmed', descKey: 'reservationStepDescConfirmed', icon: <ShieldCheck className="h-4 w-4" />, isFinal: true }
] as const;

const ReservationDetailsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const language = (i18n.language || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
  const locale = getDateLocale(language);

  const navigate = useNavigate();
  const { slug = '', id } = useParams<{ slug: string; id?: string }>();
  const location = useLocation();
  const money = useFormatCurrency();
  const qs = new URLSearchParams(location.search);
  const token = qs.get('r') || '';
  const reservationRef = useRef<DocumentReference | null>(null);

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [agencyName, setAgencyName] = useState<string>('');
  const [agencyLatitude, setAgencyLatitude] = useState<number | null>(null);
  const [agencyLongitude, setAgencyLongitude] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [width, height] = useWindowSize();

  /* Payment / proof section (en_attente_paiement only) */
  const [paymentMethods, setPaymentMethods] = useState<Record<string, { url?: string; logoUrl?: string; ussdPattern?: string; merchantNumber?: string }>>({});
  const [paymentMethodKey, setPaymentMethodKey] = useState<string | null>(null);
  const [proofMessage, setProofMessage] = useState('');
  const [proofUploading, setProofUploading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const fallbackColor = '#3b82f6';
  const primaryColor = companyInfo?.couleurPrimaire || companyInfo?.primaryColor || fallbackColor;
  const secondaryColor = companyInfo?.secondaryColor || '#60a5fa';

  // 💾 On mémorise l'écran courant
  useEffect(() => {
    try { localStorage.setItem(STEP_KEY(slug), 'details'); } catch {}
  }, [slug]);

  // 🔄 Chargement / abonnement Firestore
  useEffect(() => {
    if ((!id && !token) || !slug) { 
      setError('Paramètres manquants'); 
      setLoading(false); 
      return; 
    }
    let unsub: undefined | (() => void);

    (async () => {
      try {
        setLoading(true);
        setError(null);

        let ref: DocumentReference;
        let hardId = id || '';

        if (id) {
          const r = await resolveReservationById(slug, id);
          ref = r.ref;
        } else if (token) {
          const r = await resolveReservationByToken(slug, token);
          ref = r.ref;
          hardId = r.hardId;
        } else {
          setError('Paramètres manquants');
          setLoading(false);
          return;
        }

        reservationRef.current = ref;
        unsub = onSnapshot(ref, async (snap) => {
          if (!snap.exists()) { 
            // 🔴 CORRECTION CRITIQUE : Nettoyage forcé si réservation introuvable
            console.warn('❌ Réservation introuvable dans Firestore, nettoyage du cache...');
            clearPending();
            
            setError('Réservation introuvable ou expirée. Veuillez créer une nouvelle réservation.'); 
            setLoading(false); 
            return; 
          }
          
          const data = snap.data() as any;
          const next: Reservation = { 
            ...data, 
            id: snap.id, 
            updatedAt: data?.updatedAt || new Date().toISOString() 
          };
          
          // Normalisation des anciens statuts vers les nouveaux (ALIGNÉ AVEC ADMIN)
          const normalizedStatus = (() => {
            const s = (data.statut ?? '').toString().toLowerCase();
            if (['preuve_recue', 'verif', 'vérif'].some(k => s.includes(k))) return 'verification';
            if (['pay', 'confirm', 'valid'].some(k => s.includes(k))) return 'confirme';
            if (['refuse', 'refusé', 'reject', 'rejeté'].some(k => s.includes(k))) return 'refuse';
            if (['annule', 'cancel', 'cancelled'].some(k => s.includes(k))) return 'annule';
            if (s === 'en_attente_paiement' || s.includes('attente_paiement')) return 'en_attente_paiement' as ReservationStatus;
            return 'en_attente' as ReservationStatus;
          })();

          const finalReservation = {
            ...next,
            statut: normalizedStatus
          };
          
          setReservation(finalReservation);

          // 🔴 CORRECTION AMÉLIORÉE : Nettoyage plus agressif
          const pend = readPending();
          
          // Nettoyage si réservation terminée OU si ancien ID différent
          if (normalizedStatus === 'confirme' || normalizedStatus === 'annule' || normalizedStatus === 'refuse') {
            if (pend?.id === snap.id) {
              console.log('✅ Réservation terminée, nettoyage du cache');
              clearPending();
            }
          }
          
          // Nettoyage si l'ID en cache ne correspond pas à la réservation actuelle
          if (pend && pend.id !== snap.id) {
            console.log('🔄 ID différent détecté, nettoyage ancien cache');
            clearPending();
          }

          // Récupération du nom et des coordonnées de l'agence (pour itinéraire)
          const companyId = ref.path.split('/')[1];
          const agencyId = ref.path.split('/')[3];
          const inline = finalReservation.agencyNom || finalReservation.agenceNom;
          if (inline) setAgencyName(inline);
          try {
            const agSnap = await getDoc(doc(db, 'companies', companyId, 'agences', agencyId));
            const ag = agSnap.exists() ? (agSnap.data() as any) : {};
            if (!inline) setAgencyName(ag?.nom || ag?.name || '');
            const lat = ag?.latitude != null ? Number(ag.latitude) : null;
            const lng = ag?.longitude != null ? Number(ag.longitude) : null;
            setAgencyLatitude(Number.isFinite(lat) ? lat : null);
            setAgencyLongitude(Number.isFinite(lng) ? lng : null);
          } catch {}

          // Récupération des infos de la compagnie (toujours depuis Firestore, pas de state)
          try {
            const companyId = ref.path.split('/')[1];
            const cSnap = await getDoc(doc(db, 'companies', companyId));
            if (cSnap.exists()) {
              const d = cSnap.data() as any;
              setCompanyInfo({
                id: cSnap.id,
                name: d?.name || d?.nom,
                primaryColor: d?.primaryColor,
                secondaryColor: d?.secondaryColor,
                couleurPrimaire: d?.couleurPrimaire,
                logoUrl: d?.logoUrl
              });
            }
          } catch {}

          setLoading(false);

          // Normalisation de l'URL si arrivé via token
          if (!id && hardId) {
            const slugToUse = finalReservation.companySlug || slug;
            window.history.replaceState({}, '', `/${slugToUse}/reservation/${hardId}`);
          }
        }, (e) => {
          console.error('❌ Erreur Firestore:', e);
          // 🔴 CORRECTION : Nettoyage aussi en cas d'erreur
          clearPending();
          setError(e?.message || 'Erreur de connexion au serveur'); 
          setLoading(false);
        });
      } catch (e: any) {
        console.error('❌ Erreur générale:', e);
        // 🔴 CORRECTION : Nettoyage aussi en cas d'erreur générale
        clearPending();
        setError(e?.message || 'Impossible de localiser la réservation'); 
        setLoading(false);
      }
    })();

    return () => { 
      if (unsub) {
        unsub(); 
      }
    };
  }, [id, token, slug]);

  // 🎉 Confetti pour paiement confirmé
  useEffect(() => {
    if (reservation?.statut === 'confirme') {
      const k = `celebrated-${reservation.id}`;
      if (!localStorage.getItem(k)) {
        setShowConfetti(true);
        localStorage.setItem(k, 'true');
        const t = setTimeout(() => setShowConfetti(false), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [reservation?.statut, reservation?.id]);

  /* Chargement des moyens de paiement (pour section preuve, en_attente_paiement uniquement) */
  useEffect(() => {
    if (!reservation?.companyId || reservation?.statut !== 'en_attente_paiement') return;
    let cancelled = false;
    (async () => {
      try {
        const pmSnap = await getDocs(
          query(collection(db, 'paymentMethods'), where('companyId', '==', reservation.companyId))
        );
        if (cancelled) return;
        const pms: Record<string, { url?: string; logoUrl?: string; ussdPattern?: string; merchantNumber?: string }> = {};
        pmSnap.forEach((ds) => {
          const d = ds.data() as any;
          if (d.name) pms[d.name] = {
            url: d.defaultPaymentUrl || '',
            logoUrl: d.logoUrl || '',
            ussdPattern: d.ussdPattern || '',
            merchantNumber: d.merchantNumber || '',
          };
        });
        setPaymentMethods(pms);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [reservation?.companyId, reservation?.statut]);

  const submitProof = useCallback(async () => {
    const ref = reservationRef.current;
    if (!ref || !reservation) return;
    if (!paymentMethodKey) {
      setProofError('Sélectionnez un moyen de paiement');
      return;
    }
    if ((proofMessage || '').trim().length < 4) {
      setProofError('Indiquez la référence reçue (au moins 4 caractères)');
      return;
    }
    setProofUploading(true);
    setProofError(null);
    try {
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setProofError('Réservation introuvable.');
        return;
      }
      const data = snap.data() as any;
      const currentStatut = (data.statut || '').toLowerCase();
      if (currentStatut !== 'en_attente_paiement') {
        setProofError('Cette réservation a expiré ou a déjà été traitée. Créez une nouvelle réservation si besoin.');
        return;
      }
      const inputReference = (proofMessage || '').trim();
      await updateDoc(ref, {
        statut: 'preuve_recue',
        paymentReference: inputReference,
        proofSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setProofMessage('');
      setProofError(null);
    } catch (e: any) {
      setProofError(e?.message || "L'envoi n'a pas abouti. Réessayez.");
    } finally {
      setProofUploading(false);
    }
  }, [reservation, paymentMethodKey, proofMessage]);

  /* ===== Décision d'affichage (utilitaire partagé) ===== */
  const isTicketAvailable = showTicketDirectUtil(reservation);
  const canViewReceipt = canViewReceiptPage(reservation);
  const canal = String(reservation?.canal || '').toLowerCase();

  /* ===== Configuration de la timeline ===== */
  const currentStepIndex = reservation 
    ? Math.max(0, STEPS_KEYS.findIndex(step => step.key === reservation.statut))
    : -1;

  const stepDescriptions: Record<string, string> = {
    en_attente: t('reservationStepDescPending'),
    verification: t('reservationStepDescVerification'),
    confirme: t('reservationStepDescConfirmed'),
    refuse: t('reservationStepDescRefused'),
    annule: t('reservationStepDescCancelled')
  };

  /* 🚀 Redirection automatique si billet disponible (URL seule, pas de state) */
  useEffect(() => {
    if (!isTicketAvailable || !reservation) return;
    const currentPath = window.location.pathname;
    const slugToUse = reservation.companySlug || slug;
    const targetPath = `/${slugToUse}/receipt/${reservation.id}`;
    if (currentPath !== targetPath) {
      navigate(targetPath, { replace: true });
    }
  }, [isTicketAvailable, reservation, slug, navigate]);

  // Méthode de paiement affichée
  const paymentLabel =
    canal === 'guichet'
      ? 'Espèces'
      : (reservation?.paymentMethodLabel ||
         (reservation?.canal && reservation.canal !== 'en_ligne' 
           ? String(reservation.canal).replace(/_/g,' ') 
           : 'En ligne'));

  const paymentChip = getPaymentChip(paymentLabel);
  const lastUpdated = reservation?.updatedAt && !isNaN(new Date(reservation.updatedAt).getTime())
    ? new Date(reservation.updatedAt).toLocaleString('fr-FR', { 
        day: 'numeric', 
        month: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    : null;

  // 🔴 CORRECTION : Gestion du bouton "Retour"
  const handleGoBack = () => {
    // Nettoyage avant de revenir en arrière
    clearPending();
    navigate(-1);
  };

  // 🔴 CORRECTION : Gestion du bouton "Nouvelle réservation"
  const handleNewReservation = () => {
    // Nettoyage complet avant nouvelle réservation
    clearPending();
    const slugToUse = reservation?.companySlug || slug;
    navigate(`/${slugToUse}`, { replace: true });
  };

  // ===== RENDER =====

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8fafc' }}>
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
          <p className="text-gray-700 text-sm">Chargement de votre réservation...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#f8fafc' }}>
        <SectionCard title="Réservation introuvable" icon={XCircle} className="max-w-md w-full shadow-md">
          <p className="text-gray-600 mb-5 text-center">
            {error || 'Cette réservation a expiré ou a été supprimée.'}
          </p>
          <div className="space-y-2">
            <button 
              onClick={handleNewReservation}
              className="w-full px-5 py-3 rounded-lg text-sm font-semibold shadow-sm"
              style={{ 
                backgroundColor: primaryColor, 
                color: safeTextColor(primaryColor) 
              }}
            >
              Créer une nouvelle réservation
            </button>
            <button 
              onClick={handleGoBack}
              className="w-full px-5 py-2.5 rounded-lg text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              Retour
            </button>
          </div>
          <p className="text-xs text-gray-500 mt-4 pt-4 border-t border-gray-200">
            💡 Conseil : Videz le cache de votre navigateur si le problème persiste.
          </p>
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32" style={{ background: 'linear-gradient(180deg, #f8fafc, #ffffff)' }}>
      <AnimatePresence>
        {reservation.statut === 'confirme' && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={200}
            colors={[primaryColor, secondaryColor, '#ffffff']}
          />
        )}
      </AnimatePresence>

      <ReservationStepHeader
        onBack={handleGoBack}
        primaryColor={primaryColor}
        secondaryColor={secondaryColor}
        title="Détails de réservation"
        logoUrl={companyInfo?.logoUrl}
      />

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Étapes – visibles uniquement pour réservations en ligne */}
        {reservation.canal === 'en_ligne' && reservation.statut !== 'refuse' && reservation.statut !== 'annule' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <SectionCard title={t('reservationPaymentTracking')} icon={Upload} right={lastUpdated ? <span className="text-xs text-gray-500">{lastUpdated}</span> : undefined} className="shadow-md">

            <div className="relative">
              <div className="absolute top-3 left-0 right-0 h-1 bg-gray-200 rounded-full z-0" />
              <motion.div
                className="absolute top-3 left-0 h-1 rounded-full z-0"
                style={{ backgroundColor: primaryColor }}
                initial={{ width: 0 }}
                animate={{ 
                  width: `${Math.max(0, ((currentStepIndex + 1) / STEPS_KEYS.length) * 100)}%` 
                }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              />
              <div className="relative z-10 flex justify-between">
                {STEPS_KEYS.map((step, idx) => {
                  const isActive = idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex && reservation.statut !== 'confirme';
                  const IconComponent = step.icon;

                  return (
                    <div key={step.key} className="flex flex-col items-center w-1/2">
                      <div className="relative mb-1">
                        <div
                          className="h-6 w-6 rounded-full flex items-center justify-center"
                          style={{
                            backgroundColor: isActive ? primaryColor : '#e5e7eb',
                            color: isActive ? safeTextColor(primaryColor) : '#6b7280',
                            border: isCurrent ? `2px solid ${safeTextColor(primaryColor)}` : 'none'
                          }}
                        >
                          {idx < currentStepIndex
                            ? <CheckCircle className="h-3.5 w-3.5" />
                            : isCurrent && reservation.statut === 'verification'
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : IconComponent}
                        </div>
                        {isCurrent && reservation.statut === 'verification' && (
                          <span
                            className="absolute inset-0 rounded-full"
                            style={{
                              border: `2px solid ${primaryColor}`,
                              opacity: 0.45,
                              animation: 'pingStep 1.2s cubic-bezier(0,0,0.2,1) infinite'
                            }}
                          />
                        )}
                      </div>
                      <span className={`text-xs text-center ${isActive ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                        {t(step.labelKey)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            </SectionCard>
          </motion.div>
        )}

        {/* Bandeau statut + références */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <SectionCard title={t('reservationStatus')} icon={CheckCircle} className="shadow-md">
          <div className="flex items-start gap-3">
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{
              backgroundColor: '#ffffff',
              color:
                reservation.statut === 'confirme'
                  ? '#059669'
                  : reservation.statut === 'verification'
                  ? '#6d28d9'
                  : reservation.statut === 'refuse'
                  ? '#dc2626'
                  : reservation.statut === 'annule'
                  ? '#6b7280'
                  : primaryColor
            }}
          >
            {reservation.statut === 'confirme' ? <CheckCircle className="h-4 w-4" /> :
             reservation.statut === 'refuse' || reservation.statut === 'annule' ? <XCircle className="h-4 w-4" /> :
             reservation.statut === 'verification' ? <Upload className="h-4 w-4" /> :
             <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <div className="flex-1">
            <p className="font-medium text-sm mb-1">
              {reservation.statut === 'confirme' ? t('reservationStatusConfirmed') :
               reservation.statut === 'refuse' ? t('reservationStatusRefused') :
               reservation.statut === 'annule' ? t('reservationStatusCancelled') :
               reservation.statut === 'verification' ? t('reservationStatusValidation') :
               t('reservationStatusAwaitingPayment')}
            </p>
            <p className="text-xs text-gray-600">
              {stepDescriptions[reservation.statut] || stepDescriptions.en_attente}
              {(reservation.refusalReason || reservation.reason) && reservation.statut === 'refuse' && (
                <span className="block mt-1 text-red-600 font-medium">
                  {t('reservationReason')} : {reservation.refusalReason || reservation.reason}
                </span>
              )}
            </p>

            {reservation.referenceCode && (
              <p className="mt-2 text-xs text-gray-700 flex items-center gap-1">
                <Hash className="h-3 w-3" /> 
                <span className="font-semibold">N°</span> {reservation.referenceCode}
              </p>
            )}
            {agencyName && (
              <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> 
                <span className="font-semibold">Agence :</span> {agencyName}
              </p>
            )}
            {reservation.statut === 'confirme' && (
              <p className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
                Réservation confirmée · Support disponible
              </p>
            )}
          </div>
          </div>
          </SectionCard>
        </motion.div>

        {/* Section paiement / justificatif (en_attente_paiement uniquement) */}
        {reservation.canal === 'en_ligne' && reservation.statut === 'en_attente_paiement' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
            <SectionCard title="Justificatif de paiement" icon={CreditCard} className="shadow-md">
              <p className="text-sm text-gray-600 mb-3">Choisissez un moyen de paiement, effectuez le paiement, puis indiquez la référence reçue.</p>
              {proofError && (
                <div className="mb-3 p-2 rounded-lg bg-red-50 text-red-800 text-sm">{proofError}</div>
              )}
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(paymentMethods).map(([key, method]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setPaymentMethodKey(key);
                      if (method.url) {
                        try { new URL(method.url); window.open(method.url, '_blank', 'noopener,noreferrer'); } catch {}
                      } else if (method.ussdPattern && method.merchantNumber) {
                        const ussd = method.ussdPattern.replace('MERCHANT', method.merchantNumber || '').replace('AMOUNT', String(reservation.montant || 0));
                        window.location.href = `tel:${encodeURIComponent(ussd)}`;
                      }
                    }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      paymentMethodKey === key ? 'border-gray-400 bg-gray-100' : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-700">Référence reçue (SMS / reçu)</label>
                <input
                  type="text"
                  value={proofMessage}
                  onChange={(e) => setProofMessage(e.target.value)}
                  placeholder="Ex. 12345678"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 placeholder-gray-500"
                />
                <button
                  type="button"
                  onClick={submitProof}
                  disabled={proofUploading || !paymentMethodKey || proofMessage.trim().length < 4}
                  className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: primaryColor, color: safeTextColor(primaryColor) }}
                >
                  {proofUploading ? 'Envoi…' : 'Envoyer le justificatif'}
                </button>
              </div>
              <p className="mt-3 text-xs text-gray-500 flex items-center gap-1">
                <Shield className="h-3.5 w-3.5" /> Paiement sécurisé · Support disponible
              </p>
            </SectionCard>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
        >
          <SectionCard title="Détails du voyage" icon={Ticket} className="shadow-md">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                <MapPin className="h-4 w-4 text-gray-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Itinéraire</p>
                <p className="text-sm font-medium text-gray-900">
                  {reservation.depart} <ChevronRight className="inline h-3 w-3 mx-1 text-gray-400" /> {reservation.arrivee}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                  <Calendar className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Date</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatCompactDate(reservation.date, locale)}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                  <Clock className="h-4 w-4 text-gray-600" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Heure</p>
                  <p className="text-sm font-medium text-gray-900">{reservation.heure}</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0">
                <CreditCard className="h-4 w-4 text-gray-600" />
              </div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Paiement</p>
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-900">
                    {money(reservation.montant)}
                  </p>
                  <StatusBadge status="neutral">{paymentChip.text}</StatusBadge>
                </div>
              </div>
            </div>

            {reservation.tripType === 'aller-retour' && (
              <div className="text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                <p className="font-medium text-gray-700 mb-1">Aller-retour</p>
                <div className="flex justify-between">
                  <span>Aller: {reservation.seatsGo} place(s)</span>
                  <span>Retour: {reservation.seatsReturn} place(s)</span>
                </div>
              </div>
            )}
          </div>
          </SectionCard>
        </motion.div>

        {/* Billet toujours visible (QR actif ou "En attente de validation") */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <SectionCard title="Votre billet" icon={Ticket} className="shadow-md">
            <TicketOnline
              companyName={companyInfo?.name || reservation.companyName || 'Compagnie'}
              logoUrl={companyInfo?.logoUrl}
              primaryColor={primaryColor}
              secondaryColor={secondaryColor}
              agencyName={agencyName}
              receiptNumber={reservation.referenceCode || reservation.id}
              statut={reservation.statut}
              nomClient={reservation.nomClient}
              telephone={getDisplayPhone(reservation)}
              depart={reservation.depart}
              arrivee={reservation.arrivee}
              date={reservation.date}
              heure={reservation.heure}
              seats={reservation.seatsGo ?? 1}
              canal={reservation.canal}
              montant={reservation.montant}
              qrValue={`${typeof window !== 'undefined' ? window.location.origin : ''}/r/${encodeURIComponent(reservation.referenceCode || reservation.id)}`}
              emissionDate={formatEmissionDate(locale)}
              paymentMethod={paymentLabel}
              agencyLatitude={agencyLatitude}
              agencyLongitude={agencyLongitude}
            />
          </SectionCard>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.35 }} 
          className="text-center pt-4"
        >
          <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
            <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400" />
            <span>{t('reservationThanksTrust')}</span>
          </div>
          <p className="text-sm font-medium mt-1" style={{ color: primaryColor }}>
            {reservation.companyName || companyInfo?.name || t('reservationYourCompany')}
          </p>
        </motion.div>
      </main>

      {/* CTA bas */}
      <div
        className="fixed bottom-0 left-0 w-full z-40 px-4 py-3 shadow-md border-t"
        style={{ backgroundColor: '#ffffff', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <div className="max-w-md mx-auto">
          {reservation.statut !== 'refuse' && reservation.statut !== 'annule' ? (
            <>
              <button
                onClick={() => {
                  const slugToUse = reservation.companySlug || slug;
                  navigate(`/${slugToUse}/receipt/${reservation.id}`, { replace: false });
                }}
                className={`w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition-all ${
                  canViewReceipt ? 'hover:opacity-95' : 'opacity-70 cursor-not-allowed'
                }`}
                style={{
                  background: canViewReceipt
                    ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                    : `linear-gradient(135deg, ${hexToRgba(primaryColor,0.5)}, ${hexToRgba(secondaryColor,0.5)})`,
                  color: safeTextColor(primaryColor)
                }}
                disabled={!canViewReceipt}
              >
                <CheckCircle className="h-4 w-4" />
                {isTicketAvailable
                  ? t('reservationViewTicket')
                  : canViewReceipt
                    ? t('reservationViewReceipt')
                    : t('reservationWaitingConfirmation')
                }
              </button>
              
              <button
                onClick={handleNewReservation}
                className="w-full mt-3 py-2.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
              >
                {t('reservationNewReservation')}
              </button>
            </>
          ) : (
            <div className="space-y-3">
              <div className="text-center py-3 text-gray-600">
                <p className="font-medium mb-1">
                  {reservation.statut === 'refuse' ? t('reservationRefusedTitle') : t('reservationCancelledTitle')}
                </p>
                <p className="text-sm">
                  {reservation.statut === 'refuse' 
                    ? t('reservationContactCompany') 
                    : t('reservationCreateNewDesc')}
                </p>
              </div>
              
              <button
                onClick={handleNewReservation}
                className="w-full py-3 rounded-lg text-sm font-medium shadow-sm"
                style={{ 
                  backgroundColor: primaryColor, 
                  color: safeTextColor(primaryColor) 
                }}
              >
                {t('reservationNewReservation')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* keyframes pour l'anneau "ping" */}
      <style>
        {`
          @keyframes pingStep {
            0% { transform: scale(1); opacity: .45; }
            80% { transform: scale(1.75); opacity: 0; }
            100% { transform: scale(1.75); opacity: 0; }
          }
        `}
      </style>
    </div>
  );
};

export default ReservationDetailsPage;