// src/pages/ReservationClientPage.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, isToday, isTomorrow, parseISO, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SectionCard } from '@/ui';
import { ChevronLeft, Phone, Plus, Minus, CheckCircle, User, AlertCircle, ArrowRight, Clock, Calendar } from 'lucide-react';
import ReservationStepHeader from '../components/ReservationStepHeader';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc, setDoc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { canonicalStatut } from '@/utils/reservationStatusUtils';
import { normalizePhone } from '@/utils/phoneUtils';
import { db } from '@/firebaseConfig';
import { Trip } from '@/types';
import { generateWebReferenceCode } from '@/utils/tickets';
import { incrementReservedSeats, getOrCreateTripInstanceForSlot } from '@/modules/compagnie/tripInstances/tripInstanceService';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';

/* ============== Anti-spam: mémoire locale ============== */
const PENDING_KEY = 'pendingReservation';

const isBlockingStatus = (s?: string) =>
  ['preuve_recue', 'confirme'].includes(String(s || '').toLowerCase());

const rememberPending = (payload: { slug: string; id: string; referenceCode?: string; status: string; companyId?: string; agencyId?: string; }) => {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(payload)); } catch {}
};

const readPending = (): { slug: string; id: string; referenceCode?: string; status: string; companyId?: string; agencyId?: string; } | null => {
  try { const r = localStorage.getItem(PENDING_KEY); return r ? JSON.parse(r) : null; } catch { return null; }
};

const clearPendingIfNotBlocking = () => {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    if (!isBlockingStatus(p?.status)) localStorage.removeItem(PENDING_KEY);
  } catch {}
};
/* ======================================================= */

// util pour token public
const randomToken = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ---------- helpers ----------
const normalize = (s: string) =>
  s?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/-/g,' ').replace(/\s+/g,' ') || '';
const toYMD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const formatCity = (s: string) => s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : s;
const addMin = (d: Date, m: number) => new Date(d.getTime() + m*60000);
const DAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

type ExistingReservation = {
  id: string;
  companyId: string;
  agencyId: string;
  canal?: string;
  statut?: string;
  nomClient?: string;
  telephone?: string;
  depart?: string;
  arrivee?: string;
  date?: string;
  heure?: string;
  montant?: number;
  seatsGo?: number;
  referenceCode?: string;
};

// ===== Téléphone Mali (8 chiffres, format 22 22 22 22) =====
const formatMaliPhone = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8); // uniquement chiffres, max 8
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
};

const isValidMaliPhone = (value: string) => {
  return value.replace(/\s/g, '').length === 8;
};

export default function ReservationClientPage() {
  const { slug, id: reservationRouteId } = useParams<{ slug: string; id?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const isOnline = useOnlineStatus();

  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const routeState = (location.state || {}) as { companyId?: string; agencyId?: string };

  const search = new URLSearchParams(location.search);
  const departureQ = normalize(search.get('departure') || '');
  const arrivalQ   = normalize(search.get('arrival') || '');

  const [company, setCompany] = useState({ 
    id: '', 
    name: '', 
    couleurPrimaire: '#f43f5e', 
    couleurSecondaire: '#f97316', 
    logoUrl: '', 
    code: '' 
  });
  const theme = useMemo(() => ({
    primary: company.couleurPrimaire,
    secondary: company.couleurSecondaire,
    lightPrimary: `${company.couleurPrimaire}1A`,
    lightSecondary: `${company.couleurSecondaire}1A`,
    veryLightPrimary: `${company.couleurPrimaire}08`, // 🔥 Pour background subtil
  }), [company]);

  const [agencyInfo, setAgencyInfo] = useState<{
    id?: string; 
    nom?: string; 
    telephone?: string; 
    code?: string;
  }>({});
  const [trips, setTrips] = useState<Trip[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [seats, setSeats] = useState(1);
  const [passenger, setPassenger] = useState({ fullName: '', phone: '' });

  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [existing, setExisting] = useState<ExistingReservation | null>(null);

  useEffect(() => {
    clearPendingIfNotBlocking();
    // CORRECTION : Pas de redirection automatique basée uniquement sur le pending
    // L'utilisateur doit compléter le processus de paiement explicitement
  }, [slug, navigate, reservationRouteId]);

  // Redirect when user lands on booking with existing reservation → send to correct step
  useEffect(() => {
    if (!existing || !slug || !existing.id) return;
    const statut = String(existing.statut || '').toLowerCase();
    if (statut === 'en_attente_paiement') {
      navigate(`/${slug}/payment/${existing.id}`, {
        replace: true,
        state: { companyId: existing.companyId, agencyId: existing.agencyId }
      });
      return;
    }
    if (statut === 'preuve_recue' || statut === 'confirme') {
      navigate(`/${slug}/receipt/${existing.id}`, { replace: true });
      return;
    }
  }, [existing, slug, navigate]);

  // Mode consultation (load existing for redirect)
  useEffect(() => {
    const loadExisting = async () => {
      if (!reservationRouteId) return;
      setLoading(true);
      try {
        if (!routeState.companyId || !routeState.agencyId) {
          setError("Information manquante (company/agency). Revenez en arrière et réessayez.");
          setLoading(false);
          return;
        }

        const refDoc = doc(db, 'companies', routeState.companyId, 'agences', routeState.agencyId, 'reservations', reservationRouteId);
        const snap = await getDoc(refDoc);
        if (!snap.exists()) {
          setError("Réservation introuvable.");
          setLoading(false);
          return;
        }
        const r = snap.data() as any;

        const compSnap = await getDoc(doc(db, 'companies', routeState.companyId));
        const comp = compSnap.exists() ? (compSnap.data() as any) : {};
        setCompany({
          id: routeState.companyId,
          name: comp.nom || comp.name || '',
          code: (comp.code || '').toString().toUpperCase(),
          couleurPrimaire: comp.couleurPrimaire || '#f43f5e',
          couleurSecondaire: comp.couleurSecondaire || '#f97316',
          logoUrl: comp.logoUrl || ''
        });

        const agSnap = await getDoc(doc(db, 'companies', routeState.companyId, 'agences', routeState.agencyId));
        const ag = agSnap.exists() ? (agSnap.data() as any) : {};
        setAgencyInfo({
          id: routeState.agencyId,
          nom: ag.nomAgence || ag.nom || ag.name || 'Agence',
          telephone: ag.telephone,
          code: (ag.code || ag.codeAgence || '').toString().toUpperCase() || undefined
        });

        setExisting({
          id: reservationRouteId,
          companyId: routeState.companyId,
          agencyId: routeState.agencyId,
          canal: r.canal,
          statut: r.statut,
          nomClient: r.nomClient,
          telephone: r.telephone,
          depart: r.depart,
          arrivee: r.arrivee || r.arrival,
          date: r.date,
          heure: r.heure,
          montant: r.montant ?? r.montant_total,
          seatsGo: r.seatsGo,
          referenceCode: r.referenceCode
        });

        setLoading(false);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Erreur de chargement");
        setLoading(false);
      }
    };

    void loadExisting();
  }, [reservationRouteId, routeState.companyId, routeState.agencyId]);

  // Mode création
  useEffect(() => {
    if (reservationRouteId) return;
    if (!slug || !departureQ || !arrivalQ) { 
      setLoading(false); 
      return; 
    }

    const load = async () => {
      setLoading(true);
      try {
        const cSnap = await getDocs(query(collection(db, 'companies'), where('slug', '==', slug)));
        if (cSnap.empty) throw new Error('Compagnie introuvable');
        const cdoc = cSnap.docs[0]; 
        const cdata = cdoc.data() as any;

        setCompany({
          id: cdoc.id,
          name: cdata.nom || cdata.name || '',
          code: (cdata.code || '').toString().toUpperCase(),
          couleurPrimaire: cdata.couleurPrimaire || '#f43f5e',
          couleurSecondaire: cdata.couleurSecondaire || '#f97316',
          logoUrl: cdata.logoUrl || ''
        });

        const agencesSnap = await getDocs(collection(db, 'companies', cdoc.id, 'agences'));
        const agences = agencesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
        if (agences[0]) {
          const a = agences[0];
          setAgencyInfo({
            id: a.id,
            nom: a.nomAgence || a.nom || a.name,
            telephone: a.telephone,
            code: (a.code || a.codeAgence || '').toString().toUpperCase() || undefined
          });
        }

        const next8 = Array.from({ length: 8 }, (_, i) => { 
          const d = new Date(); 
          d.setDate(d.getDate() + i); 
          return toYMD(d); 
        });

        const allTrips: Trip[] = [];
        for (const a of agences) {
          const [wSnap, rSnap] = await Promise.all([
            getDocs(query(
              collection(db, 'companies', cdoc.id, 'agences', a.id, 'weeklyTrips'), 
              where('active', '==', true)
            )),
            getDocs(collection(db, 'companies', cdoc.id, 'agences', a.id, 'reservations'))
          ]);
          const weekly = wSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))
            .filter(t => normalize(t.depart || t.departure || '') === departureQ && 
                         normalize(t.arrivee || t.arrival || '') === arrivalQ);
          const reservations = rSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
          
          next8.forEach(dateStr => {
            const d = new Date(dateStr); 
            const dayName = DAYS[d.getDay()];
            weekly.forEach((t: any) => {
              (t.horaires?.[dayName] || []).forEach((heure: string) => {
                if (dateStr === toYMD(new Date())) {
                  const now = new Date();
                  const nowHHMM = parse(
                    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                    'HH:mm',
                    new Date()
                  );
                  if (parse(heure, 'HH:mm', new Date()) <= nowHHMM) return;
                }
                const trajetId = `${t.id}_${dateStr}_${heure}`;
                const total = t.places || 30;
                const reserved = reservations
                  .filter(r => String((r as any).trajetId) === trajetId && 
                          ['confirme', 'paye'].includes(canonicalStatut((r as any).statut)))
                  .reduce((a, r: any) => a + (r.seatsGo || 0), 0);
                const remaining = total - reserved;
                if (remaining > 0) {
                  allTrips.push({
                    id: trajetId,
                    date: dateStr, 
                    time: heure,
                    departure: t.depart || t.departure || '',
                    arrival: t.arrivee || t.arrival || '',
                    price: t.price,
                    agencyId: a.id as any, 
                    companyId: cdoc.id as any,
                    places: total, 
                    remainingSeats: remaining
                  } as any);
                }
              });
            });
          });
        }
        const sorted = allTrips.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        const uniqDates = [...new Set(sorted.map(t => t.date))];

        setTrips(sorted); 
        setDates(uniqDates); 
        setSelectedDate(uniqDates[0] || '');

        sessionStorage.setItem(`preload_${slug}_${departureQ}_${arrivalQ}`, JSON.stringify({
          company: {
            id: cdoc.id, 
            name: cdata.nom || '',
            couleurPrimaire: cdata.couleurPrimaire || '#f43f5e',
            couleurSecondaire: cdata.couleurSecondaire || '#f97316',
            logoUrl: cdata.logoUrl || '', 
            code: (cdata.code || 'MT').toString().toUpperCase()
          }, 
          trips: sorted, 
          dates: uniqDates,
          agencyInfo: { 
            nom: agences[0]?.nomAgence || agences[0]?.nom || '', 
            telephone: agences[0]?.telephone || '', 
            code: agences[0]?.code 
          }
        }));
      } catch (e: any) {
        setError(e?.message || 'Erreur de chargement');
      } finally { 
        setLoading(false); 
      }
    };

    load();
  }, [slug, departureQ, arrivalQ, reservationRouteId]);

  const filteredTrips = useMemo(() => {
    if (!selectedDate) return [] as any[];
    const base = trips.filter((t: any) => t.date === selectedDate);
    if (isToday(parseISO(selectedDate))) {
      const now = new Date();
      const nowHHMM = parse(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        'HH:mm',
        new Date()
      );
      return base.filter((t: any) => parse(t.time, 'HH:mm', new Date()) > nowHHMM);
    }
    return base;
  }, [trips, selectedDate]);

  useEffect(() => {
    if (!reservationRouteId && filteredTrips.length && !selectedTime) {
      setSelectedTime(filteredTrips[0].time);
    }
  }, [filteredTrips, selectedTime, reservationRouteId]);

  const selectedTrip: any = filteredTrips.find((t: any) => t.time === selectedTime);
  const topPrice = (selectedTrip?.price ?? (filteredTrips[0] as any)?.price);

  const seatColor = (remaining: number, total: number) => {
    const ratio = remaining / total;
    if (ratio > 0.7) return '#16a34a';
    if (ratio > 0.3) return '#f59e0b';
    return '#dc2626';
  };

  // ---------- Validation et scroll ----------
  const validatePersonalInfo = () => {
    const errors: Record<string, string> = {};
    
    if (!passenger.fullName.trim()) {
      errors.fullName = 'Le nom complet est requis';
    }
    
    if (!passenger.phone.trim()) {
    errors.phone = 'Le numéro de téléphone est requis';
    } else if (!isValidMaliPhone(passenger.phone)) {
    errors.phone = 'Numéro invalide (format attendu : 22 22 22 22)';
    }
    
    setFieldErrors(errors);
    
    if (Object.keys(errors).length > 0) {
      if (errors.fullName && nameInputRef.current) {
        nameInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        nameInputRef.current.focus();
      } else if (errors.phone && phoneInputRef.current) {
        phoneInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        phoneInputRef.current.focus();
      }
      return false;
    }
    
    return true;
  };

  // ---------- Création draft ----------
  const createReservationDraft = useCallback(async () => {
    if (!validatePersonalInfo()) {
      setError('Veuillez corriger les erreurs ci-dessus');
      return;
    }
    if (!selectedTrip) {
      setError('Veuillez sélectionner un horaire');
      return;
    }
    if (creating) return;

    setCreating(true); 
    setError('');
    setFieldErrors({});
    
    try {
      const companyId = selectedTrip.companyId;
      let tripInstanceId = selectedTrip.id as string;
      if (typeof tripInstanceId === 'string' && tripInstanceId.includes('_')) {
        const ti = await getOrCreateTripInstanceForSlot(companyId, {
          agencyId: selectedTrip.agencyId,
          departureCity: selectedTrip.departure ?? '',
          arrivalCity: selectedTrip.arrival ?? '',
          date: selectedTrip.date ?? '',
          departureTime: selectedTrip.time ?? '',
          seatCapacity: selectedTrip.places ?? 30,
          price: selectedTrip.price ?? null,
        });
        tripInstanceId = ti.id;
      }

      const agSnap = await getDoc(doc(db, 'companies', companyId, 'agences', selectedTrip.agencyId));
      const ag = agSnap.exists() ? (agSnap.data() as any) : {};
      const agencyName = ag.nomAgence || ag.nom || ag.name || 'Agence';
      const agencyCode = (ag.code || ag.codeAgence || '').toString().toUpperCase() || undefined;

      const compSnap = await getDoc(doc(db, 'companies', selectedTrip.companyId));
      const comp = compSnap.exists() ? (compSnap.data() as any) : {};
      function inferCompanyCode(name?: string) {
        if (!name) return '';
        const initials = name
          .trim()
          .split(/\s+/)
          .map(w => w[0])
          .join('')
          .toUpperCase();
        return initials.slice(0, 3);
      }

      const rawCompanyCode = (comp.code || company.code || '').toString().trim();

      const companyCode =
        rawCompanyCode
          ? rawCompanyCode.toUpperCase()
          : inferCompanyCode(comp.nom || comp.name);
      const referenceCode = await generateWebReferenceCode({
        companyId: selectedTrip.companyId,
        companyCode,
        agencyId: selectedTrip.agencyId,
        agencyCode,
        agencyName,
        tripInstanceId
      });

      const now = new Date();
      const telephoneInput = passenger.phone.trim();
      const reservation = {
        nomClient: passenger.fullName.trim(),
        telephone: telephoneInput,
        telephoneOriginal: telephoneInput,
        telephoneNormalized: normalizePhone(telephoneInput),
        depart: selectedTrip.departure,
        arrivee: selectedTrip.arrival,
        date: selectedTrip.date,
        heure: selectedTrip.time,
        montant: selectedTrip.price * seats,
        seatsGo: seats, 
        seatsReturn: 0, 
        tripType: 'aller_simple',
        statut: 'en_attente_paiement', 
        canal: 'en_ligne',
        companyId: selectedTrip.companyId,
        companySlug: slug,
        companyName: company.name,
        agencyId: selectedTrip.agencyId,
        agencyNom: agencyName,
        nomAgence: agencyName,
        referenceCode,
        trajetId: selectedTrip.id,
        tripInstanceId,
        holdUntil: addMin(now, 15),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      const refDoc = await addDoc(
        collection(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId, 'reservations'),
        reservation
      );

      try {
        await incrementReservedSeats(companyId, tripInstanceId, seats);
      } catch (e) {
        console.error('Could not update trip instance reservedSeats:', e);
      }

      const token = randomToken();
      const publicUrl = `${window.location.origin}/${slug}/mon-billet?r=${encodeURIComponent(token)}`;
      await updateDoc(
        doc(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId, 'reservations', refDoc.id),
        { publicToken: token, publicUrl, updatedAt: serverTimestamp() }
      );

      await setDoc(doc(db, 'publicReservations', refDoc.id), {
        reservationId: refDoc.id,
        companyId: selectedTrip.companyId,
        agencyId: selectedTrip.agencyId,
        slug: slug!,
        publicToken: token,
        createdAt: serverTimestamp(),
      });
      
      try { 
        await navigator.clipboard.writeText(publicUrl); 
      } catch {}

      rememberPending({
        slug: slug!,
        id: refDoc.id,
        referenceCode,
        status: 'en_attente_paiement',
        companyId: selectedTrip.companyId,
        agencyId: selectedTrip.agencyId
      });

      navigate(`/${slug}/payment/${refDoc.id}`, {
        replace: true,
        state: { companyId: selectedTrip.companyId, agencyId: selectedTrip.agencyId }
      });
    } catch (e: any) {
      setError(e?.message || 'Impossible de créer la réservation');
    } finally { 
      setCreating(false); 
    }
  }, [selectedTrip, passenger, seats, creating, slug, company, navigate, validatePersonalInfo]);

  // ---------- UI components ----------
  const RouteCard = (titleRight?: string) => (
    <div className="border border-gray-200 bg-white rounded-2xl shadow-md overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4">
        <div className="flex items-center gap-3 min-w-0">
          {company.logoUrl && (
            <img src={company.logoUrl} alt="" className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200" />
          )}
          <div className="min-w-0">
            <div className="flex items-center text-gray-900 font-semibold">
              <span className="truncate">
                {existing?.depart ? formatCity(existing.depart) : formatCity(departureQ)}
              </span>
              <span className="mx-2 text-gray-400 font-normal">→</span>
              <span className="truncate">
                {existing?.arrivee ? formatCity(existing.arrivee) : formatCity(arrivalQ)}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {existing?.date ? `${existing.date} · ${existing.heure || ''}` : 'Sélectionnez la date et l\'heure'}
            </p>
          </div>
        </div>
        <div className="text-right">
          {titleRight ? (
            <div className="text-lg sm:text-xl font-extrabold" style={{ color: theme.primary }}>
              {titleRight}
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-500">À partir de</div>
              <div className="text-lg sm:text-xl font-extrabold" style={{ color: theme.primary }}>
                { (existing?.montant ?? topPrice) != null 
                  ? money(existing?.montant ?? topPrice)
                  : '—' 
                }
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ---------- Rendu en-tête ----------
  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-gray-50">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="bg-white/70 backdrop-blur rounded-2xl p-6 shadow-sm"
        >
          <div className="flex items-center gap-3">
            {company.logoUrl && (
              <img src={company.logoUrl} alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-gray-200" />
            )}
            <div>
              <div className="h-4 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-3 w-24 bg-gray-200 rounded" />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const departureLabel = search.get('departure') || '';
  const arrivalLabel = search.get('arrival') || '';
  const routeSubtitle = departureLabel && arrivalLabel
    ? `${formatCity(departureLabel)} → ${formatCity(arrivalLabel)}`
    : undefined;

  // ---------- Rendu principal ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50">
      <ReservationStepHeader
        onBack={() => navigate(-1)}
        primaryColor={theme.primary}
        secondaryColor={theme.secondary}
        title="Réservation"
        subtitle={routeSubtitle}
        logoUrl={company.logoUrl || undefined}
      />
      {!isOnline && (
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 pt-3">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            Connexion instable. Certaines actions peuvent échouer.
          </div>
        </div>
      )}

      {/* Redirecting when existing reservation (user opened booking with id) */}
      {existing ? (
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-12 flex flex-col items-center justify-center">
          <div className="animate-pulse text-gray-500 text-sm">Redirection…</div>
        </div>
      ) : (
        /* Step 1 only: reservation form → then redirect to payment page */
        <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 space-y-4 sm:space-y-5">
          {RouteCard()}

          {agencyInfo?.nom && (
            <div className="text-xs text-gray-500 px-1">Agence : {agencyInfo.nom} — {agencyInfo.telephone}</div>
          )}

          {error && (
            <div className="p-3 border border-gray-200 rounded-lg bg-gray-50 text-gray-800">{error}</div>
          )}

          {/* dates */}
          <SectionCard title="Choisissez votre date de départ" icon={Calendar} className="shadow-md">
            <div className="flex gap-2 overflow-x-auto scrollbar-none">
              {dates.map(d => (
                <button
                  key={d}
                  onClick={() => { setSelectedDate(d); setSelectedTime(''); }}
                  className="h-10 px-3 rounded-xl border text-sm whitespace-nowrap transition"
                  style={{
                    borderColor: selectedDate === d ? theme.primary : '#e5e7eb',
                    color: selectedDate === d ? '#111827' : '#374151',
                    backgroundColor: selectedDate === d ? theme.lightPrimary : '#f9fafb'
                  }}
                >
                  <span className="font-medium">{format(parseISO(d), 'EEE d', { locale: fr })}</span>
                  {isToday(parseISO(d)) && (
                    <span className="ml-2 text-xs text-gray-500">Aujourd'hui</span>
                  )}
                  {isTomorrow(parseISO(d)) && (
                    <span className="ml-2 text-xs text-gray-500">Demain</span>
                  )}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* heures */}
          {!!filteredTrips.length && (
            <SectionCard title="Choisissez votre heure de départ" icon={Clock} className="shadow-md">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {filteredTrips.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTime(t.time)}
                    className="h-11 px-3 rounded-lg border text-sm text-left transition"
                    style={{
                      borderColor: selectedTime === t.time ? theme.secondary : '#e5e7eb',
                      backgroundColor: selectedTime === t.time ? theme.lightSecondary : '#f9fafb'
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{t.time}</span>
                      <span
                        className="text-[11px] px-2 h-5 rounded-md grid place-items-center whitespace-nowrap leading-none"
                        style={{ 
                          color: seatColor(t.remainingSeats, t.places), 
                          border: `1px solid ${seatColor(t.remainingSeats, t.places)}` 
                        }}
                      >
                        {t.remainingSeats} pl.
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {/* infos personnelles */}
          {selectedTrip && (
            <>
              <SectionCard title="Informations personnelles" icon={User} className="shadow-md">
                <p className="text-sm text-gray-500 mb-4">
                  Entrez votre <span className="font-medium">nom complet</span> et votre <span className="font-medium">numéro de téléphone</span> utilisés pour voyager.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {/* Nom */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      ref={nameInputRef}
                      className={`h-11 pl-10 pr-3 w-full border rounded-lg focus:ring-2 focus:outline-none bg-white text-gray-900 placeholder-gray-500 ${
                        fieldErrors.fullName ? 'border-red-300' : 'border-gray-200'
                      }`}
                      placeholder="Nom complet *"
                      value={passenger.fullName}
                      onChange={e => {
                        setPassenger(p => ({ ...p, fullName: e.target.value }));
                        if (fieldErrors.fullName) {
                          setFieldErrors(prev => ({ ...prev, fullName: '' }));
                        }
                      }}
                    />
                    {fieldErrors.fullName && (
                      <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {fieldErrors.fullName}
                    </div>
                    )}
                  </div>

                  {/* Téléphone */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      ref={phoneInputRef}
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11} // 8 chiffres + 3 espaces
                      className={`h-11 pl-10 pr-3 w-full border rounded-lg focus:ring-2 focus:outline-none bg-white text-gray-900 placeholder-gray-500 ${
                        fieldErrors.phone ? 'border-red-300' : 'border-gray-200'
                      }`}
                      placeholder="Téléphone * (ex: 22 22 22 22)"
                      value={passenger.phone}
                      onChange={e => {
                        const formatted = formatMaliPhone(e.target.value);
                        setPassenger(p => ({ ...p, phone: formatted }));

                        if (fieldErrors.phone) {
                        setFieldErrors(prev => ({ ...prev, phone: '' }));
                        }
                      }}
                    />
                    {fieldErrors.phone && (
                      <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {fieldErrors.phone}
                      </div>
                    )}
                  </div>

                  {/* Places */}
                  <div className="sm:col-span-2 flex items-center gap-4 mt-2">
                    <span className="text-sm text-gray-600">Places</span>
                    <button 
                      onClick={() => setSeats(s => Math.max(1, s - 1))} 
                      className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50" 
                      style={{ borderColor: theme.lightPrimary, color: theme.primary }}
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span 
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold" 
                      style={{ background: theme.lightPrimary, color: theme.primary }}
                    >
                      {seats}
                    </span>
                    <button 
                      onClick={() => setSeats(s => Math.min(Math.min(5, selectedTrip.remainingSeats), s + 1))} 
                      className="w-9 h-9 rounded-full border grid place-items-center hover:bg-gray-50" 
                      style={{ borderColor: theme.lightPrimary, color: theme.primary }}
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-xs" style={{ color: seatColor(selectedTrip.remainingSeats, selectedTrip.places) }}>
                      {selectedTrip.remainingSeats} pl. dispo
                    </span>
                  </div>
                </div>
                
                <button
                  onClick={createReservationDraft}
                  disabled={creating}
                  className="mt-4 w-full h-11 rounded-xl font-semibold shadow-sm disabled:opacity-60 transition hover:brightness-[0.98] flex items-center justify-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`,
                    color: '#fff',
                  }}
                >
                  {creating ? 'Traitement…' : (
                    <>
                      Passer au paiement
                      <ArrowRight className="w-4 h-4" />
                      <span className="font-bold">
                        {money(selectedTrip.price * seats)}
                      </span>
                    </>
                  )}
                </button>
              </SectionCard>
            </>
          )}
        </main>
      )}
    </div>
  );
}