// src/pages/ReservationClientPage.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format, isToday, isTomorrow, parseISO, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { SectionCard } from '@/ui';
import { ChevronLeft, Phone, Plus, Minus, CheckCircle, User, AlertCircle, ArrowRight, Clock, Calendar, Loader2, MessageCircle } from 'lucide-react';
import ReservationStepHeader from '../components/ReservationStepHeader';
import {
  collection, getDocs, query, where, addDoc, doc, updateDoc, setDoc, serverTimestamp, getDoc,
} from 'firebase/firestore';
import { normalizePhone } from '@/utils/phoneUtils';
import { db } from '@/firebaseConfig';
import { Trip } from '@/types';
import { generateWebReferenceCode } from '@/utils/tickets';
import { incrementReservedSeats, getOrCreateTripInstanceForSlot, listTripInstancesByRouteAndDate } from '@/modules/compagnie/tripInstances/tripInstanceService';
import { getStopOrdersFromCities, getRemainingSeats } from '@/modules/compagnie/tripInstances/segmentOccupancyService';
import { getRemainingStopQuota } from '@/modules/compagnie/tripInstances/inventoryQuotaService';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { getSlugFromSubdomain, getPublicPathBase } from '../utils/subdomain';
import { getAgencyCityFromDoc } from '@/modules/agence/utils/agencyCity';

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
  const { slug: slugParam, id: reservationRouteId } = useParams<{ slug: string; id?: string }>();
  /** En sous-domaine (mali-trans.teliya.app/booking), useParams renvoie slug="booking". On utilise le slug du sous-domaine pour charger la compagnie. */
  const slug = getSlugFromSubdomain() ?? slugParam ?? '';
  const pathBase = getPublicPathBase(slug);

  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const isOnline = useOnlineStatus();

  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const routeState = (location.state || {}) as { companyId?: string; agencyId?: string; companyFromSearch?: { id?: string; nom?: string; logoUrl?: string; couleurPrimaire?: string; couleurSecondaire?: string } };

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
      navigate(pathBase ? `/${pathBase}/payment/${existing.id}` : `/payment/${existing.id}`, {
        replace: true,
        state: { companyId: existing.companyId, agencyId: existing.agencyId }
      });
      return;
    }
    if (statut === 'preuve_recue' || statut === 'confirme') {
      navigate(pathBase ? `/${pathBase}/receipt/${existing.id}` : `/receipt/${existing.id}`, { replace: true });
      return;
    }
  }, [existing, slug, navigate, pathBase]);

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
        // Afficher l'agence de la ville de DÉPART (ex. Bamako pour Bamako → Gao), pas la première de la liste.
        const agencyForDeparture = agences.find(
          a => normalize(getAgencyCityFromDoc(a)) === departureQ
        ) ?? agences[0];
        if (agencyForDeparture) {
          const a = agencyForDeparture;
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

        const depNorm = (search.get('departure') || '').trim();
        const arrNorm = (search.get('arrival') || '').trim();
        const allTrips: Trip[] = [];

        for (const dateStr of next8) {
          let instances = await listTripInstancesByRouteAndDate(cdoc.id, depNorm, arrNorm, dateStr);
          if (instances.length === 0) {
            const d = new Date(dateStr);
            const dayName = DAYS[d.getDay()];
            for (const agence of agences) {
              const wSnap = await getDocs(query(
                collection(db, 'companies', cdoc.id, 'agences', agence.id, 'weeklyTrips'),
                where('active', '==', true)
              ));
              const weekly = wSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }))
                .filter((t: any) => normalize(t.depart || t.departure || '') === departureQ && normalize(t.arrivee || t.arrival || '') === arrivalQ);
              for (const t of weekly) {
                const horaires = (t.horaires?.[dayName] || []) as string[];
                for (const heure of horaires) {
                  if (dateStr === toYMD(new Date())) {
                    const now = new Date();
                    const nowHHMM = parse(
                      `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                      'HH:mm',
                      new Date()
                    );
                    if (parse(heure, 'HH:mm', new Date()) <= nowHHMM) continue;
                  }
                  await getOrCreateTripInstanceForSlot(cdoc.id, {
                    agencyId: agence.id,
                    departureCity: depNorm,
                    arrivalCity: arrNorm,
                    date: dateStr,
                    departureTime: heure,
                    seatCapacity: t.places ?? 30,
                    price: t.price ?? null,
                    weeklyTripId: t.id,
                  });
                }
              }
            }
            instances = await listTripInstancesByRouteAndDate(cdoc.id, depNorm, arrNorm, dateStr);
          }
          const todayYMD = toYMD(new Date());
          const withRoute = instances.filter((ti) => (ti as any).routeId && (ti as any).status !== 'cancelled');
          const remainingById: Record<string, number> = {};
          await Promise.all(
            withRoute.map(async (ti) => {
              const routeId = (ti as any).routeId;
              const resolved = await getStopOrdersFromCities(cdoc.id, routeId, depNorm, arrNorm);
              const originOrder = resolved?.originStopOrder ?? 1;
              remainingById[ti.id] = await getRemainingStopQuota(cdoc.id, ti.id, originOrder);
            })
          );
          for (const ti of instances) {
            if ((ti as any).status === 'cancelled') continue;
            const capacity = (ti as any).seatCapacity ?? (ti as any).capacitySeats ?? 30;
            const reserved = (ti as any).reservedSeats ?? 0;
            const fallbackRemaining = capacity - reserved;
            const routeId = (ti as any).routeId ?? null;
            const remaining = routeId != null && remainingById[ti.id] !== undefined
              ? remainingById[ti.id]
              : fallbackRemaining;
            if (remaining <= 0) continue;
            if (dateStr === todayYMD) {
              const now = new Date();
              const nowHHMM = parse(
                `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                'HH:mm',
                new Date()
              );
              if (parse((ti as any).departureTime, 'HH:mm', new Date()) <= nowHHMM) continue;
            }
            allTrips.push({
              id: ti.id,
              date: ti.date,
              time: (ti as any).departureTime,
              departure: (ti as any).departureCity ?? (ti as any).routeDeparture ?? '',
              arrival: (ti as any).arrivalCity ?? (ti as any).routeArrival ?? '',
              price: (ti as any).price ?? 0,
              agencyId: ti.agencyId,
              companyId: cdoc.id as any,
              places: capacity,
              remainingSeats: remaining,
              routeId,
            } as any);
          }
        }

        const sorted = allTrips.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
        const uniqDates = [...new Set(sorted.map(t => t.date))];

        setTrips(sorted); 
        setDates(uniqDates); 
        setSelectedDate(uniqDates[0] || '');

        const preloadAgency = agencyForDeparture ?? agences[0];
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
            nom: preloadAgency?.nomAgence || preloadAgency?.nom || '', 
            telephone: preloadAgency?.telephone || '', 
            code: preloadAgency?.code 
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

  // Appliquer les couleurs de la compagnie au thème du navigateur (barre d'adresse, zone autour du clavier sur mobile)
  const DEFAULT_THEME_COLOR = '#FF6600';
  useEffect(() => {
    if (!company?.couleurPrimaire) return;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const previous = meta.getAttribute('content') || DEFAULT_THEME_COLOR;
    meta.setAttribute('content', company.couleurPrimaire);
    return () => {
      meta.setAttribute('content', previous);
    };
  }, [company?.couleurPrimaire]);

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
      const tripInstanceId = selectedTrip.id as string;

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

      let originStopOrder: number | null = null;
      let destinationStopOrder: number | null = null;
      const routeId = (selectedTrip as any).routeId ?? null;
      if (routeId) {
        const resolved = await getStopOrdersFromCities(
          selectedTrip.companyId,
          routeId,
          selectedTrip.departure,
          selectedTrip.arrival
        );
        if (resolved) {
          originStopOrder = resolved.originStopOrder;
          destinationStopOrder = resolved.destinationStopOrder;
        }
      }

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
        ...(originStopOrder != null && { originStopOrder }),
        ...(destinationStopOrder != null && { destinationStopOrder }),
        boardingStatus: 'pending',
        dropoffStatus: 'pending',
        journeyStatus: 'booked',
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
      const publicUrl = pathBase ? `${window.location.origin}/${pathBase}/mon-billet?r=${encodeURIComponent(token)}` : `${window.location.origin}/mon-billet?r=${encodeURIComponent(token)}`;
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

      navigate(pathBase ? `/${pathBase}/payment/${refDoc.id}` : `/payment/${refDoc.id}`, {
        replace: true,
        state: { companyId: selectedTrip.companyId, agencyId: selectedTrip.agencyId }
      });
    } catch (e: any) {
      setError(e?.message || 'Impossible de créer la réservation');
    } finally { 
      setCreating(false); 
    }
  }, [selectedTrip, passenger, seats, creating, slug, company, navigate, validatePersonalInfo, pathBase]);

  // ---------- UI: carte trajet épurée (logo retiré, déjà présent dans le header) ----------
  const RouteCard = (titleRight?: string) => (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${theme.veryLightPrimary ?? `${theme.primary}14`}, ${theme.lightPrimary ?? `${theme.primary}22`})`,
        border: `1px solid ${theme.primary}20`,
      }}
    >
      <div className="flex items-center justify-between gap-4 px-4 sm:px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-gray-900">
            <span className="font-semibold text-sm sm:text-base truncate">
              {existing?.depart ? formatCity(existing.depart) : formatCity(departureQ)}
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400 flex-shrink-0" aria-hidden />
            <span className="font-semibold text-sm sm:text-base truncate">
              {existing?.arrivee ? formatCity(existing.arrivee) : formatCity(arrivalQ)}
            </span>
          </div>
          <p className="text-xs text-gray-600 mt-1">
            {existing?.date ? `${existing.date} · ${existing.heure || ''}` : 'Choisissez la date et l\'heure ci-dessous'}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          {titleRight ? (
            <span className="text-base font-bold" style={{ color: theme.primary }}>
              {titleRight}
            </span>
          ) : (
            <>
              <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">À partir de</p>
              <p className="text-lg font-bold mt-0.5" style={{ color: theme.primary }}>
                {(existing?.montant ?? topPrice) != null ? money(existing?.montant ?? topPrice) : '—'}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );

  // ---------- Rendu chargement (recherche trajets) : logo, animation, message "Soyez patient" ----------
  const companyForLoading = routeState?.companyFromSearch || company;
  const loadingLogoUrl = companyForLoading?.logoUrl || company.logoUrl;
  const loadingPrimary = companyForLoading?.couleurPrimaire || company.couleurPrimaire || '#f43f5e';

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-gray-50 to-white px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center max-w-sm w-full text-center"
        >
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="mb-6"
          >
            {loadingLogoUrl ? (
              <img
                src={loadingLogoUrl}
                alt=""
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-contain shadow-lg ring-2 ring-gray-100"
              />
            ) : (
              <div
                className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl flex items-center justify-center shadow-lg"
                style={{ backgroundColor: `${loadingPrimary}20` }}
              >
                <Loader2 className="h-10 w-10 sm:h-12 sm:w-12 animate-spin" style={{ color: loadingPrimary }} />
              </div>
            )}
          </motion.div>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Loader2 className="h-5 w-5 animate-spin text-gray-500" aria-hidden />
            <span className="text-sm font-medium text-gray-600">Recherche en cours…</span>
          </div>
          <p className="text-gray-500 text-sm">
            Soyez patient, nous recherchons vos trajets.
          </p>
        </motion.div>
      </div>
    );
  }

  // Pas de sous-titre trajet dans le header : la page affiche déjà les trajets (départ → arrivée, prix).
  // ---------- Rendu principal ----------
  return (
    <div className="min-h-screen bg-gradient-to-br from-white to-gray-50">
      <ReservationStepHeader
        onBack={() => navigate(-1)}
        primaryColor={theme.primary}
        secondaryColor={theme.secondary}
        title="Réservation"
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
        <main className="max-w-[1100px] mx-auto px-3 sm:px-4 py-5 sm:py-6 space-y-5 sm:space-y-6">
          {RouteCard()}

          {agencyInfo?.nom && (
            <div className="flex items-center gap-2 text-gray-500">
              <span className="inline-flex items-center gap-1.5 text-xs bg-gray-100 px-2.5 py-1 rounded-full">
                <Phone className="h-3.5 w-3.5" />
                {agencyInfo.nom}
                {agencyInfo.telephone && <span className="text-gray-400">· {agencyInfo.telephone}</span>}
              </span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-100 text-red-800 text-sm">{error}</div>
          )}

          {/* dates */}
          <SectionCard
            title="Date de départ"
            icon={Calendar}
            className="border-gray-100 shadow-sm bg-white rounded-xl"
          >
            <div className="flex gap-2 overflow-x-auto scrollbar-none pb-1">
              {dates.map(d => (
                <button
                  key={d}
                  onClick={() => { setSelectedDate(d); setSelectedTime(''); }}
                  className="flex-shrink-0 h-11 px-4 rounded-xl text-sm font-medium whitespace-nowrap transition-all duration-200"
                  style={{
                    border: selectedDate === d ? `2px solid ${theme.primary}` : '1px solid #e5e7eb',
                    color: selectedDate === d ? theme.primary : '#4b5563',
                    backgroundColor: selectedDate === d ? theme.lightPrimary : '#fafafa',
                  }}
                >
                  {format(parseISO(d), 'EEE d', { locale: fr })}
                  {(isToday(parseISO(d)) || isTomorrow(parseISO(d))) && (
                    <span className="ml-1.5 text-xs opacity-80">
                      {isToday(parseISO(d)) ? 'Auj.' : 'Demain'}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </SectionCard>

          {/* heures */}
          {!!filteredTrips.length && (
            <SectionCard
              title="Heure de départ"
              icon={Clock}
              className="border-gray-100 shadow-sm bg-white rounded-xl"
            >
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {filteredTrips.map((t: any) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTime(t.time)}
                    className="h-12 px-3 rounded-xl border text-sm text-left transition-all duration-200 flex flex-col justify-center"
                    style={{
                      borderColor: selectedTime === t.time ? theme.primary : '#e5e7eb',
                      backgroundColor: selectedTime === t.time ? theme.lightPrimary : '#fafafa',
                      color: selectedTime === t.time ? theme.primary : '#374151',
                    }}
                  >
                    <span className="font-semibold">{t.time}</span>
                    <span
                      className="text-[11px] font-medium mt-0.5"
                      style={{ color: seatColor(t.remainingSeats, t.places) }}
                    >
                      {t.remainingSeats} places
                    </span>
                  </button>
                ))}
              </div>
            </SectionCard>
          )}

          {/* infos personnelles */}
          {selectedTrip && (
            <>
              <SectionCard
                title="Vos informations"
                icon={User}
                className="border-gray-100 shadow-sm bg-white rounded-xl"
              >
                <p className="text-sm text-gray-600 mb-2">
                  Nom complet et numéro de téléphone du ou des passagers pour le voyage.
                </p>
                <div className="flex items-start gap-2 p-3 rounded-xl mb-4 bg-green-50 border border-green-100">
                  <MessageCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" aria-hidden />
                  <p className="text-sm text-green-800">
                    <strong>Préférence :</strong> indiquez un numéro <strong>WhatsApp</strong> pour recevoir le lien de votre billet directement sur WhatsApp après validation.
                  </p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {/* Nom */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="h-5 w-5" />
                    </div>
                    <input
                      ref={nameInputRef}
                      className={`h-12 pl-11 pr-4 w-full border rounded-xl focus:ring-2 focus:ring-offset-0 focus:outline-none bg-gray-50/80 text-gray-900 placeholder-gray-400 transition ${
                        fieldErrors.fullName ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-gray-300'
                      }`}
                      placeholder="Nom complet"
                      value={passenger.fullName}
                      onChange={e => {
                        setPassenger(p => ({ ...p, fullName: e.target.value }));
                        if (fieldErrors.fullName) setFieldErrors(prev => ({ ...prev, fullName: '' }));
                      }}
                    />
                    {fieldErrors.fullName && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {fieldErrors.fullName}
                      </p>
                    )}
                  </div>

                  {/* Téléphone (WhatsApp recommandé) */}
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Phone className="h-5 w-5" />
                    </div>
                    <input
                      ref={phoneInputRef}
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11}
                      className={`h-12 pl-11 pr-4 w-full border rounded-xl focus:ring-2 focus:ring-offset-0 focus:outline-none bg-gray-50/80 text-gray-900 placeholder-gray-400 transition ${
                        fieldErrors.phone ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-gray-300'
                      }`}
                      placeholder="Téléphone / WhatsApp (ex: 22 22 22 22)"
                      value={passenger.phone}
                      onChange={e => {
                        setPassenger(p => ({ ...p, phone: formatMaliPhone(e.target.value) }));
                        if (fieldErrors.phone) setFieldErrors(prev => ({ ...prev, phone: '' }));
                      }}
                    />
                    {fieldErrors.phone && (
                      <p className="text-xs text-red-600 mt-1.5 flex items-center gap-1">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {fieldErrors.phone}
                      </p>
                    )}
                  </div>

                  {/* Places */}
                  <div className="sm:col-span-2 flex items-center gap-3 pt-1">
                    <span className="text-sm font-medium text-gray-700">Nombre de places</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSeats(s => Math.max(1, s - 1))}
                        className="w-10 h-10 rounded-xl border-2 grid place-items-center transition hover:bg-gray-100"
                        style={{ borderColor: theme.primary, color: theme.primary }}
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                      <span
                        className="min-w-[2.5rem] text-center text-base font-bold"
                        style={{ color: theme.primary }}
                      >
                        {seats}
                      </span>
                      <button
                        type="button"
                        onClick={() => setSeats(s => Math.min(Math.min(5, selectedTrip.remainingSeats), s + 1))}
                        className="w-10 h-10 rounded-xl border-2 grid place-items-center transition hover:bg-gray-100"
                        style={{ borderColor: theme.primary, color: theme.primary }}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-xs text-gray-500" style={{ color: seatColor(selectedTrip.remainingSeats, selectedTrip.places) }}>
                      {selectedTrip.remainingSeats} places disponibles
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={createReservationDraft}
                  disabled={creating}
                  className="mt-6 w-full h-12 rounded-xl font-semibold shadow-md disabled:opacity-60 transition hover:opacity-95 active:scale-[0.99] flex items-center justify-center gap-2 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`,
                  }}
                >
                  {creating ? (
                    'Traitement…'
                  ) : (
                    <>
                      Passer au paiement
                      <ArrowRight className="w-5 h-5" />
                      <span className="font-bold">{money(selectedTrip.price * seats)}</span>
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