// src/pages/AgenceGuichetPage.tsx
// ===================================================================
// Guichet : VENTE EN ESPÈCES UNIQUEMENT (canal=guichet)
// - Paiement forcé à "espèces"
// - Gestion de poste : none → (Demander l’activation) → pending → active/paused → closed
// - Places restantes (live) : statut = 'payé', somme seatsGo, fallback 30, onSnapshot
// - Onglets locaux : Guichet / Rapport / Historique
// - AMÉLIORATIONS (ce fichier) :
//   • En-tête Rapport minimal (titre + date du jour / plage si chevauchement)
//   • Suppression bouton Imprimer dans le Rapport (on n’imprime que depuis Historique)
//   • Boutons/puces modernisés avec dégradé thème
//   • Édition rapide étendue : nom, téléphone, places (aller/retour), montant (+ motif)
//   • Annulation soignée
//   • ⚠️ Changement trajet/date/heure : à traiter par “reporté” + revente (sécurisé).
//   • Vente accélérée : caches (company/agency/seller) + écriture unique setDoc
//   • Header responsive (flex-wrap, truncate, réorganisation sur mobile)
//   • ✅ Détails utilisateur + rôle en haut à droite + bouton Déconnexion (icône)
// ===================================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, getDocs, query, where, Timestamp, addDoc, doc, getDoc,
  updateDoc, orderBy, onSnapshot, runTransaction, setDoc, limit, serverTimestamp
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useActiveShift } from '@/hooks/useActiveShift';
import useCompanyTheme from '@/hooks/useCompanyTheme';
import { makeShortCode } from '@/utils/brand';

import ReceiptModal, {
  type ReservationData as ReceiptReservation,
  type CompanyData as ReceiptCompany
} from '@/components/ReceiptModal';

import {
  Building2, MapPin, CalendarDays, Clock4,
  Ticket, RefreshCw, Pencil, XCircle, Settings, LogOut, User2
} from 'lucide-react';

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
  canal?: string;
  statutEmbarquement?: string;
};

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

/* ----------------------- Utils Firestore ----------------------- */
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

/* ----------------------- Modal d’édition (étendue) ----------------------- */
type EditModalProps = {
  open: boolean;
  onClose: () => void;
  initial: {
    id: string;
    nomClient: string;
    telephone?: string;
    seatsGo: number;
    seatsReturn?: number;
    montant: number;
  } | null;
  onSave: (payload: {
    id: string;
    nomClient: string;
    telephone?: string;
    seatsGo: number;
    seatsReturn?: number;
    montant: number;
    editReason?: string;
  }) => Promise<void>;
  isSaving: boolean;
};

const EditReservationModal: React.FC<EditModalProps> = ({ open, onClose, initial, onSave, isSaving }) => {
  const [nomClient, setNomClient] = useState(initial?.nomClient || '');
  const [telephone, setTelephone] = useState(initial?.telephone || '');
  const [seatsGo, setSeatsGo] = useState<number>(initial?.seatsGo ?? 1);
  const [seatsReturn, setSeatsReturn] = useState<number>(initial?.seatsReturn ?? 0);
  const [montant, setMontant] = useState<number>(initial?.montant ?? 0);
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (initial) {
      setNomClient(initial.nomClient || '');
      setTelephone(initial.telephone || '');
      setSeatsGo(initial.seatsGo ?? 1);
      setSeatsReturn(initial.seatsReturn ?? 0);
      setMontant(initial.montant ?? 0);
      setReason('');
    }
  }, [initial]);

  if (!open || !initial) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white border shadow-lg p-5">
        <div className="text-lg font-semibold mb-3">Modifier la réservation</div>
        <div className="space-y-3">
          <input
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Nom du client"
            value={nomClient}
            onChange={(e)=>setNomClient(e.target.value)}
          />
          <input
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Téléphone"
            value={telephone}
            onChange={(e)=>setTelephone(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-sm mb-1">Places (Aller)</div>
              <div className="flex items-center gap-2">
                <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50" onClick={()=>setSeatsGo(Math.max(1, seatsGo-1))}>-</button>
                <div className="flex-1 text-center font-semibold py-2 rounded bg-gray-50">{seatsGo}</div>
                <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50" onClick={()=>setSeatsGo(seatsGo+1)}>+</button>
              </div>
            </div>
            <div>
              <div className="text-sm mb-1">Places (Retour)</div>
              <div className="flex items-center gap-2">
                <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50" onClick={()=>setSeatsReturn(Math.max(0, seatsReturn-1))}>-</button>
                <div className="flex-1 text-center font-semibold py-2 rounded bg-gray-50">{seatsReturn}</div>
                <button type="button" className="px-3 py-2 rounded border bg-white hover:bg-gray-50" onClick={()=>setSeatsReturn(seatsReturn+1)}>+</button>
              </div>
            </div>
          </div>
          <div>
            <div className="text-sm mb-1">Montant (FCFA)</div>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2"
              value={montant}
              onChange={(e)=>setMontant(Math.max(0, Number(e.target.value||0)))}
            />
          </div>
          <input
            className="w-full border rounded-lg px-3 py-2"
            placeholder="Motif de modification (optionnel)"
            value={reason}
            onChange={(e)=>setReason(e.target.value)}
          />
        </div>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50" onClick={onClose}>Annuler</button>
          <button
            disabled={isSaving || !nomClient}
            className="px-4 py-2 rounded-lg text-white disabled:opacity-50"
            style={{ background: 'linear-gradient(90deg, #2563EB, #1D4ED8)' }}
            onClick={() => onSave({
              id: initial.id,
              nomClient,
              telephone,
              seatsGo,
              seatsReturn,
              montant,
              editReason: reason || undefined
            })}
          >
            {isSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------ Page ------------------------------ */
const AgenceGuichetPage: React.FC = () => {
  const auth = useAuth() as any;
  // On récupère signOutSafe si exposé par l'AuthContext
  const { user, company, signOutSafe } = auth ?? {};

  const handleLogout = useCallback(async () => {
    try {
      if (typeof signOutSafe === 'function') {
        await signOutSafe();
        return;
      }
      if (typeof auth?.logout === 'function') {
        await auth.logout();
        return;
      }
      window.location.href = '/logout'; // route utilitaire
    } catch (e) {
      console.error('logout error', e);
      window.location.href = '/login';
    }
  }, [signOutSafe, auth]);

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

  // Live ventes poste courant
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [loadingReport, setLoadingReport] = useState(false);

  // Rapports en attente
  const [pendingReports, setPendingReports] = useState<ShiftReport[]>([]);
  const [loadingPending, setLoadingPending] = useState(false);

  // Historique validés
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

  // États pour édition/annulation
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<EditModalProps['initial']>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  // CACHES accélération vente
  const [companyMeta, setCompanyMeta] = useState({
    name: 'Compagnie', code: 'COMP', slug: DEFAULT_COMPANY_SLUG,
    logo: null as string | null, phone: ''
  });
  const [agencyMeta, setAgencyMeta] = useState({
    name: 'Agence', code: 'AGC', phone: ''
  });
  const [sellerCodeCached, setSellerCodeCached] = useState<string>('GUEST');

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

  /* -------------------- INIT socle + CACHES -------------------- */
  useEffect(() => {
    (async () => {
      try {
        if (user?.uid) {
          const sc = await getSellerCodeFromFirestore(user.uid);
          if (sc) { setSellerCodeCached(sc); setSellerCodeUI(sc); }
        }
        if (!user?.companyId || !user?.agencyId) return;

        // company
        const compSnap = await getDoc(doc(db, 'companies', user.companyId));
        if (compSnap.exists()) {
          const c = compSnap.data() as any;
          const name = c.nom || c.name || 'Compagnie';
          setCompanyLogo(c.logoUrl || c.logo || null);
          setCompanyName(name);
          setCompanyPhone(c.telephone || '');
          setCompanyMeta({
            name,
            code: makeShortCode(name, c.code),
            slug: c.slug || DEFAULT_COMPANY_SLUG,
            logo: c.logoUrl || c.logo || null,
            phone: c.telephone || ''
          });
        }

        // agency
        const agSnap = await getDoc(doc(db, `companies/${user.companyId}/agences/${user.agencyId}`));
        if (agSnap.exists()) {
          const a = agSnap.data() as any;
          const ville = a?.ville || a?.city || a?.nomVille || a?.villeDepart || '';
          setDeparture((ville || '').toString());
          setAgencyName(a?.nomAgence || a?.nom || ville || 'Agence');
          setAgencyMeta({
            name: a?.nomAgence || a?.nom || ville || 'Agence',
            code: makeShortCode(a?.nomAgence || a?.nom || ville, a?.code),
            phone: a?.telephone || ''
          });
        }

        // arrivals
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
          if (statut !== 'payé') return; // ne compter que "payé"
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

      out.sort((a,b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
      const future = out.filter(t => !isPastTime(t.date, t.time));
      setTrips(future);

      const firstDate = future[0]?.date || '';
      setSelectedDate(firstDate);
      setSelectedTrip(null);

      if (firstDate) {
        await loadRemainingForDate(firstDate, dep, arr, future, true);
      } else {
        setFilteredTrips([]);
      }
    } catch (e) {
      console.error('[GUICHET] searchTrips:error', e);
    }
  }, [isPastTime, user?.agencyId, user?.companyId, loadRemainingForDate]);

  useEffect(() => {
    if (!arrival) {
      setTrips([]); setFilteredTrips([]); setSelectedTrip(null); setSelectedDate(''); return;
    }
    searchTrips(departure, arrival);
  }, [arrival, departure, searchTrips]);

  const handleSelectDate = useCallback(async (date: string) => {
    setSelectedDate(date);
    setSelectedTrip(null);
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

  /* -------------------- Réservation (écriture unique + caches) -------------------- */
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
      // 1) référence atomique (transaction)
      const referenceCode = await generateReferenceCodeForTripInstance({
        companyId: user!.companyId,
        companyCode: companyMeta.code,
        agencyId: user!.agencyId,
        agencyCode: agencyMeta.code,
        tripInstanceId: selectedTrip.id,
        sellerCode: sellerCodeCached || staffCodeForSale
      });

      // 2) Pré-créer l'ID du doc pour écrire EN UNE FOIS
      const colRef = collection(db, `companies/${user!.companyId}/agences/${user!.agencyId}/reservations`);
      const newRef = doc(colRef);
      const newId = newRef.id;

      const data = {
        trajetId: selectedTrip.id,
        date: selectedTrip.date, heure: selectedTrip.time,
        depart: selectedTrip.departure, arrivee: selectedTrip.arrival,
        nomClient, telephone, email: null,
        seatsGo: placesAller, seatsReturn: tripType === 'aller_retour' ? placesRetour : 0,
        montant: totalPrice, statut: 'payé', statutEmbarquement: 'en_attente',
        checkInTime: null, reportInfo: null,
        compagnieId: user!.companyId, agencyId: user!.agencyId,
        companySlug: companyMeta.slug, compagnieNom: companyMeta.name,
        agencyNom: agencyMeta.name, agencyTelephone: agencyMeta.phone,
        canal: 'guichet', paiement: 'espèces', paiementSource: 'encaisse_guichet',
        guichetierId: user!.uid, guichetierCode: sellerCodeCached || staffCodeForSale,
        shiftId: activeShift?.id || null,
        referenceCode, qrCode: newId, tripType,
        createdAt: Timestamp.now(),
      };

      // ÉCRITURE UNIQUE
      await setDoc(newRef, data);

      // Reçu (aucune relecture nécessaire)
      setReceiptData({
        id: newId, nomClient, telephone,
        date: data.date, heure: data.heure, depart: data.depart, arrivee: data.arrivee,
        seatsGo: data.seatsGo, seatsReturn: data.seatsReturn, montant: data.montant,
        statut: data.statut, paiement: data.paiement,
        compagnieId: user!.companyId, compagnieNom: companyMeta.name,
        agencyId: user!.agencyId, agencyNom: agencyMeta.name, nomAgence: agencyMeta.name,
        agenceTelephone: agencyMeta.phone, canal: 'guichet',
        createdAt: new Date(), companySlug: companyMeta.slug, referenceCode,
        qrCode: newId, guichetierId: user!.uid, guichetierCode: sellerCodeCached || staffCodeForSale,
        shiftId: activeShift?.id || null, email: undefined,
      });

      setReceiptCompany({
        nom: companyMeta.name,
        logoUrl: companyMeta.logo || undefined,
        couleurPrimaire: theme.primary, couleurSecondaire: theme.secondary,
        slug: companyMeta.slug, telephone: companyMeta.phone || undefined,
      });
      setShowReceipt(true);

      // Reset UI (le live mettra à jour)
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
    selectedTrip, nomClient, telephone, canSell, validPhone, tripType,
    placesAller, placesRetour, totalPrice, user, activeShift,
    companyMeta, agencyMeta, sellerCodeCached, staffCodeForSale, theme,
    loadRemainingForDate
  ]);

  /* -------------------- Annulation / Édition -------------------- */
  const cancelReservation = useCallback(async (row: TicketRow) => {
    if (!user?.companyId || !user?.agencyId) return;
    // garde-fous
    if (row.canal && row.canal !== 'guichet') { alert("Annulation autorisée ici uniquement pour les ventes guichet."); return; }
    if (row.statutEmbarquement === 'embarqué') { alert("Impossible d'annuler : passager déjà embarqué."); return; }

    const reason = prompt("Motif d'annulation (optionnel) :") || undefined;
    if (!window.confirm("Confirmer l'annulation de cette réservation ?")) return;

    try {
      setCancelingId(row.id);
      const ref = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations/${row.id}`);
      await updateDoc(ref, {
        statut: 'annulé',
        updatedAt: serverTimestamp(),
        cancelReason: reason || null,
        canceledBy: {
          id: user.uid,
          name: user.displayName || user.email || null,
        }
      });
      // MAJ UI locale — on ne retire pas la ligne pour garder la trace
      setTickets((prev) => prev.map(t => t.id === row.id ? { ...t, montant: 0 } : t));
    } catch (e) {
      console.error('[GUICHET] cancelReservation:error', e);
      alert("Échec de l'annulation.");
    } finally {
      setCancelingId(null);
    }
  }, [user?.companyId, user?.agencyId]);

  const openEdit = useCallback((row: TicketRow) => {
    setEditTarget({
      id: row.id,
      nomClient: row.nomClient,
      telephone: row.telephone,
      seatsGo: row.seatsGo ?? 1,
      seatsReturn: row.seatsReturn ?? 0,
      montant: row.montant ?? 0
    });
    setEditOpen(true);
  }, []);

  const saveEditedReservation = useCallback(async (payload: {
    id: string; nomClient: string; telephone?: string; seatsGo: number; seatsReturn?: number; montant: number; editReason?: string
  }) => {
    if (!user?.companyId || !user?.agencyId) return;
    try {
      setIsSavingEdit(true);
      const ref = doc(db, `companies/${user.companyId}/agences/${user.agencyId}/reservations/${payload.id}`);
      await updateDoc(ref, {
        nomClient: payload.nomClient,
        telephone: payload.telephone || null,
        seatsGo: Math.max(1, payload.seatsGo || 1),
        seatsReturn: Math.max(0, payload.seatsReturn || 0),
        montant: Math.max(0, payload.montant || 0),
        updatedAt: serverTimestamp(),
        editedBy: {
          id: user.uid,
          name: user.displayName || user.email || null,
          reason: payload.editReason || null
        }
      });
      // MAJ liste locale
      setTickets(prev => prev.map(t => t.id === payload.id
        ? { ...t,
            nomClient: payload.nomClient,
            telephone: payload.telephone,
            seatsGo: Math.max(1, payload.seatsGo || 1),
            seatsReturn: Math.max(0, payload.seatsReturn || 0),
            montant: Math.max(0, payload.montant || 0)
          }
        : t
      ));
      setEditOpen(false);
      setEditTarget(null);
    } catch (e) {
      console.error('[GUICHET] saveEditedReservation:error', e);
      alert("Échec de la modification.");
    } finally {
      setIsSavingEdit(false);
    }
  }, [user?.companyId, user?.agencyId, user?.uid]);

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
          canal: r.canal, statutEmbarquement: r.statutEmbarquement
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

  // Période d’affichage du bloc Rapport (si chevauchement de jours)
  const reportDateLabel = useMemo(() => {
    const start = activeShift?.startAt?.toDate?.() || activeShift?.startTime?.toDate?.();
    const end = activeShift?.endAt?.toDate?.() || new Date();
    if (!start) return new Date().toLocaleDateString('fr-FR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    const d1 = start.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
    const d2 = end.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
    return (d1 === d2)
      ? d1
      : `du ${d1} au ${d2}`;
  }, [activeShift?.startAt, activeShift?.startTime, activeShift?.endAt]);

  /* -------------------- Rapports en attente (shiftReports) -------------------- */
  const loadPendingReports = useCallback(async () => {
    try {
      if (!user?.companyId || !user?.agencyId || !user?.uid) { setPendingReports([]); return; }
      setLoadingPending(true);
      const base = `companies/${user.companyId}/agences/${user.agencyId}`;
      const repRef = collection(db, `${base}/shiftReports`);
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

  useEffect(() => {
    if (tab === 'rapport') {
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

      {/* EN-TÊTE GLOBAL — responsive */}
      <div className="sticky top-0 z-10 border-b bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/70">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Bloc logo + info agence */}
            <div className="flex items-center gap-3 min-w-0">
              {companyLogo
                ? <img src={companyLogo} alt="logo" className="h-10 w-10 rounded object-contain border flex-shrink-0" />
                : <div className="h-10 w-10 rounded bg-gray-200 grid place-items-center flex-shrink-0"><Building2 className="h-5 w-5 text-gray-500"/></div>}
              <div className="min-w-0">
                <div
                  className="text-lg font-bold truncate"
                  style={{background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}
                  title={companyName}
                >
                  {companyName}
                </div>
                <div className="text-xs text-gray-500 flex items-center gap-1 truncate">
                  <MapPin className="h-3.5 w-3.5 flex-shrink-0"/><span className="truncate">{agencyName}</span>
                </div>
              </div>
            </div>

            {/* Tabs — passent dessous sur mobile */}
            <div className="order-3 md:order-none w-full md:w-auto">
              <div className="inline-flex rounded-xl p-1 bg-gray-100 shadow-inner w-full md:w-auto">
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
            </div>

            {/* État + actions + Détails utilisateur (à droite) */}
            <div className="ml-auto flex items-center gap-3 flex-wrap">
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

              {/* Détails utilisateur en haut à droite */}
              <div className="h-6 w-px bg-gray-200" />
              <div className="hidden sm:flex items-center gap-3 rounded-xl border bg-white px-3 py-2 max-w-[280px]">
                <div className="h-8 w-8 rounded-full bg-gray-100 grid place-items-center">
                  <User2 className="h-4 w-4 text-gray-500" />
                </div>
                <div className="leading-tight min-w-0">
                  <div className="text-sm font-medium truncate">
                    {(user?.displayName || user?.email) ?? '—'}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {(user as any)?.role || 'guichetier'} • {sellerCodeUI}
                  </div>
                </div>
                <button
                  className="ml-1 px-2.5 py-1.5 rounded-lg border text-xs bg-white hover:bg-gray-50 inline-flex items-center gap-1"
                  onClick={handleLogout}
                  title="Se déconnecter"
                >
                  <LogOut className="h-4 w-4" />
                  Quitter
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =================== CONTENU: RAPPORT =================== */}
      {tab==='rapport' && (
        <div id="report-print" className="max-w-7xl mx-auto px-4 py-6 space-y-6">
          {/* En-tête minimal Rapport */}
          <div className="bg-white rounded-2xl border shadow-sm p-4">
            <div className="flex items-center justify-between">
              <div className="text-2xl font-bold"
                   style={{background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})`, WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>
                Rapport
              </div>
              <div className="text-sm text-gray-600">{reportDateLabel}</div>
            </div>
          </div>

          {/* A. Live ventes (uniquement si poste en cours) */}
          {(status==='active' || status==='paused' || status==='pending') && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border p-4 bg-white shadow-sm hover:shadow transition">
                  <div className="text-sm text-gray-500">Billets</div>
                  <div className="text-2xl font-bold">{totals.billets}</div>
                </div>
                <div className="rounded-xl border p-4 bg-white shadow-sm hover:shadow transition">
                  <div className="text-sm text-gray-500">Montant</div>
                  <div className="text-2xl font-bold">{totals.montant.toLocaleString('fr-FR')} FCFA</div>
                </div>
                <div className="rounded-xl border p-4 bg-white shadow-sm hover:shadow transition">
                  <div className="text-sm text-gray-500">Réservations</div>
                  <div className="text-2xl font-bold">{tickets.length}</div>
                </div>
              </div>

              <div className="rounded-xl border bg-white p-4 shadow-sm hover:shadow transition">
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
                          <th className="px-3 py-2 text-right">Actions</th>
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
                            <td className="px-3 py-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs text-white"
                                  style={{ background:`linear-gradient(90deg, ${theme.primary}, ${theme.secondary})` }}
                                  title="Modifier (nom, tél., places, montant)"
                                  onClick={() => openEdit(t)}
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Modifier
                                </button>
                                <button
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md border text-xs hover:bg-red-50"
                                  style={{ borderColor:'#FCA5A5', color:'#B91C1C' }}
                                  title="Annuler la réservation"
                                  onClick={() => cancelReservation(t)}
                                  disabled={cancelingId === t.id}
                                >
                                  <XCircle className="h-3.5 w-3.5" /> {cancelingId === t.id ? 'Annulation…' : 'Annuler'}
                                </button>
                              </div>
                            </td>
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
          <div className="rounded-2xl border bg-white p-4 shadow-sm hover:shadow transition">
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
                    <div key={rep.shiftId} className="border rounded-xl p-4 hover:shadow-sm transition">
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
                    <div key={rep.shiftId} className="border rounded-xl p-4 hover:shadow-sm transition">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-semibold">Session #{rep.shiftId.slice(0,6)} — {rep.userName || 'Guichetier'} ({rep.userCode || '—'})</div>
                          <div className="text-xs text-gray-500">
                            Début: {start.toLocaleString('fr-FR')} — Fin: {end.toLocaleDateString('fr-FR',{ weekday:'long', day:'numeric', month:'long', year:'numeric' })} {end.toLocaleTimeString('fr-FR')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700">Comptable OK</span>
                          <span className="px-2 py-1 rounded text-xs bg-green-100 text-green-700">Chef OK</span>
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

                      <div className="no-print mt-3 flex items-center justify-end">
                        <button
                          className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50"
                          onClick={() => window.print()}
                          title="Imprimer le rapport"
                        >
                          🖨️ Imprimer
                        </button>
                      </div>
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
            <div className="rounded-2xl border shadow-sm p-6 bg-white hover:shadow transition">
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
            <div className="rounded-2xl border shadow-sm p-6 bg-white hover:shadow transition">
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
            <div className="rounded-2xl border shadow-sm p-6 bg-white hover:shadow transition">
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

      {/* BARRE BAS (avec bouton déconnexion) */}
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
            </div>

            <div className="flex items-center gap-3">
              {/* Déconnexion visible aussi en bas */}
              <button
                className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-gray-50 transition hidden sm:inline-flex items-center gap-2"
                onClick={handleLogout}
                title="Se déconnecter"
              >
                <LogOut className="h-4 w-4" />
                Déconnexion
              </button>

              {tab==='guichet' && (
                <>
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
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modale d’édition */}
      <EditReservationModal
        open={editOpen}
        onClose={() => { setEditOpen(false); setEditTarget(null); }}
        initial={editTarget}
        onSave={saveEditedReservation}
        isSaving={isSavingEdit}
      />

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
