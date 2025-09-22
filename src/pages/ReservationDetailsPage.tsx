import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  doc, onSnapshot, getDoc,
  collection, getDocs, query, where,
  collectionGroup, documentId, DocumentReference, limit
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import {
  ChevronLeft, MapPin, Clock, Calendar, CheckCircle, XCircle, Loader2,
  CreditCard, Ticket, Heart, ChevronRight, Hash
} from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { motion, AnimatePresence } from 'framer-motion';
import Confetti from 'react-confetti';
import { useWindowSize } from '@react-hook/window-size';
import { hexToRgba, safeTextColor } from '@/utils/color';

type ReservationStatus = 'en_attente' | 'paiement_en_cours' | 'preuve_recue' | 'payé' | 'annule';
type PaymentMethod = 'mobile_money' | 'carte_bancaire' | 'espèces' | 'autre' | string;

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  montant: number;
  seatsGo: number;
  seatsReturn: number;
  tripType: string;
  referenceCode?: string;
  statut: ReservationStatus;
  companyId: string;
  companySlug: string;
  companyName?: string;
  canal?: PaymentMethod;
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

/* ====== Anti-spam memory (commun avec la page de réservation) ====== */
const PENDING_KEY = 'pendingReservation';
const isBlockingStatus = (s?: string) =>
  ['en_attente', 'en_attente_paiement', 'paiement_en_cours', 'preuve_recue'].includes(String(s || '').toLowerCase());
const readPending = () => {
  try { const raw = localStorage.getItem(PENDING_KEY); return raw ? JSON.parse(raw) : null; }
  catch { return null; }
};
const clearPending = () => {
  try { localStorage.removeItem(PENDING_KEY); } catch {}
  try { sessionStorage.removeItem('reservationDraft'); } catch {}
};

const PAYMENT_METHODS = {
  mobile_money: { text: 'Mobile Money', icon: <CreditCard className="h-4 w-4" /> },
  carte_bancaire: { text: 'Carte bancaire', icon: <CreditCard className="h-4 w-4" /> },
  espèces: { text: 'Espèces', icon: <CreditCard className="h-4 w-4" /> },
  autre: { text: 'Autre moyen', icon: <CreditCard className="h-4 w-4" /> }
} as const;

const getPaymentMethod = (method?: PaymentMethod) =>
  method ? (PAYMENT_METHODS[method as keyof typeof PAYMENT_METHODS] || { text: method, icon: <CreditCard className="h-4 w-4" /> })
         : { text: 'Non précisé', icon: <CreditCard className="h-4 w-4" /> };

const formatCompactDate = (dateString: string) =>
  new Date(dateString).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

async function resolveById(slug: string, reservationId: string) {
  const cSnap = await getDocs(query(collection(db, 'companies'), where('slug', '==', slug)));
  if (cSnap.empty) throw new Error('Compagnie introuvable');
  const companyId = cSnap.docs[0].id;

  const cg = await getDocs(
    query(collectionGroup(db, 'reservations'), where(documentId(), '==', reservationId))
  );
  for (const d of cg.docs) {
    if (d.ref.path.includes(`/companies/${companyId}/`)) {
      const agencyId = d.ref.parent.parent?.id as string;
      return { ref: d.ref, companyId, agencyId };
    }
  }

  const aSnap = await getDocs(collection(db, 'companies', companyId, 'agences'));
  for (const a of aSnap.docs) {
    const rRef = doc(db, 'companies', companyId, 'agences', a.id, 'reservations', reservationId);
    const rSnap = await getDoc(rRef);
    if (rSnap.exists()) return { ref: rRef, companyId, agencyId: a.id };
  }
  throw new Error('Réservation introuvable');
}

async function resolveByToken(slug: string, token: string) {
  const qRef = query(
    collectionGroup(db, 'reservations'),
    where('companySlug', '==', slug),
    where('publicToken', '==', token),
    limit(1)
  );
  const snap = await getDocs(qRef);
  if (snap.empty) throw new Error('Réservation introuvable');
  const d = snap.docs[0];
  const parts = d.ref.path.split('/');
  return { ref: d.ref, companyId: parts[1], agencyId: parts[3], hardId: d.id };
}

const ReservationDetailsPage: React.FC = () => {
  const navigate = useNavigate();
  const { slug = '', id } = useParams<{ slug: string; id?: string }>();
  const location = useLocation();
  const qs = new URLSearchParams(location.search);
  const token = qs.get('r') || '';
  const { companyInfo: locationCompanyInfo } = (location.state as any) || {};

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [agencyName, setAgencyName] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(locationCompanyInfo || null);
  const [error, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [width, height] = useWindowSize();

  const fallbackColor = '#3b82f6';
  const primaryColor = companyInfo?.couleurPrimaire || companyInfo?.primaryColor || fallbackColor;
  const secondaryColor = companyInfo?.secondaryColor || '#e0f2fe';
  const textColor = safeTextColor(primaryColor);

  useEffect(() => {
    if ((!id && !token) || !slug) { setError('Paramètres manquants'); setLoading(false); return; }
    let unsub: undefined | (() => void);

    (async () => {
      try {
        setLoading(true);

        let ref: DocumentReference, hardId = id || '';
        const st: any = location.state || {};

        if (id) {
          if (st?.companyId && st?.agencyId) {
            ref = doc(db, 'companies', st.companyId, 'agences', st.agencyId, 'reservations', id);
          } else {
            const r = await resolveById(slug, id);
            ref = r.ref;
          }
        } else {
          const r = await resolveByToken(slug, token!);
          ref = r.ref;
          hardId = r.hardId;
        }

        unsub = onSnapshot(ref, async (snap) => {
          if (!snap.exists()) { setError('Réservation introuvable'); setLoading(false); return; }
          const data = snap.data() as any;
          const next: Reservation = { ...data, id: snap.id, updatedAt: data?.updatedAt || new Date().toISOString() };
          setReservation(next);

          // 🔒 Si statut final (payé/annule), on nettoie la mémoire anti-spam
          if (next.statut === 'payé' || next.statut === 'annule') {
            const pend = readPending();
            if (pend?.id === snap.id) clearPending();
          }

          const inline = next.agencyNom || next.agenceNom;
          if (inline) setAgencyName(inline);
          else {
            const companyId = ref.path.split('/')[1];
            const agencyId = ref.path.split('/')[3];
            try {
              const agSnap = await getDoc(doc(db, 'companies', companyId, 'agences', agencyId));
              const ag = agSnap.data() as any;
              setAgencyName(ag?.nom || ag?.name || '');
            } catch {}
          }

          if (!companyInfo) {
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
          }

          setLoading(false);

          // Normalise l’URL si on est venu par /mon-billet?r=TOKEN
          if (!id && hardId) {
            const slugToUse = (location as any)?.state?.slug || next.companySlug || slug;
            window.history.replaceState({}, '', `/${slugToUse}/reservation/${hardId}`);
          }
        }, (e) => {
          setError(e?.message || 'Erreur de connexion'); setLoading(false);
        });
      } catch (e: any) {
        setError(e?.message || 'Impossible de localiser la réservation'); setLoading(false);
      }
    })();

    return () => { if (unsub) unsub(); };
  }, [id, token, slug]);

  useEffect(() => {
    if (reservation?.statut === 'payé') {
      const k = `celebrated-${reservation.id}`;
      if (!localStorage.getItem(k)) {
        setShowConfetti(true);
        localStorage.setItem(k, 'true');
        const t = setTimeout(() => setShowConfetti(false), 5000);
        return () => clearTimeout(t);
      }
    }
  }, [reservation?.statut, reservation?.id]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50/50">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: primaryColor }} />
          <p className="text-gray-600 text-sm">Chargement de votre réservation...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50/50">
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-md w-full text-center">
          <XCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Erreur</h3>
          <p className="text-gray-600 mb-5">{error || 'Réservation introuvable'}</p>
          <button onClick={() => navigate(-1)} className="px-5 py-2 rounded-lg text-sm font-medium shadow-sm"
                  style={{ backgroundColor: primaryColor, color: safeTextColor(primaryColor) }}>
            Retour
          </button>
        </div>
      </div>
    );
  }

  const realSlug = (location as any)?.state?.slug || reservation.companySlug;
  const currentStepIndex = Math.max(0, ['en_attente','paiement_en_cours','preuve_recue','payé'].findIndex(s => s === reservation.statut));
  const isConfirmed = reservation.statut === 'payé';
  const paymentMethod = getPaymentMethod(reservation.canal);
  const lastUpdated = reservation.updatedAt && !isNaN(new Date(reservation.updatedAt).getTime())
    ? new Date(reservation.updatedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50/70 to-white pb-32">
      <AnimatePresence>
        {showConfetti && <Confetti width={width} height={height} recycle={false} numberOfPieces={200}
                                   colors={[primaryColor, secondaryColor, '#ffffff']} />}
      </AnimatePresence>

      <header className="sticky top-0 z-10 px-5 py-3 shadow-sm"
              style={{ backgroundColor: hexToRgba(primaryColor, 0.98), color: safeTextColor(primaryColor) }}>
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-white/10 transition-colors" aria-label="Retour">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base tracking-tight">Détails de réservation</h1>
          {companyInfo?.logoUrl
            ? <LazyLoadImage src={companyInfo.logoUrl} alt="Logo" className="h-8 w-8 rounded-full object-cover border"
                             style={{ borderColor: hexToRgba(safeTextColor(primaryColor), 0.2) }} effect="blur" />
            : <div className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border"
                   style={{ backgroundColor: hexToRgba(safeTextColor(primaryColor), 0.1), borderColor: hexToRgba(safeTextColor(primaryColor), 0.2), color: safeTextColor(primaryColor) }}>
                {companyInfo?.name?.charAt(0) || 'C'}
              </div>}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Barre d’étapes */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
                    className="bg-white rounded-xl p-4 shadow-xs border">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold text-gray-800">Statut de votre réservation</h2>
            <span className="text-xs text-gray-500">{lastUpdated}</span>
          </div>
          <div className="relative">
            <div className="absolute top-3 left-0 right-0 h-1 bg-gray-200 rounded-full z-0">
              <div className="h-full rounded-full transition-all duration-500"
                   style={{ width: `${(currentStepIndex + 1) * 25}%`, backgroundColor: primaryColor }} />
            </div>
            <div className="relative z-10 flex justify-between">
              {['en_attente','paiement_en_cours','preuve_recue','payé'].map((step, idx) => {
                const isActive = idx <= currentStepIndex;
                const isCurrent = reservation.statut === step;
                const isVerification = reservation.statut === 'preuve_recue' && step === 'preuve_recue';
                return (
                  <div key={step} className="flex flex-col items-center w-1/4">
                    <div className={`h-6 w-6 rounded-full flex items-center justify-center mb-1 transition-colors
                                    ${isActive ? 'ring-4 ring-opacity-30' : ''} ${isVerification ? 'animate-pulse' : ''}`}
                         style={{ backgroundColor: isActive ? primaryColor : '#e5e7eb',
                                  color: isActive ? safeTextColor(primaryColor) : '#6b7280',
                                  border: isCurrent ? `2px solid ${safeTextColor(primaryColor)}` : 'none' }}>
                      {isActive ? <CheckCircle className="h-3 w-3" /> : <div className="h-2 w-2 rounded-full bg-gray-400" />}
                    </div>
                    <span className={`text-xs text-center ${isActive ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                      {step === 'en_attente' ? 'Enregistrée' :
                       step === 'paiement_en_cours' ? 'Paiement' :
                       step === 'preuve_recue' ? 'Vérification' : 'Confirmée'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Bandeau statut + références */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                    className={`${reservation.statut === 'payé' ? 'bg-emerald-50/80' :
                                reservation.statut === 'preuve_recue' ? 'bg-violet-50/80' :
                                reservation.statut === 'paiement_en_cours' ? 'bg-blue-50/80' :
                                reservation.statut === 'en_attente' ? 'bg-amber-50/80' : 'bg-red-50/80'} p-4 rounded-xl flex items-start gap-3`}>
          <div className={`p-2 rounded-lg bg-white/80 flex-shrink-0
                           ${reservation.statut === 'payé' ? 'text-emerald-600' :
                              reservation.statut === 'preuve_recue' ? 'text-violet-600' :
                              reservation.statut === 'paiement_en_cours' ? 'text-blue-600' :
                              reservation.statut === 'en_attente' ? 'text-amber-600' : 'text-red-600'}`}>
            {reservation.statut === 'payé' ? <CheckCircle className="h-4 w-4" /> :
             reservation.statut === 'annule' ? <XCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <div>
            <p className="font-medium text-sm mb-1">
              {reservation.statut === 'payé' ? 'Confirmé' :
               reservation.statut === 'annule' ? 'Annulé' :
               reservation.statut === 'preuve_recue' ? 'Vérification' :
               reservation.statut === 'paiement_en_cours' ? 'Paiement en cours' : 'En attente'}
            </p>
            <p className="text-xs text-gray-600">
              {reservation.statut === 'payé' ? '🎉 Votre réservation a été confirmée avec succès !' :
               reservation.statut === 'annule' ? 'Cette réservation a été annulée.' :
               reservation.statut === 'preuve_recue' ? 'Preuve reçue — confirmation en cours.' :
               reservation.statut === 'paiement_en_cours' ? 'Votre paiement est en cours de vérification.' :
               'Votre réservation est en attente de traitement.'}
            </p>

            {reservation.referenceCode && (
              <p className="mt-2 text-xs text-gray-700 flex items-center gap-1">
                <Hash className="h-3 w-3" /> <span className="font-semibold">N°</span> {reservation.referenceCode}
              </p>
            )}
            {agencyName && (
              <p className="text-xs text-gray-600 mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> <span className="font-semibold">Agence :</span> {agencyName}
              </p>
            )}
          </div>
        </motion.div>

        {/* Détails voyage */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
                    className="bg-white rounded-xl shadow-xs border overflow-hidden">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-sm flex items-center gap-2">
              <Ticket className="h-4 w-4" style={{ color: primaryColor }} />
              Détails du voyage
            </h2>
          </div>

          <div className="p-4 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0"><MapPin className="h-4 w-4 text-gray-600" /></div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Itinéraire</p>
                <p className="text-sm font-medium text-gray-900">
                  {reservation.depart} <ChevronRight className="inline h-3 w-3 mx-1 text-gray-400" /> {reservation.arrivee}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0"><Calendar className="h-4 w-4 text-gray-600" /></div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Date</p>
                  <p className="text-sm font-medium text-gray-900">{formatCompactDate(reservation.date)}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0"><Clock className="h-4 w-4 text-gray-600" /></div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">Heure</p>
                  <p className="text-sm font-medium text-gray-900">{reservation.heure}</p>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="p-1.5 rounded-lg bg-gray-100 flex-shrink-0"><CreditCard className="h-4 w-4 text-gray-600" /></div>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Paiement</p>
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium text-gray-900">{reservation.montant.toLocaleString('fr-FR')} FCFA</p>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{paymentMethod.text}</span>
                </div>
              </div>
            </div>

            {reservation.tripType === 'aller-retour' && (
              <div className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                <p className="font-medium text-gray-700 mb-1">Aller-retour</p>
                <div className="flex justify-between">
                  <span>Aller: {reservation.seatsGo} place(s)</span>
                  <span>Retour: {reservation.seatsReturn} place(s)</span>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="text-center pt-4">
          <div className="flex items-center justify-center gap-1 text-sm text-gray-500">
            <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400" />
            <span>Merci pour votre confiance</span>
          </div>
          <p className="text-sm font-medium mt-1" style={{ color: primaryColor }}>
            {reservation.companyName || companyInfo?.name || 'Votre compagnie'}
          </p>
        </motion.div>
      </main>

      <div className="fixed bottom-0 left-0 w-full z-40 bg-white border-t border-gray-200 px-4 py-3 shadow-md">
        <div className="max-w-md mx-auto space-y-2">
          <button
            onClick={() => {
              const slugToUse = realSlug || slug;
              navigate(`/${slugToUse}/receipt/${reservation.id}`, {
                state: { reservation: { ...reservation, agencyNom: agencyName }, companyInfo }
              });
            }}
            className={`w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition-all ${isConfirmed ? 'hover:opacity-90' : 'opacity-70 cursor-not-allowed'}`}
            style={{ backgroundColor: primaryColor, color: safeTextColor(primaryColor) }}
            disabled={!isConfirmed}
          >
            <CheckCircle className="h-4 w-4" />
            {isConfirmed ? 'Voir mon billet' : 'Billet disponible après confirmation'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReservationDetailsPage;
