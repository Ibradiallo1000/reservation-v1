// src/pages/AgenceGuichetPage.tsx
// ===================================================================
// Guichet : VENTE EN ESPÈCES UNIQUEMENT (canal=guichet)
// - Paiement forcé à "espèces"
// - Gestion de poste : none → (Demander l’activation) → pending → active/paused → closed
// - Places restantes (live) : statut = 'payé', somme seatsGo, fallback 30, onSnapshot
// - Onglets locaux : Guichet / Rapport / Historique
// - AMÉLIORATIONS :
//   • arrivée -> auto 1ère date + 1er horaire dispo (priorité places)
//   • après clôture → on voit la session dans “Rapport” (en attente de validation)
// ===================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, getDocs, query, where, Timestamp, addDoc, doc, getDoc,
  updateDoc, orderBy, onSnapshot, runTransaction, setDoc, limit
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveShift } from '@/hooks/useActiveShift';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import { useNavigate } from 'react-router-dom';
import { makeShortCode } from '@/utils/brand';

import ReceiptModal, {
  type ReservationData as ReceiptReservation,
  type CompanyData as ReceiptCompany
} from '@/components/ReceiptModal';

import {
  Building2, MapPin, CalendarDays, Clock4,
  Ticket, LogOut, RefreshCw
} from 'lucide-react';

import UserMenu from '@/ui/UserMenu'; // ✅ menu utilisateur (cog/bonhomme)
import { Settings } from 'lucide-react';
import Button from '@/ui/Button';
type TripType = 'aller_simple' | 'aller_retour';

type WeeklyTrip = {
  id: string;
  departure: string;
  arrival: string;
  active: boolean;
  horaires: Record<string, string[]>;
  price: number;
  places?: number;
};

type Trip = {
  id: string;   // weeklyTripId_YYYY-MM-DD_HH:mm
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  departure: string;
  arrival: string;
  price: number;
  places: number;
  remainingSeats?: number;
};

type TicketRow = {
  id: string;
  referenceCode?: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  nomClient: string;
  telephone?: string;
  seatsGo: number;
  seatsReturn?: number;
  montant: number;
  paiement?: string;
  createdAt?: any;
  guichetierCode?: string;
};

/** Rapport (1–1) d’une session clôturée */
type ShiftReport = {
  shiftId: string;
  companyId: string;
  agencyId: string;
  userId: string;
  userName?: string;
  userCode?: string;
  startAt: Timestamp;
  endAt: Timestamp;
  billets: number;
  montant: number;
  details: { trajet: string; billets: number; montant: number; heures: string[] }[];
  accountantValidated: boolean;
  managerValidated: boolean;
  createdAt?: any;
  updatedAt?: any;
};

const DAYS_IN_ADVANCE = 8;
const MAX_SEATS_FALLBACK = 30;
const DEFAULT_COMPANY_SLUG = 'compagnie-par-defaut';

async function getSellerCodeFromFirestore(uid?: string | null) {
  try {
    if (!uid) return null;
    const s = await getDoc(doc(db, 'users', uid));
    if (!s.exists()) return null;
    const u = s.data() as any;
    return u.staffCode || u.codeCourt || u.code || null;
  } catch {
    return null;
  }
}

// Génère une référence unique, de façon atomique (anti collisions)
async function generateReferenceCodeForTripInstance(opts: {
  companyId: string; companyCode?: string;
  agencyId: string;  agencyCode?: string;
  tripInstanceId: string;
  sellerCode: string;
}) {
  const { companyId, companyCode = 'COMP', agencyId, agencyCode = 'AGC', tripInstanceId, sellerCode } = opts;
  const counterRef = doc(db, `companies/${companyId}/counters/byTrip/trips/${tripInstanceId}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const last = snap.exists() ? ((snap.data() as any).lastSeq || 0) : 0;
    const n = last + 1;
    if (!snap.exists()) {
      tx.set(counterRef, { lastSeq: n, updatedAt: Timestamp.now() });
    } else {
      tx.update(counterRef, { lastSeq: n, updatedAt: Timestamp.now() });
    }
    return n;
  }).catch(async () => {
    await setDoc(counterRef, { lastSeq: 1, updatedAt: Timestamp.now() }, { merge: true });
    return 1;
  });

  return `${companyCode}-${agencyCode}-${sellerCode}-${String(next).padStart(3, '0')}`;
}

// Couleur du badge + libellé FR selon le % de places restantes
function seatBadgeStyle(remaining: number | undefined, total: number) {
  if (remaining === undefined) return { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Calcul…' };
  if (remaining <= 0) return { bg: 'bg-red-100', text: 'text-red-700', label: 'Complet' };
  const pct = (remaining / Math.max(1, total)) * 100;
  const label = `${remaining} place${remaining > 1 ? 's' : ''} restantes`;
  if (pct > 60) return { bg: 'bg-green-100', text: 'text-green-700', label };
  if (pct > 30) return { bg: 'bg-amber-100', text: 'text-amber-700', label };
  return { bg: 'bg-red-100', text: 'text-red-700', label };
}

const AgenceGuichetPage: React.FC = () => {
  const navigate = useNavigate();
  const auth = useAuth() as any;
  const { user, company } = auth;
  const logout: (() => Promise<void>) = auth?.logout ?? (async () => {});

  const shiftApi = useActiveShift();
  const { activeShift, startShift, pauseShift, continueShift, closeShift, refresh } = shiftApi;

  const theme = useCompanyTheme(company) || { primary: '#EA580C', secondary: '#F97316' };

  // onglets
  const [tab, setTab] = useState<'guichet' | 'rapport' | 'historique'>('guichet');

  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>('Compagnie');
  const [agencyName, setAgencyName] = useState<string>('Agence');
  const [companyPhone, setCompanyPhone] = useState<string>('');

  const [departure, setDeparture] = useState<string>('');
  const [arrival, setArrival] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [allArrivals, setAllArrivals] = useState<string[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  const [nomClient, setNomClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [tripType, setTripType] = useState<TripType>('aller_simple');
  const [placesAller, setPlacesAller] = useState(1);
  const [placesRetour, setPlacesRetour] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);

  // Live ventes poste courant (si en service)
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // Rapports de sessions en attente (après clôture, avant validations)
  const [pendingReports, setPendingReports] = useState<ShiftReport[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Historique : sessions validées
  const [historyReports, setHistoryReports] = useState<ShiftReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<ReceiptReservation | null>(null);
  const [receiptCompany, setReceiptCompany] = useState<ReceiptCompany | null>(null);

  const [sellerCodeUI, setSellerCodeUI] = useState<string>(
    (user as any)?.staffCode || (user as any)?.codeCourt || (user as any)?.code || 'GUEST'
  );
  const staffCodeForSale =
    (user as any)?.staffCode || (user as any)?.codeCourt || (user as any)?.code || 'GUEST';

  const status: 'active' | 'paused' | 'closed' | 'pending' | 'none' =
    (activeShift?.status as any) ?? 'none';
  const canSell = status === 'active' && !!user?.companyId && !!user?.agencyId;

  // listener des places restantes
  const remainingUnsubRef = useRef<() => void>();

  const availableDates = useMemo(
    () => Array.from({ length: DAYS_IN_ADVANCE }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    }),
    []
  );

  const isPastTime = useCallback((dateISO: string, hhmm: string) => {
    const [H, M] = hhmm.split(':').map(Number);
    const d = new Date(dateISO); d.setHours(H, M, 0, 0);
    return d.getTime() < Date.now();
  }, []);

  /* -------------------- INIT socle -------------------- */
  useEffect(() => {
    (async () => {
      try {
        if (user?.uid) {
          const fromDb = await getSellerCodeFromFirestore(user.uid);
          if (fromDb) setSellerCodeUI(fromDb);
        }
        if (!user?.companyId || !user?.agencyId) return;

        const compSnap = await getDoc(doc(db, 'companies', user.companyId));
        if (compSnap.exists()) {
          const c = compSnap.data() as any;
          setCompanyLogo(c.logoUrl || c.logo || null);
          setCompanyName(c.nom || c.name || 'Compagnie');
          setCompanyPhone(c.telephone || '');
        }

        const agSnap = await getDoc(doc(db, `companies/${user.companyId}/agences/${user.agencyId}`));
        if (agSnap.exists()) {
          const a = agSnap.data() as any;
          const ville = a?.ville || a?.city || a?.nomVille || a?.villeDepart || '';
          setDeparture((ville || '').toString());
          setAgencyName(a?.nomAgence || a?.nom || ville || 'Agence');
        }

        const weeklyRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/weeklyTrips`);
        const snap = await getDocs(query(weeklyRef, where('active', '==', true)));
        const arrivals = Array.from(new Set(snap.docs.map(d => (d.data() as WeeklyTrip).arrival).filter(Boolean)))
          .sort((a, b) => a.localeCompare(b, 'fr'));
        setAllArrivals(arrivals);
      } catch (e) {
        console.error('[GUICHET] init:error', e);
      }
    })();
  }, [user?.uid, user?.companyId, user?.agencyId]);

  /* -------------------- Live remaining seats -------------------- */
  // (PLACÉ AVANT searchTrips pour éviter TS2448/2454)
  const loadRemainingForDate = useCallback(async (
    dateISO: string,
    dep: string,
    arr: string,
    baseList?: Trip[],
    pickFirst: boolean = false
  ) => {
    try {
      if (!user?.companyId || !user?.agencyId) return;

      if (remainingUnsubRef.current) {
        remainingUnsubRef.current();
        remainingUnsubRef.current = undefined;
      }

      const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
      const qy = query(
        rRef,
        where('date', '==', dateISO),
        where('depart', '==', dep),
        where('arrivee', '==', arr)
      );

      const unsub = onSnapshot(qy, (snap) => {
        const usedByTrip: Record<string, number> = {};

        snap.forEach((d) => {
          const r = d.data() as any;
          const statut = String(r.statut || '').toLowerCase();
          if (statut !== 'payé') return; // **compter uniquement "payé"**
          const tripKey = r.trajetId;
          const seats = Number(r.seatsGo || 0);
          usedByTrip[tripKey] = (usedByTrip[tripKey] || 0) + seats;
        });

        setTrips((prev) => {
          const src  = baseList ?? prev;
          const next = src.map((t) => {
            if (t.date !== dateISO) return t;
            const total = t.places || MAX_SEATS_FALLBACK;
            const used  = usedByTrip[t.id] || 0;
            return { ...t, remainingSeats: Math.max(0, total - used) };
          });

          const filtered = next
            .filter((t) => t.date === dateISO && !isPastTime(t.date, t.time))
            .sort((a, b) => a.time.localeCompare(b.time));

          setFilteredTrips(filtered);

          // **Sélection auto 1er horaire** (si rien n’est déjà choisi)
          if (pickFirst && filtered.length > 0) {
            const firstWithSeats = filtered.find(f => {
              const rs = f.remainingSeats;
              return (rs === undefined) ? true : rs > 0;
            }) || filtered[0];

            setSelectedTrip(prevSel => prevSel ?? firstWithSeats);
          }

          return next;
        });
      }, (err) => {
        console.error('[GUICHET] loadRemainingForDate:snapshot:error', err);
      });

      remainingUnsubRef.current = unsub;
    } catch (e) {
      console.error('[GUICHET] loadRemainingForDate:error', e);
    }
  }, [isPastTime, user?.companyId, user?.agencyId]);

  /* -------------------- Recherche trajets -------------------- */
  const searchTrips = useCallback(async (dep: string, arr: string) => {
    try {
      // reset immédiat pour éviter un affichage fantôme
      setTrips([]); setFilteredTrips([]); setSelectedTrip(null); setSelectedDate('');

      if (!dep || !arr || !user?.companyId || !user?.agencyId) return;

      const weeklyRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/weeklyTrips`);
      const weekly = (await getDocs(query(weeklyRef, where('active', '==', true)))).docs
        .map(d => ({ id: d.id, ...d.data() })) as WeeklyTrip[];

      const out: Trip[] = [];
      const now = new Date();
      for (let i = 0; i < DAYS_IN_ADVANCE; i++) {
        const d = new Date(now); d.setDate(now.getDate() + i);
        const jour = d.toLocaleDateString('fr-FR', { weekday: 'long' }).toLowerCase();
        const dateISO = d.toISOString().split('T')[0];
        weekly.forEach(w => {
          if (!w.active) return;
          if ((w.departure || '').toLowerCase().trim() !== dep.toLowerCase().trim()) return;
          if ((w.arrival || '').toLowerCase().trim() !== arr.toLowerCase().trim()) return;
          (w.horaires?.[jour] || []).forEach(h => {
            out.push({
              id: `${w.id}_${dateISO}_${h}`,
              date: dateISO,
              time: h,
              departure: w.departure,
              arrival: w.arrival,
              price: w.price,
              places: w.places || MAX_SEATS_FALLBACK
            });
          });
        });
      }

      // tri date + heure AVANT filtrage passé
      out.sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));

      const future = out.filter(t => !isPastTime(t.date, t.time));
      setTrips(future);

      // pré-sélection auto 1ère date & 1ère heure
      const firstDate = future[0]?.date || '';
      setSelectedDate(firstDate);
      setSelectedTrip(null);

      if (firstDate) {
        // pickFirst = true → sélectionne automatiquement le 1er horaire dispo
        await loadRemainingForDate(firstDate, dep, arr, future, true);
      } else {
        setFilteredTrips([]);
      }
    } catch (e) {
      console.error('[GUICHET] searchTrips:error', e);
    }
  }, [isPastTime, user?.agencyId, user?.companyId, loadRemainingForDate]);

  // Quand on change d’arrivée ou de ville de départ → on relance la recherche
  useEffect(() => {
    if (!arrival) {
      setTrips([]); setFilteredTrips([]); setSelectedTrip(null); setSelectedDate(''); return;
    }
    searchTrips(departure, arrival);
  }, [arrival, departure, searchTrips]);

  const handleSelectDate = useCallback(async (date: string) => {
    setSelectedDate(date);
    setSelectedTrip(null);
    // pickFirst = true pour auto-sélectionner la 1ère heure de cette date
    await loadRemainingForDate(date, departure, arrival, undefined, true);
  }, [arrival, departure, loadRemainingForDate]);

  useEffect(() => {
    return () => {
      if (remainingUnsubRef.current) { remainingUnsubRef.current(); remainingUnsubRef.current = undefined; }
    };
  }, []);

  /* -------------------- Prix total -------------------- */
  const totalPrice = useMemo(() => {
    if (!selectedTrip) return 0;
    const base = selectedTrip.price;
    const qty = tripType === 'aller_retour' ? (placesAller + placesRetour) : placesAller;
    return Math.max(0, base * Math.max(0, qty));
  }, [selectedTrip, tripType, placesAller, placesRetour]);

  const validPhone = (v: string) => /\d{7,}/.test((v||'').replace(/\D/g,''));

  /* -------------------- Réservation -------------------- */
  const handleReservation = useCallback(async () => {
    if (!selectedTrip || !nomClient || !telephone) return;
    if (!canSell) { alert('Démarrez/activez votre poste.'); return; }
    if (!validPhone(telephone)) { alert('Téléphone invalide.'); return; }

    if (selectedTrip.remainingSeats !== undefined) {
      const needed = tripType === 'aller_retour' ? (placesAller + placesRetour) : placesAller;
      if (needed > selectedTrip.remainingSeats) { alert(`Il reste ${selectedTrip.remainingSeats} places.`); return; }
      if (needed <= 0) { alert('Nombre de places invalide.'); return; }
    }

    if (totalPrice <= 0) { alert('Montant invalide.'); return; }

    setIsProcessing(true);
    try {
      const compSnap = await getDoc(doc(db, 'companies', user!.companyId));
      const comp = compSnap.data() || {};
      const companyNameFull = (comp as any).nom || 'Compagnie';
      const companyCode = makeShortCode(companyNameFull, (comp as any).code);
      const companySlug = (comp as any).slug || DEFAULT_COMPANY_SLUG;

      const agSnap = await getDoc(doc(db, `companies/${user!.companyId}/agences/${user!.agencyId}`));
      const ag = agSnap.data() || {};
      const agencyNameLocal = (ag as any).nomAgence || (ag as any).nom || '';
      const agencyCode = makeShortCode(agencyNameLocal, (ag as any).code);
      const agencyTelephone = (ag as any).telephone || '';

      const sellerCode = (await getSellerCodeFromFirestore(user?.uid)) || staffCodeForSale;

      const referenceCode = await generateReferenceCodeForTripInstance({
        companyId: user!.companyId, companyCode,
        agencyId: user!.agencyId, agencyCode,
        tripInstanceId: selectedTrip.id, sellerCode
      });

      // Paiement forcé espèces + canal guichet
      const data = {
        trajetId: selectedTrip.id,
        date: selectedTrip.date, heure: selectedTrip.time,
        depart: selectedTrip.departure, arrivee: selectedTrip.arrival,
        nomClient, telephone, email: null,
        seatsGo: placesAller, seatsReturn: tripType === 'aller_retour' ? placesRetour : 0,
        montant: totalPrice, statut: 'payé', statutEmbarquement: 'en_attente',
        checkInTime: null, reportInfo: null,
        compagnieId: user!.companyId, agencyId: user!.agencyId,
        companySlug, compagnieNom: (comp as any).nom || 'Compagnie',
        agencyNom: agencyNameLocal, agencyTelephone,
        canal: 'guichet', paiement: 'espèces',
        paiementSource: 'encaisse_guichet',
        guichetierId: user!.uid, guichetierCode: sellerCode,
        shiftId: activeShift?.id || null,
        referenceCode, qrCode: null, tripType,
        createdAt: Timestamp.now(),
      };

      const ref = collection(db, `companies/${user!.companyId}/agences/${user!.agencyId}/reservations`);
      const created = await addDoc(ref, data);
      await updateDoc(doc(db, `companies/${user!.companyId}/agences/${user!.agencyId}/reservations`, created.id), { qrCode: created.id });

      const reservationForModal: ReceiptReservation = {
        id: created.id, nomClient, telephone,
        date: data.date, heure: data.heure, depart: data.depart, arrivee: data.arrivee,
        seatsGo: data.seatsGo, seatsReturn: data.seatsReturn, montant: data.montant,
        statut: data.statut, paiement: data.paiement,
        compagnieId: user!.companyId, compagnieNom: (comp as any).nom || 'Compagnie',
        agencyId: user!.agencyId, agencyNom: agencyNameLocal, nomAgence: agencyNameLocal,
        agenceTelephone: agencyTelephone, canal: 'guichet',
        createdAt: new Date(), companySlug, referenceCode,
        qrCode: created.id, guichetierId: user!.uid, guichetierCode: sellerCode,
        shiftId: activeShift?.id || null, email: undefined,
      };

      const companyForModal: ReceiptCompany = {
        nom: (comp as any).nom || 'Compagnie',
        logoUrl: (comp as any).logoUrl || (comp as any).logo || companyLogo || undefined,
        couleurPrimaire: theme.primary, couleurSecondaire: theme.secondary,
        slug: companySlug, telephone: companyPhone || undefined,
      };

      setReceiptData(reservationForModal);
      setReceiptCompany(companyForModal);
      setShowReceipt(true);

      // Reset UI (le live mettra à jour les places automatiquement)
      setNomClient(''); setTelephone('');
      setTripType('aller_simple'); setPlacesAller(1); setPlacesRetour(0);

      await loadRemainingForDate(selectedTrip.date, selectedTrip.departure, selectedTrip.arrival);
    } catch (e) {
      console.error('[GUICHET] reservation:error', e);
      alert('Erreur lors de la réservation.');
    } finally {
      setIsProcessing(false);
    }
  }, [
    selectedTrip, nomClient, telephone, canSell, user,
    placesAller, placesRetour, tripType, totalPrice,
    activeShift, staffCodeForSale, theme.primary, theme.secondary, companyLogo, companyPhone,
    loadRemainingForDate
  ]);

  /* -------------------- Live ventes du poste courant -------------------- */
  const loadReport = useCallback(async () => {
    try {
      if (!user?.companyId || !user?.agencyId || !activeShift?.id) { setTickets([]); return; }
      setLoadingReport(true);

      const rRef = collection(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations`);
      const snap = await getDocs(query(
        rRef,
        where('shiftId', '==', activeShift.id),
        where('canal', '==', 'guichet'),
        orderBy('createdAt', 'asc')
      ));
      const rows: TicketRow[] = snap.docs.map(d => {
        const r = d.data() as any;
        return {
          id: d.id, referenceCode: r.referenceCode, date: r.date, heure: r.heure,
          depart: r.depart, arrivee: r.arrivee, nomClient: r.nomClient, telephone: r.telephone,
          seatsGo: r.seatsGo || 1, seatsReturn: r.seatsReturn || 0, montant: r.montant || 0,
          paiement: r.paiement, createdAt: r.createdAt, guichetierCode: r.guichetierCode || '',
        };
      });
      setTickets(rows);
    } catch (e) {
      console.error('[GUICHET] loadReport:error', e);
    } finally {
      setLoadingReport(false);
    }
  }, [user?.companyId, user?.agencyId, activeShift?.id]);

  const totals = useMemo(() => {
    const agg = { billets: 0, montant: 0 };
    for (const t of tickets) {
      const nb = (t.seatsGo || 0) + (t.seatsReturn || 0);
      agg.billets += nb; agg.montant += t.montant || 0;
    }
    return agg;
  }, [tickets]);

  /* -------------------- Rapports en attente (shiftReports) -------------------- */
  const loadPendingReports = useCallback(async () => {
    try {
      if (!user?.companyId || !user?.agencyId || !user?.uid) { setPendingReports([]); return; }
      setLoadingPending(true);
      const base = `companies/${user.companyId}/agences/${user.agencyId}`;
      const repRef = collection(db, `${base}/shiftReports`);
      // en attente = au moins une des validations est false
      const snap = await getDocs(query(
        repRef,
        where('userId', '==', user.uid),
        where('accountantValidated', '==', false)
      ));
      const snap2 = await getDocs(query(
        repRef,
        where('userId', '==', user.uid),
        where('accountantValidated', '==', true),
        where('managerValidated', '==', false)
      ));
      const rows: ShiftReport[] = [...snap.docs, ...snap2.docs]
        .reduce((acc, d) => {
          const r = d.data() as any;
          acc.push({
            shiftId: d.id,
            companyId: r.companyId, agencyId: r.agencyId,
            userId: r.userId, userName: r.userName, userCode: r.userCode,
            startAt: r.startAt, endAt: r.endAt,
            billets: r.billets || 0, montant: r.montant || 0,
            details: Array.isArray(r.details) ? r.details : [],
            accountantValidated: !!r.accountantValidated,
            managerValidated: !!r.managerValidated,
            createdAt: r.createdAt, updatedAt: r.updatedAt,
          });
          return acc;
        }, [] as ShiftReport[])
        // tri du + récent au + ancien sur endAt
        .sort((a,b) => (b.endAt?.toMillis?.() ?? 0) - (a.endAt?.toMillis?.() ?? 0));

      setPendingReports(rows);
    } catch (e) {
      console.error('[GUICHET] loadPendingReports:error', e);
    } finally {
      setLoadingPending(false);
    }
  }, [user?.companyId, user?.agencyId, user?.uid]);

  /* -------------------- Historique (shiftReports validés) -------------------- */
  const loadHistory = useCallback(async () => {
    try {
      if (!user?.companyId || !user?.agencyId || !user?.uid) { setHistoryReports([]); return; }
      setLoadingHistory(true);
      const base = `companies/${user.companyId}/agences/${user.agencyId}`;
      const repRef = collection(db, `${base}/shiftReports`);
      const snap = await getDocs(query(
        repRef,
        where('userId', '==', user.uid),
        where('accountantValidated', '==', true),
        where('managerValidated', '==', true),
        orderBy('endAt', 'desc'),
        limit(50)
      ));
      const rows: ShiftReport[] = snap.docs.map(d => {
        const r = d.data() as any;
        return {
          shiftId: d.id,
          companyId: r.companyId, agencyId: r.agencyId,
          userId: r.userId, userName: r.userName, userCode: r.userCode,
          startAt: r.startAt, endAt: r.endAt,
          billets: r.billets || 0, montant: r.montant || 0,
          details: Array.isArray(r.details) ? r.details : [],
          accountantValidated: !!r.accountantValidated,
          managerValidated: !!r.managerValidated,
          createdAt: r.createdAt, updatedAt: r.updatedAt,
        };
      });
      setHistoryReports(rows);
    } catch (e) {
      console.error('[GUICHET] loadHistory:error', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [user?.companyId, user?.agencyId, user?.uid]);

  // Charger quand on ouvre les onglets
  useEffect(() => {
    if (tab === 'rapport') {
      // Live ventes si poste actif/pausé
      if (activeShift?.id && (status === 'active' || status === 'paused' || status === 'pending')) {
        void loadReport();
      } else {
        setTickets([]);
      }
      void loadPendingReports();
    }
  }, [tab, loadReport, loadPendingReports, activeShift?.id, status]);

  useEffect(() => { if (tab === 'historique') void loadHistory(); }, [tab, loadHistory]);

  /* ------------------------------------ JSX ------------------------------------ */
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #report-print, #report-print * { visibility: visible !important; }
          #report-print { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        @page { size: auto; margin: 10mm; }
      `}</style>

      {/* EN-TÊTE */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {companyLogo
              ? <img src={companyLogo} alt="logo" className="h-10 w-10 rounded object-contain border" />
              : <div className="h-10 w-10 rounded bg-gray-200 grid place-items-center"><Building2 className="h-5 w-5 text-gray-500"/></div>}
            <div>
              <div
                className="text-lg font-bold"
                style={{background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}
              >
                {companyName}
              </div>
              <div className="text-xs text-gray-500 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5"/><span>{agencyName}</span>
              </div>
            </div>
          </div>

          {/* onglets */}
          <div className="inline-flex rounded-xl p-1 bg-gray-100 shadow-inner">
            <button
              type="button"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab==='guichet' ? 'text-white' : 'hover:bg-white'}`}
              onClick={() => setTab('guichet')}
              style={tab==='guichet'
                ? { background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }
                : {}}
            >
              Guichet
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab==='rapport' ? 'text-white' : 'hover:bg-white'}`}
              onClick={() => setTab('rapport')}
              style={tab==='rapport'
                ? { background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }
                : {}}
            >
              Rapport
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab==='historique' ? 'text-white' : 'hover:bg-white'}`}
              onClick={() => setTab('historique')}
              style={tab==='historique'
                ? { background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }
                : { color: theme.primary }}
            >
              Historique
            </button>
          </div>

          {/* État de poste + actions + menu utilisateur */}
          <div className="flex items-center gap-3">
            {/* État + actions (bloc original conservé) */}
            <div className="flex items-center gap-2">
              <div
                className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{
                  backgroundColor:
                    status==='active' ? '#DCFCE7'
                    : status==='paused' ? '#FEF3C7'
                    : status==='pending' ? '#E0E7FF'
                    : '#F3F4F6',
                  color:
                    status==='active' ? '#15803D'
                    : status==='paused' ? '#92400E'
                    : status==='pending' ? '#1D4ED8'
                    : '#374151',
                }}
                title={status==='pending' ? 'En attente d’activation par la comptabilité' : undefined}
              >
                {status==='active' ? 'En service'
                 : status==='paused' ? 'En pause'
                 : status==='pending' ? 'En attente d’activation'
                 : 'Hors service'}
              </div>

              {status==='active' && (
                <>
                  <button className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 transition"
                          onClick={() => pauseShift().catch((e:any)=>alert(e?.message||'Erreur'))}>
                    Pause
                  </button>
                  <button
                    className="px-3 py-2 rounded-lg text-white text-sm shadow-sm hover:shadow transition"
                    style={{ background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
                    onClick={() => { if (window.confirm('Clôturer ce poste ? Vous ne pourrez plus vendre après clôture.')) { closeShift().catch((e:any)=>alert(e?.message||'Erreur')); setTab('rapport'); } }}
                  >
                    Clôturer
                  </button>
                </>
              )}

              {status==='paused' && (
                <>
                  <button className="px-3 py-2 rounded-lg text-white text-sm shadow-sm hover:shadow transition"
                          style={{ background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
                          onClick={() => continueShift().catch((e:any)=>alert(e?.message||'Erreur'))}>
                    Continuer
                  </button>
                  <button className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 transition"
                          onClick={() => { if (window.confirm('Clôturer ce poste ?')) { closeShift().catch((e:any)=>alert(e?.message||'Erreur')); setTab('rapport'); } }}>
                    Clôturer
                  </button>
                </>
              )}

              {status==='pending' && (
                <button className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 transition"
                        onClick={() => refresh().catch(()=>{})}>
                  <RefreshCw className="h-4 w-4 inline mr-1" /> Actualiser
                </button>
              )}

              {status==='none' && (
                <button className="px-3 py-2 rounded-lg text-white text-sm shadow-sm hover:shadow transition"
                        style={{ background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
                        onClick={() => startShift().catch((e:any)=>alert(e?.message||'Erreur'))}>
                  Demander l’activation
                </button>
              )}
            </div>

            {/* Séparateur fin */}
            <div className="h-6 w-px bg-gray-200" />

            {/* Menu utilisateur (roue dentée) */}
            <Button leftIcon={<Settings className="h-4 w-4" />}>Paramètres</Button>
          </div>
        </div>
      </div>

      {/* =================== CONTENU: RAPPORT =================== */}
      {tab==='rapport' && (
        <div id="report-print" className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {/* Bloc en-tête */}
          <div className="bg-white rounded-2xl border shadow-sm p-4 transition duration-200 ease-out">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {companyLogo
                  ? <img src={companyLogo} alt="logo" className="h-9 w-9 rounded object-contain border" />
                  : <div className="h-9 w-9 rounded bg-gray-200 grid place-items-center"><Building2 className="h-4 w-4 text-gray-500"/></div>}
                <div className="text-lg font-semibold">{companyName}</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold">Rapport</div>
                <div className="text-sm text-gray-600">
                  {new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
                </div>
              </div>
            </div>
          </div>

          {/* A. Live ventes (uniquement si poste en cours) */}
          {(status==='active' || status==='paused' || status==='pending') && (
            <div className="space-y-3">
              <div className="flex gap-2 no-print">
                <button className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 transition">Imprimer</button>
                <button className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 transition" onClick={refresh}>Actualiser</button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border p-4 bg-white shadow-sm transition duration-200 ease-out hover:shadow">
                  <div className="text-sm text-gray-500">Billets</div>
                  <div className="text-2xl font-bold">{totals.billets}</div>
                </div>
                <div className="rounded-xl border p-4 bg-white shadow-sm transition duration-200 ease-out hover:shadow">
                  <div className="text-sm text-gray-500">Montant</div>
                  <div className="text-2xl font-bold">{totals.montant.toLocaleString('fr-FR')} FCFA</div>
                </div>
                <div className="rounded-xl border p-4 bg-white shadow-sm transition duration-200 ease-out hover:shadow">
                  <div className="text-sm text-gray-500">Réservations</div>
                  <div className="text-2xl font-bold">{tickets.length}</div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm transition duration-200 ease-out hover:shadow">
                <div className="font-semibold mb-3">Ventes du poste en cours (canal: guichet, paiement: espèces)</div>

                {loadingReport ? (
                  <div className="text-gray-500">Chargement…</div>
                ) : !tickets.length ? (
                  <div className="text-gray-500">Aucune vente pour ce poste pour le moment.</div>
                ) : (
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Heure</th>
                          <th className="px-3 py-2 text-left">Trajet</th>
                          <th className="px-3 py-2 text-left">Client</th>
                          <th className="px-3 py-2 text-left">Tél.</th>
                          <th className="px-3 py-2 text-right">Billets</th>
                          <th className="px-3 py-2 text-right">Montant</th>
                          <th className="px-3 py-2 text-right">Réf.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tickets.map(t => (
                          <tr key={t.id} className="border-t">
                            <td className="px-3 py-2">{t.date}</td>
                            <td className="px-3 py-2">{t.heure}</td>
                            <td className="px-3 py-2">{t.depart} → {t.arrivee}</td>
                            <td className="px-3 py-2">{t.nomClient}</td>
                            <td className="px-3 py-2">{t.telephone || ''}</td>
                            <td className="px-3 py-2 text-right">{(t.seatsGo||0)+(t.seatsReturn||0)}</td>
                            <td className="px-3 py-2 text-right">{t.montant.toLocaleString('fr-FR')} FCFA</td>
                            <td className="px-3 py-2 text-right text-xs text-gray-500">{t.referenceCode || t.id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* B. Sessions en attente de validation */}
          <div className="rounded-2xl border bg-white p-4 shadow-sm transition duration-200 ease-out hover:shadow">
            <div className="font-semibold mb-2">Mes sessions en attente de validation</div>
            {loadingPending ? (
              <div className="text-gray-500">Chargement…</div>
            ) : pendingReports.length === 0 ? (
              <div className="text-gray-500">Aucune session en attente.</div>
            ) : (
              <div className="space-y-3">
                {pendingReports.map(rep => {
                  const start = rep.startAt?.toDate?.() ? rep.startAt.toDate() : new Date();
                  const end   = rep.endAt?.toDate?.() ? rep.endAt.toDate() : new Date();
                  return (
                    <div key={rep.shiftId} className="border rounded-xl p-4 transition duration-200 ease-out hover:shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">Session #{rep.shiftId.slice(0,6)} — {rep.userName || 'Guichetier'} ({rep.userCode || '—'})</div>
                          <div className="text-xs text-gray-500">
                            Début: {start.toLocaleString('fr-FR')} — Fin: {end.toLocaleString('fr-FR')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-1 rounded text-xs ${rep.accountantValidated ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            Comptable {rep.accountantValidated ? 'OK' : 'en attente'}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs ${rep.managerValidated ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            Chef {rep.managerValidated ? 'OK' : 'en attente'}
                          </span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3">
                          <div className="text-xs text-gray-500">Billets</div>
                          <div className="text-xl font-bold">{rep.billets}</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-xs text-gray-500">Montant</div>
                          <div className="text-xl font-bold">{rep.montant.toLocaleString('fr-FR')} FCFA</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-xs text-gray-500">Trajets</div>
                          <div className="text-xl font-bold">{rep.details?.length || 0}</div>
                        </div>
                      </div>

                      {!!rep.details?.length && (
                        <div className="mt-3 overflow-hidden rounded border">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left">Trajet</th>
                                <th className="px-3 py-2 text-left">Heures</th>
                                <th className="px-3 py-2 text-right">Billets</th>
                                <th className="px-3 py-2 text-right">Montant</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rep.details.map((d, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-3 py-2">{d.trajet}</td>
                                  <td className="px-3 py-2 text-xs text-gray-600">{(d.heures||[]).join(', ')}</td>
                                  <td className="px-3 py-2 text-right">{d.billets}</td>
                                  <td className="px-3 py-2 text-right">{d.montant.toLocaleString('fr-FR')} FCFA</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== CONTENU: HISTORIQUE =================== */}
      {tab==='historique' && (
        <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <div className="text-lg font-semibold">Historique de mes sessions (validées)</div>
            <div className="text-sm text-gray-500">Guichetier : {(user?.displayName || user?.email) ?? '—'} ({sellerCodeUI})</div>
          </div>

          <div className="rounded-2xl border bg-white p-4 shadow-sm">
            {loadingHistory ? (
              <div className="text-gray-500">Chargement…</div>
            ) : historyReports.length === 0 ? (
              <div className="text-gray-500">Aucune session validée trouvée.</div>
            ) : (
              <div className="space-y-3">
                {historyReports.map(rep => {
                  const start = rep.startAt?.toDate?.() ? rep.startAt.toDate() : new Date();
                  const end   = rep.endAt?.toDate?.() ? rep.endAt.toDate() : new Date();
                  return (
                    <div key={rep.shiftId} className="border rounded-xl p-4 transition duration-200 ease-out hover:shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">Session #{rep.shiftId.slice(0,6)} — {rep.userName || 'Guichetier'} ({rep.userCode || '—'})</div>
                          <div className="text-xs text-gray-500">
                            Début: {start.toLocaleString('fr-FR')} — Fin: {end.toLocaleString('fr-FR')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700">Comptable OK</span>
                          <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700">Chef OK</span>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="rounded-lg border p-3">
                          <div className="text-xs text-gray-500">Billets</div>
                          <div className="text-xl font-bold">{rep.billets}</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-xs text-gray-500">Montant</div>
                          <div className="text-xl font-bold">{rep.montant.toLocaleString('fr-FR')} FCFA</div>
                        </div>
                        <div className="rounded-lg border p-3">
                          <div className="text-xs text-gray-500">Trajets</div>
                          <div className="text-xl font-bold">{rep.details?.length || 0}</div>
                        </div>
                      </div>

                      {!!rep.details?.length && (
                        <div className="mt-3 overflow-hidden rounded border">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left">Trajet</th>
                                <th className="px-3 py-2 text-left">Heures</th>
                                <th className="px-3 py-2 text-right">Billets</th>
                                <th className="px-3 py-2 text-right">Montant</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rep.details.map((d, i) => (
                                <tr key={i} className="border-t">
                                  <td className="px-3 py-2">{d.trajet}</td>
                                  <td className="px-3 py-2 text-xs text-gray-600">{(d.heures||[]).join(', ')}</td>
                                  <td className="px-3 py-2 text-right">{d.billets}</td>
                                  <td className="px-3 py-2 text-right">{d.montant.toLocaleString('fr-FR')} FCFA</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== CONTENU: GUICHET (VENTE) =================== */}
      {tab==='guichet' && (
        <div className="max-w-7xl mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* G, Recherche */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border shadow-sm p-6 bg-white transition duration-200 ease-out hover:shadow">
              <div className="mb-4">
                <h1 className="text-2xl font-bold">Guichet de vente</h1>
                <p className="text-gray-500 text-sm flex items-center gap-2">
                  <MapPin className="h-4 w-4"/><span>Départ :</span>
                  <span className="font-medium">{departure || '—'}</span>
                </p>
              </div>

              {status==='pending' && (
                <div className="mb-4 p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-800 text-sm">
                  Demande envoyée. En attente d’activation par la comptabilité. Cliquez sur <b>Actualiser</b> dans l’entête pour vérifier.
                </div>
              )}
              {status==='none' && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                  Cliquez sur <b>Demander l’activation</b> (en haut) pour créer votre poste.
                </div>
              )}

              <div className="mb-2 text-sm text-gray-600">Choisissez une ville d'arrivée :</div>
              <div className="flex flex-wrap gap-2">
                {allArrivals.length === 0 && <span className="text-gray-400 text-sm">Aucune destination configurée.</span>}
                {allArrivals.map(v => {
                  const active = arrival.toLowerCase() === v.toLowerCase();
                  return (
                    <button
                      key={v}
                      onClick={() => setArrival(v)}
                      className={`px-3 py-2 rounded-full text-sm border transition ${active ? 'text-white' : 'text-gray-700 hover:bg-gray-50'}`}
                      style={active
                        ? { background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`, borderColor:'transparent' }
                        : { borderColor:'#E5E7EB', backgroundColor:'white' }}
                    >{v}</button>
                  );
                })}
              </div>
            </div>

            {/* Dates */}
            <div className="rounded-2xl border shadow-sm p-6 bg-white transition duration-200 ease-out hover:shadow">
              <h3 className="font-semibold mb-3 flex items-center gap-2"><CalendarDays className="h-5 w-5"/><span>Dates disponibles</span></h3>
              <div className="flex flex-wrap gap-2">
                {availableDates.map(d => {
                  const has = trips.some(t => t.date === d);
                  const act = selectedDate === d;
                  const day = new Date(d);
                  return (
                    <button
                      key={d}
                      disabled={!has}
                      onClick={() => has && handleSelectDate(d)}
                      className={`w-16 h-16 rounded-xl border text-center transition ${act ? 'text-white' : ''} ${!has ? 'opacity-40 cursor-not-allowed' : 'hover:shadow-sm'}`}
                      style={act
                        ? { background: theme.primary, borderColor: theme.primary }
                        : { background:'white', borderColor:'#E5E7EB' }}
                    >
                      <div className="text-xs">{day.toLocaleDateString('fr-FR',{weekday:'short'})}</div>
                      <div className="text-lg font-bold">{day.getDate()}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Horaires */}
            <div className="rounded-2xl border shadow-sm p-6 bg-white transition duration-200 ease-out hover:shadow">
              <h3 className="font-semibold mb-2 flex items-center gap-2"><Clock4 className="h-5 w-5"/><span>Horaires disponibles</span></h3>
              {filteredTrips.length === 0 ? (
                <div className="text-gray-400 text-sm">Aucun horaire pour cette date.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 gap-2">
                  {filteredTrips.map(t => {
                    const active = selectedTrip?.id === t.id;
                    const seat = seatBadgeStyle(t.remainingSeats, t.places || MAX_SEATS_FALLBACK);
                    return (
                      <button
                        key={t.id}
                        onClick={() => setSelectedTrip(t)}
                        className={`text-left px-4 py-3 rounded-xl border transition ${active ? 'shadow ring-1' : 'hover:shadow-sm'}`}
                        style={active
                          ? { borderColor: theme.primary, backgroundColor: '#F5F7FF' }
                          : { borderColor: '#E5E7EB', backgroundColor: 'white' }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold">
                              <span className="text-base mr-2" style={{ color: theme.primary }}>{t.time}</span>
                              {t.departure} → {t.arrival}
                            </div>
                            <div className="text-xs text-gray-500">
                              {new Date(t.date).toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long'})}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold" style={{ color: theme.primary }}>
                              {t.price.toLocaleString('fr-FR')} FCFA
                            </div>
                            <div className={`inline-flex mt-1 px-2 py-0.5 rounded-full text-[11px] ${seat.bg} ${seat.text}`}>
                              {seat.label}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Réservation (droite) */}
          <div className="bg-white rounded-2xl shadow-sm border h-max sticky top-24 p-6 transition duration-200 ease-out hover:shadow">
            <h3 className="text-xl font-bold mb-4" style={{background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>
              Détails de la réservation
            </h3>

            {!canSell && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm">
                {status==='pending'
                  ? "Votre poste est en attente d’activation par la comptabilité."
                  : "Demandez l’activation de votre poste, puis démarrez la vente (espèces uniquement)."}
              </div>
            )}

            {selectedTrip ? (
              <div className="mb-4 p-4 rounded-xl border" style={{borderColor: theme.primary, backgroundColor: '#F8FAFF'}}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">{selectedTrip.departure} → {selectedTrip.arrival}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(selectedTrip.date).toLocaleDateString('fr-FR',{weekday:'long', day:'numeric', month:'long'})}
                    </div>
                  </div>
                  <div className="px-2 py-1 rounded-md bg-white shadow text-sm" style={{color: theme.primary}}>
                    {selectedTrip.time}
                  </div>
                </div>
                <div className="mt-2 text-sm">
                  Prix unitaire : <span className="font-semibold">{selectedTrip.price.toLocaleString('fr-FR')} FCFA</span>
                </div>
              </div>
            ) : (
              <div className="mb-4 p-4 rounded-xl border border-dashed text-gray-500 text-sm">
                Sélectionnez un horaire pour continuer.
              </div>
            )}

            {/* Aller / retour */}
            <div className="mb-3 inline-flex bg-gray-100 p-1 rounded-xl w-full shadow-inner">
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm transition ${tripType==='aller_simple' ? 'text-white' : 'hover:bg-white'}`}
                onClick={() => { setTripType('aller_simple'); setPlacesRetour(0); }}
                style={tripType==='aller_simple'
                  ? { background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }
                  : {}}
              >
                Aller simple
              </button>
              <button
                type="button"
                className={`flex-1 py-2 rounded-lg text-sm transition ${tripType==='aller_retour' ? 'text-white' : 'hover:bg-white'}`}
                onClick={() => setTripType('aller_retour')}
                style={tripType==='aller_retour'
                  ? { background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }
                  : {}}
              >
                Aller-retour
              </button>
            </div>

            {/* Infos client */}
            <div className="space-y-3">
              <input className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-200" placeholder="Nom complet du passager" value={nomClient} onChange={e => setNomClient(e.target.value)} />
              <input className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-gray-200" placeholder="Téléphone" value={telephone} onChange={e => setTelephone(e.target.value)} />
            </div>

            {/* Places */}
            <div className="mt-4 space-y-3">
              <div>
                <div className="text-sm mb-1">Nombre de places (Aller)</div>
                <div className="flex items-center gap-2">
                  <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50 transition" onClick={() => setPlacesAller(p => Math.max(1, p-1))}>-</button>
                  <div className="flex-1 text-center font-bold py-2 rounded bg-gray-50">{placesAller}</div>
                  <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50 transition" onClick={() => setPlacesAller(p => p+1)}>+</button>
                </div>
              </div>
              {tripType === 'aller_retour' && (
                <div>
                  <div className="text-sm mb-1">Nombre de places (Retour)</div>
                  <div className="flex items-center gap-2">
                    <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50 transition" onClick={() => setPlacesRetour(p => Math.max(0, p-1))}>-</button>
                    <div className="flex-1 text-center font-bold py-2 rounded bg-gray-50">{placesRetour}</div>
                    <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50 transition" onClick={() => setPlacesRetour(p => p+1)}>+</button>
                  </div>
                </div>
              )}
            </div>

            {/* Total */}
            <div className="mt-4 p-4 rounded-xl bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-600">Total à payer (ESPÈCES)</div>
              <div className="text-2xl font-bold" style={{ color: theme.primary }}>
                {totalPrice.toLocaleString('fr-FR')} FCFA
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BARRE BAS */}
      <div className="sticky bottom-0 z-10">
        <div className="max-w-7xl mx-auto px-4 pb-4">
          <div className="bg-white/95 backdrop-blur rounded-2xl border shadow-md p-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-200 to-gray-100 grid place-items-center border">
                <Ticket className="h-5 w-5 text-gray-500" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold">
                  {(user?.displayName || user?.email) ?? '—'} <span className="text-gray-500">({sellerCodeUI})</span>
                </div>
                <div className="text-xs text-gray-500">{(user as any)?.role || 'guichetier'}</div>
              </div>
              <button
                onClick={async () => { await logout(); navigate('/login'); }}
                className="ml-3 inline-flex items-center gap-1 px-3 py-2 text-sm rounded-lg border bg-gray-50 hover:bg-gray-100 transition"
                title="Déconnexion"
              >
                <LogOut className="h-4 w-4"/> Déconnexion
              </button>
            </div>

            {tab==='guichet' && (
              <div className="flex items-center gap-3">
                <div className="text-sm text-gray-600">Total:</div>
                <div className="text-xl font-extrabold" style={{ color: theme.primary }}>
                  {totalPrice.toLocaleString('fr-FR')} FCFA
                </div>
                <button
                  className="px-5 py-3 rounded-xl text-white font-bold disabled:opacity-50 shadow-sm hover:shadow transition"
                  disabled={!canSell || !selectedTrip || !nomClient || !telephone || !validPhone(telephone) || totalPrice<=0 || isProcessing}
                  style={{ background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
                  onClick={handleReservation}
                  title="Valider la réservation"
                >
                  {isProcessing ? 'Traitement…' : 'Valider la réservation'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showReceipt && receiptData && receiptCompany && (
        <ReceiptModal
          open={showReceipt}
          onClose={() => setShowReceipt(false)}
          reservation={receiptData}
          company={receiptCompany}
        />
      )}
    </div>
  );
};

export default AgenceGuichetPage;
