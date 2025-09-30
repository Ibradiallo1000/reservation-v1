// src/pages/ReservationDetailsPage.tsx
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

type ReservationStatus = 'en_attente' | 'paiement_en_cours' | 'preuve_recue' | 'payé' | 'annule' | string;
type PaymentMethod = 'mobile_money' | 'carte_bancaire' | 'espèces' | 'autre' | 'en_ligne' | 'guichet' | string;

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

  // ---- statut & canal
  statut: ReservationStatus;
  canal?: PaymentMethod;

  // ---- champs possibles venant du back
  statutEmbarquement?: string;
  boarded?: boolean;
  boardedAt?: any;
  paidAt?: any;
  validatedAt?: any;
  paymentMethodLabel?: string;

  // ---- autres
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

/* ====== Mémoire locale (alignée avec la page de réservation) ====== */
const PENDING_KEY = 'pendingReservation';
const STEP_KEY = (slug?: string) => `mb:lastStep:${slug || ''}`;
const isBlockingStatus = (s?: string) =>
  ['preuve_recue', 'payé'].includes(String(s || '').toLowerCase());

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

const getPaymentChip = (label?: string) =>
  label ? { text: label, icon: <CreditCard className="h-4 w-4" /> }
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

/* ====== Classement de statut pour décider l’écran ====== */
function statusRank(r?: Reservation) {
  if (!r) return 0;
  const s = (r.statut || '').toLowerCase();
  const se = (r.statutEmbarquement || '').toLowerCase();

  // 3 = embarqué
  if (r.boarded || r.boardedAt || se.includes('embarq')) return 3;

  // 2 = payé / confirmé
  if (r.paidAt || r.validatedAt ||
      ['pay', 'confirm', 'valid'].some(k => s.includes(k))) return 2;

  // 1 = preuve reçue / en vérif
  if (['preuve', 'verif', 'vérif'].some(k => s.includes(k))) return 1;

  // 0 = attente paiement / brouillon
  return 0;
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
  const secondaryColor = companyInfo?.secondaryColor || '#60a5fa';

  // 💾 On mémorise l’écran courant
  useEffect(() => {
    try { localStorage.setItem(STEP_KEY(slug), 'details'); } catch {}
  }, [slug]);

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

          // si arrivé via token, normaliser l’URL
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
        <div className="bg-white rounded-xl shadow-sm p-6 max-w-md w-full text-center border border-gray-100">
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

  /* ===== Décision d’affichage : billet direct ou stepper ? ===== */
  const canal = String(reservation.canal || '').toLowerCase();
  const rank = statusRank(reservation);
  const showTicketDirect = canal === 'guichet' || rank >= 2; // guichet OU payé/embarqué → billet direct

  /* ===== 🚀 Redirection automatique si billet disponible ===== */
  useEffect(() => {
    if (!showTicketDirect || !reservation) return;
    const slugToUse = (location as any)?.state?.slug || reservation.companySlug || slug;
    navigate(`/${slugToUse}/receipt/${reservation.id}`, {
      replace: true,
      state: { reservation: { ...reservation, agencyNom: agencyName, canal }, companyInfo }
    });
  }, [showTicketDirect, reservation, agencyName, companyInfo, canal, slug, location, navigate]);

  /** --- Étapes (uniquement pour l’en-ligne non confirmé) --- */
  const STEPS: Array<'paiement_en_cours' | 'preuve_recue' | 'payé'> = ['paiement_en_cours', 'preuve_recue', 'payé'];
  const normalizedStatus =
    reservation.statut === 'en_attente' ? 'paiement_en_cours' : reservation.statut;
  const currentStepIndex = Math.max(0, STEPS.indexOf(normalizedStatus as any));

  // Méthode de paiement affichée
  const paymentLabel =
    canal === 'guichet'
      ? 'Espèces'
      : (reservation.paymentMethodLabel ||
         (reservation.canal && reservation.canal !== 'en_ligne' ? String(reservation.canal).replace(/_/g,' ') : 'En ligne'));

  const paymentChip = getPaymentChip(paymentLabel);
  const lastUpdated = reservation.updatedAt && !isNaN(new Date(reservation.updatedAt).getTime())
    ? new Date(reservation.updatedAt).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="min-h-screen pb-32" style={{ background: 'linear-gradient(180deg, #f8fafc, #ffffff)' }}>
      <AnimatePresence>
        {reservation.statut === 'payé' && (
          <Confetti
            width={width}
            height={height}
            recycle={false}
            numberOfPieces={200}
            colors={[primaryColor, secondaryColor, '#ffffff']}
          />
        )}
      </AnimatePresence>

      {/* Header */}
      <header
        className="sticky top-0 z-10 px-5 py-3 shadow-sm"
        style={{
          backgroundColor: primaryColor,
          color: safeTextColor(primaryColor),
          boxShadow: '0 1px 0 rgba(0,0,0,0.06)'
        }}
      >
        <div className="flex items-center justify-between max-w-md mx-auto">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-full hover:bg-black/10 transition-colors" aria-label="Retour">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="font-semibold text-base tracking-tight">Détails de réservation</h1>
          {companyInfo?.logoUrl
            ? (
              <LazyLoadImage
                src={companyInfo.logoUrl}
                alt="Logo"
                className="h-8 w-8 rounded-full object-cover border"
                style={{ borderColor: 'rgba(255,255,255,0.25)' }}
                effect="blur"
              />
            )
            : (
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center text-sm font-medium border"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.15)',
                  borderColor: 'rgba(255,255,255,0.35)',
                  color: safeTextColor(primaryColor)
                }}
              >
                {companyInfo?.name?.charAt(0) || 'C'}
              </div>
            )}
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-5 space-y-5">
        {/* Étapes – visibles UNIQUEMENT si pas billet direct */}
        {!showTicketDirect && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl p-4 border shadow-xs bg-white"
            style={{ borderColor: 'rgba(0,0,0,0.06)' }}
          >
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-semibold text-gray-800">Statut de votre réservation</h2>
              <span className="text-xs text-gray-500">{lastUpdated}</span>
            </div>

            <div className="relative">
              <div className="absolute top-3 left-0 right-0 h-1 bg-gray-200 rounded-full z-0" />
              <motion.div
                className="absolute top-3 left-0 h-1 rounded-full z-0"
                style={{ backgroundColor: primaryColor }}
                initial={{ width: 0 }}
                animate={{ width: `${((currentStepIndex + 1) / STEPS.length) * 100}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 18 }}
              />
              <div className="relative z-10 flex justify-between">
                {STEPS.map((step, idx) => {
                  const isActive = idx <= currentStepIndex;
                  const isCurrent = idx === currentStepIndex && reservation.statut !== 'payé';
                  const label =
                    step === 'paiement_en_cours' ? 'Paiement' :
                    step === 'preuve_recue' ? 'Vérification' : 'Confirmée';

                  return (
                    <div key={step} className="flex flex-col items-center w-1/3">
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
                            : isCurrent
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <div className="h-2 w-2 rounded-full bg-gray-400" />}
                        </div>
                        {isCurrent && (
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
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* Bandeau statut + références */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="p-4 rounded-xl flex items-start gap-3 border bg-white"
          style={{
            borderColor:
              showTicketDirect
                ? hexToRgba('#10b981', 0.2) // considéré comme confirmé pour l’affichage
                : reservation.statut === 'preuve_recue'
                ? hexToRgba('#7c3aed', 0.2)
                : reservation.statut === 'paiement_en_cours' || reservation.statut === 'en_attente'
                ? 'rgba(0,0,0,0.06)'
                : hexToRgba('#ef4444', 0.2)
          }}
        >
          <div
            className="p-2 rounded-lg flex-shrink-0"
            style={{
              backgroundColor: '#ffffff',
              color:
                showTicketDirect
                  ? '#059669'
                  : reservation.statut === 'preuve_recue'
                  ? '#6d28d9'
                  : reservation.statut === 'paiement_en_cours' || reservation.statut === 'en_attente'
                  ? primaryColor
                  : '#dc2626'
            }}
          >
            {showTicketDirect ? <CheckCircle className="h-4 w-4" /> :
             reservation.statut === 'annule' ? <XCircle className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
          </div>
          <div>
            <p className="font-medium text-sm mb-1">
              {showTicketDirect ? 'Confirmé'
               : reservation.statut === 'annule' ? 'Annulé'
               : reservation.statut === 'preuve_recue' ? 'Vérification'
               : reservation.statut === 'paiement_en_cours' || reservation.statut === 'en_attente' ? 'Paiement en cours'
               : 'Statut'}
            </p>
            <p className="text-xs text-gray-600">
              {showTicketDirect ? 'Votre billet est disponible.'
               : reservation.statut === 'annule' ? 'Cette réservation a été annulée.'
               : reservation.statut === 'preuve_recue' ? 'Preuve reçue — confirmation en cours.'
               : 'Votre paiement est en cours de vérification.'}
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

        {/* Détails */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
          className="rounded-xl shadow-xs border overflow-hidden bg-white"
          style={{ borderColor: 'rgba(0,0,0,0.06)' }}
        >
          <div className="p-4 border-b" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
            <h2 className="font-semibold text-sm flex items-center gap-2" style={{ color: '#111827' }}>
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
                  <span className="text-xs text-gray-600 bg-gray-100 px-2 py-1 rounded">{paymentChip.text}</span>
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
        </motion.div>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="text-center pt-4">
          <div className="flex items-center justify-center gap-1 text-sm text-gray-600">
            <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400" />
            <span>Merci pour votre confiance</span>
          </div>
          <p className="text-sm font-medium mt-1" style={{ color: primaryColor }}>
            {reservation.companyName || companyInfo?.name || 'Votre compagnie'}
          </p>
        </motion.div>
      </main>

      {/* CTA bas */}
      <div
        className="fixed bottom-0 left-0 w-full z-40 px-4 py-3 shadow-md border-t"
        style={{ backgroundColor: '#ffffff', borderColor: 'rgba(0,0,0,0.06)' }}
      >
        <div className="max-w-md mx-auto">
          <button
            onClick={() => {
              const slugToUse = (location as any)?.state?.slug || reservation.companySlug || slug;
              navigate(`/${slugToUse}/receipt/${reservation.id}`, {
                state: { reservation: { ...reservation, agencyNom: agencyName, canal }, companyInfo }
              });
            }}
            className={`w-full py-3 rounded-lg text-sm font-medium flex items-center justify-center gap-2 shadow-sm transition-all ${showTicketDirect ? 'hover:opacity-95' : 'opacity-70 cursor-not-allowed'}`}
            style={{
              background: showTicketDirect
                ? `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`
                : `linear-gradient(135deg, ${hexToRgba(primaryColor,0.5)}, ${hexToRgba(secondaryColor,0.5)})`,
              color: safeTextColor(primaryColor)
            }}
            disabled={!showTicketDirect}
          >
            <CheckCircle className="h-4 w-4" />
            {showTicketDirect ? 'Voir mon billet' : 'Billet disponible après confirmation'}
          </button>
        </div>
      </div>

      {/* keyframes pour l’anneau “ping” */}
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
