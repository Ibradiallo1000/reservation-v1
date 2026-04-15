// src/pages/ReservationClientPage.tsx
import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SectionCard } from '@/ui';
import { Phone, Plus, Minus, User, AlertCircle, ArrowRight, Clock, Calendar, Loader2 } from 'lucide-react';
import ReservationStepHeader from '../components/ReservationStepHeader';
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { normalizePhone } from '@/utils/phoneUtils';
import { db } from '@/firebaseConfig';
import { Trip } from '@/types';
import { generateWebReferenceCode } from '@/utils/tickets';
import {
  getOrCreateTripInstanceForSlot,
  tripInstanceRef,
} from '@/modules/compagnie/tripInstances/tripInstanceService';
import { normalizeTripInstanceTime } from '@/modules/compagnie/tripInstances/generateTripInstancesFromWeeklyTrips';
import {
  fetchPendingOnlineHoldSeatsMap,
  onlineHoldCompositeKey,
} from '@/modules/compagnie/tripInstances/onlineReservationHolds';
import { tripInstanceRemainingFromDoc } from '@/modules/compagnie/tripInstances/tripInstanceTypes';
import { resolveJourneyStopIdsFromCities } from '@/modules/compagnie/routes/stopResolution';
import {
  buildValidTripsFromWeeklyTrips,
  getPublicScheduleDatesLocal,
  PUBLIC_RESERVATION_SCHEDULE_DAYS,
  publicScheduleLocalYmd,
} from '@/modules/compagnie/tripInstances/publicValidTripsService';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { getSlugFromSubdomain, getPublicPathBase } from '../utils/subdomain';
import { toast } from 'sonner';
import { createPayment } from '@/services/paymentService';
import { isReservationAwaitingPayment } from '../utils/onlineReservationStatus';
import { hexToRgba } from '@/utils/color';
import {
  savePendingReservation,
  readPendingReservationPointer,
  fetchReservationFromNestedPath,
  RESERVATION_DURATION_MS,
} from '../utils/pendingReservation';
import { debounce } from 'lodash';

// util pour token public
const randomToken = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// ---------- helpers ----------
const normalize = (s: string) =>
  s?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/-/g,' ').replace(/\s+/g,' ') || '';
const formatCity = (s: string) => s ? s.charAt(0).toUpperCase()+s.slice(1).toLowerCase() : s;
const DAYS = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

const formatDateLongFR = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
};

/** Même principe que AgenceGuichetPage (puces dates). */
const formatDateShortFR = (dateStr: string) => {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const raw = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' })
    .format(d)
    .replace('.', '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

type ExistingReservation = {
  id: string;
  companyId: string;
  agencyId: string;
  canal?: string;
  status?: string;
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
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.replace(/(\d{2})(?=\d)/g, '$1 ').trim();
};

const isValidMaliPhone = (value: string) => {
  return value.replace(/\s/g, '').length === 8;
};

export default function ReservationClientPage() {
  const { slug: slugParam, id: reservationRouteId } = useParams<{ slug: string; id?: string }>();
  const slug = getSlugFromSubdomain() ?? slugParam ?? '';
  const pathBase = getPublicPathBase(slug);

  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const isOnline = useOnlineStatus();

  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  
  // Ref pour éviter les appels multiples
  const isCreatingRef = useRef(false);

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
  const theme = useMemo(() => {
    const p = company.couleurPrimaire || '#f43f5e';
    const s = company.couleurSecondaire || '#f97316';
    return {
      primary: p,
      secondary: s,
      veryLightPrimary: hexToRgba(p, 0.1),
      lightPrimary: hexToRgba(p, 0.26),
      lightSecondary: hexToRgba(s, 0.26),
      routeGradStart: hexToRgba(p, 0.14),
      routeGradEnd: hexToRgba(p, 0.28),
      routeBorder: hexToRgba(p, 0.38),
      cardTrajetsBg: hexToRgba(p, 0.22),
      cardTrajetsBorder: hexToRgba(p, 0.48),
      cardInfosBg: hexToRgba(s, 0.2),
      cardInfosBorder: hexToRgba(s, 0.44),
      wellDatesBg: hexToRgba(p, 0.14),
      wellDatesBorder: hexToRgba(p, 0.4),
      wellHorairesBg: hexToRgba(s, 0.12),
      wellHorairesBorder: hexToRgba(s, 0.4),
      wellPlacesBg: hexToRgba(p, 0.12),
      wellPlacesBorder: hexToRgba(p, 0.36),
    };
  }, [company]);

  const [agencyInfo, setAgencyInfo] = useState<{
    id?: string; 
    nom?: string; 
    telephone?: string; 
    code?: string;
  }>({});
  const [validTrips, setValidTrips] = useState<Trip[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTripId, setSelectedTripId] = useState('');
  const [seats, setSeats] = useState(1);
  const [passenger, setPassenger] = useState({ fullName: '', phone: '' });

  const [creating, setCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSlowConnectionHint, setShowSlowConnectionHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [existing, setExisting] = useState<ExistingReservation | null>(null);

  // Redirect when user lands on booking with existing reservation → send to correct step
  useEffect(() => {
    if (!existing || !slug || !existing.id) return;
    const st = String(existing.status || '').toLowerCase();
    const legacy = String(existing.statut || '').toLowerCase();
    if (isReservationAwaitingPayment(st) || legacy === 'en_attente' || legacy === 'en_attente_paiement') {
      navigate(pathBase ? `/${pathBase}/payment/${existing.id}` : `/payment/${existing.id}`, {
        replace: true,
        state: { reservationId: existing.id, companyId: existing.companyId, agencyId: existing.agencyId }
      });
      return;
    }
    if (st === 'payé' || st === 'paye' || legacy === 'preuve_recue' || legacy === 'confirme') {
      navigate(pathBase ? `/${pathBase}/receipt/${existing.id}` : `/receipt/${existing.id}`, {
        replace: true,
        state: { companyId: existing.companyId, agencyId: existing.agencyId },
      });
      return;
    }
  }, [existing, slug, navigate, pathBase]);

  // Mode consultation (load existing for redirect)
  useEffect(() => {
    const loadExisting = async () => {
      if (!reservationRouteId || !slug) return;
      setLoading(true);
      try {
        const companyId = routeState.companyId ?? readPendingReservationPointer()?.companyId;
        const agencyId = routeState.agencyId ?? readPendingReservationPointer()?.agencyId;
        if (!companyId || !agencyId) {
          setError('Réservation introuvable. Ouvrez le lien reçu ou retrouvez-la avec votre numéro.');
          setLoading(false);
          return;
        }
        const snap = await fetchReservationFromNestedPath(db, companyId, agencyId, reservationRouteId);
        if (!snap) {
          setError("Réservation introuvable. Utilisez le lien de votre billet (mon-billet?r=...).");
          setLoading(false);
          return;
        }

        const compSnap = await getDoc(doc(db, 'companies', companyId));
        const comp = compSnap.exists() ? (compSnap.data() as any) : {};
        setCompany({
          id: companyId,
          name: comp.nom || comp.name || '',
          code: (comp.code || '').toString().toUpperCase(),
          couleurPrimaire: comp.couleurPrimaire || '#f43f5e',
          couleurSecondaire: comp.couleurSecondaire || '#f97316',
          logoUrl: comp.logoUrl || ''
        });

        setAgencyInfo({
          id: agencyId,
          nom: ((snap.agencyNom as string) || (snap.nomAgence as string) || 'Agence'),
          telephone: (snap.telephone as string) || '',
          code: undefined
        });

        setExisting({
          id: reservationRouteId,
          companyId,
          agencyId,
          canal: (snap.canal as string) ?? 'en_ligne',
          status: (snap.status as string) ?? '',
          statut: (snap.statut as string) ?? '',
          nomClient: (snap.nomClient as string) ?? '',
          telephone: (snap.telephone as string) ?? '',
          depart: (snap.depart as string) ?? '',
          arrivee: (snap.arrivee as string) ?? '',
          date: (snap.date as string) ?? '',
          heure: (snap.heure as string) ?? '',
          montant: Number(snap.montant ?? 0),
          seatsGo: Number(snap.seatsGo ?? 1),
          referenceCode: (snap.referenceCode as string) ?? ''
        });

        setLoading(false);
      } catch (e: any) {
        console.error(e);
        setError(e?.message || "Erreur de chargement");
        setLoading(false);
      }
    };

    void loadExisting();
  }, [reservationRouteId, routeState.companyId, routeState.agencyId, slug]);

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

        setAgencyInfo({});

        const depNorm = (search.get('departure') || '').trim();
        const arrNorm = (search.get('arrival') || '').trim();

        const { validTrips } = await buildValidTripsFromWeeklyTrips({
          companyId: cdoc.id,
          depNorm,
          arrNorm,
          limitCount: 100,
        });

        const directTrips = validTrips.map((trip) => ({
          ...trip,
          companyId: cdoc.id,
        })) as Trip[];
        const now = new Date();
        const upcomingTrips = directTrips.filter((trip: any) => {
          const tripDate = String(trip?.date ?? '');
          const tripTime = String(trip?.time ?? '00:00');
          const tripDt = new Date(`${tripDate}T${tripTime}`);
          if (Number.isNaN(tripDt.getTime())) return true;
          return tripDt.getTime() >= now.getTime();
        });
        setValidTrips(upcomingTrips);
        const strip = getPublicScheduleDatesLocal(PUBLIC_RESERVATION_SCHEDULE_DAYS);
        let selDate = strip[0] ?? '';
        let selTripId = '';
        for (const d of strip) {
          const tr = upcomingTrips.find((trip: any) => String(trip.date) === d);
          if (tr) {
            selDate = d;
            selTripId = String(tr.id);
            break;
          }
        }
        setSelectedDate(selDate);
        setSelectedTripId(selTripId);

        sessionStorage.setItem(`preload_${slug}_${departureQ}_${arrivalQ}`, JSON.stringify({
          company: {
            id: cdoc.id, 
            name: cdata.nom || '',
            couleurPrimaire: cdata.couleurPrimaire || '#f43f5e',
            couleurSecondaire: cdata.couleurSecondaire || '#f97316',
            logoUrl: cdata.logoUrl || '', 
            code: (cdata.code || 'MT').toString().toUpperCase()
          }, 
          trips: directTrips,
          agencyInfo: { 
            nom: '', 
            telephone: '', 
            code: undefined 
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

  // Appliquer les couleurs de la compagnie au thème du navigateur
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

  const calendarDates = useMemo(
    () => getPublicScheduleDatesLocal(PUBLIC_RESERVATION_SCHEDULE_DAYS),
    [validTrips]
  );

  const nowClock = new Date();
  const nowDateStr = publicScheduleLocalYmd(nowClock);
  const nowTimeStr = `${String(nowClock.getHours()).padStart(2, '0')}:${String(nowClock.getMinutes()).padStart(2, '0')}`;

  const slotsForSelectedDate = useMemo(() => {
    return validTrips
      .filter((t: any) => String(t.date) === selectedDate)
      .filter(
        (t: any) =>
          !(String(t.date) === nowDateStr && String(t.time || '').slice(0, 5) < nowTimeStr)
      );
  }, [validTrips, selectedDate, nowDateStr, nowTimeStr]);

  useEffect(() => {
    if (reservationRouteId) return;
    if (calendarDates.length === 0) return;
    if (!selectedDate || !calendarDates.includes(selectedDate)) {
      setSelectedDate(calendarDates[0]!);
    }
  }, [calendarDates, selectedDate, reservationRouteId]);

  useEffect(() => {
    if (reservationRouteId || !selectedDate) return;
    const list = validTrips.filter(
      (t: any) =>
        String(t.date) === selectedDate &&
        !(String(t.date) === nowDateStr && String(t.time || '').slice(0, 5) < nowTimeStr)
    );
    if (list.length === 0) {
      setSelectedTripId('');
      return;
    }
    const stillValid = list.some((t: any) => t.id === selectedTripId);
    if (!selectedTripId || !stillValid) {
      setSelectedTripId((list[0] as any).id);
    }
  }, [validTrips, selectedDate, selectedTripId, reservationRouteId, nowDateStr, nowTimeStr]);

  const selectedTrip: any = validTrips.find((t: any) => t.id === selectedTripId);
  const topPrice = selectedTrip?.price ?? (slotsForSelectedDate[0] as any)?.price ?? (validTrips[0] as any)?.price;

  const seatColor = (remaining: number) => {
    if (remaining > 10) return '#16a34a';
    if (remaining > 3) return '#f59e0b';
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

  // ---------- Création draft (version corrigée avec protection contre appels multiples) ----------
  const createReservationDraft = useCallback(async () => {
    // Protection contre les appels simultanés
    if (isCreatingRef.current) {
      console.log('[ReservationClientPage] Création déjà en cours, ignoré');
      return;
    }
    
    if (!validatePersonalInfo()) {
      setError('Veuillez corriger les erreurs ci-dessus');
      return;
    }
    if (!selectedTrip) {
      setError('Veuillez sélectionner un horaire');
      return;
    }
    if (creating || isSubmitting) return;

    isCreatingRef.current = true;
    setCreating(true);
    setIsSubmitting(true);
    setSubmitError(null);
    setShowSlowConnectionHint(false);
    setError('');
    setFieldErrors({});
    
    const slowHintTimer = window.setTimeout(() => {
      setShowSlowConnectionHint(true);
    }, 5000);
    
    try {
      const companyId = selectedTrip.companyId;
      let tripInstanceId = String(selectedTrip.id);
      const tiRefResolved = tripInstanceRef(companyId, tripInstanceId);
      let tiSnap = await getDoc(tiRefResolved);
      
      if (!tiSnap.exists()) {
        const wtid = String((selectedTrip as { weeklyTripId?: string }).weeklyTripId ?? '').trim();
        if (!wtid) {
          throw new Error('Trajet introuvable ou plus disponible.');
        }
        const timeNorm = normalizeTripInstanceTime(String(selectedTrip.time ?? ''));
        if (!timeNorm) {
          throw new Error('Horaire invalide.');
        }
        const cap = Math.max(
          1,
          Number((selectedTrip as { seatCapacity?: number }).seatCapacity ?? selectedTrip.remainingSeats ?? 0) || 1
        );
        const tiDoc = await getOrCreateTripInstanceForSlot(companyId, {
          agencyId: String(selectedTrip.agencyId),
          departureCity: selectedTrip.departure,
          arrivalCity: selectedTrip.arrival,
          date: String(selectedTrip.date),
          departureTime: timeNorm,
          weeklyTripId: wtid,
          seatCapacity: cap,
          price: selectedTrip.price,
          routeId: String((selectedTrip as { routeId?: string }).routeId ?? '').trim() || null,
          createdBy: 'public_reservation',
        });
        tripInstanceId = tiDoc.id;
        tiSnap = await getDoc(tripInstanceRef(companyId, tripInstanceId));
      }
      
      if (!tiSnap.exists()) {
        throw new Error('Trajet introuvable ou plus disponible.');
      }

      const agencyName = agencyInfo.nom || 'Agence';
      const agencyCode = agencyInfo.code;

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
      const companyCode = rawCompanyCode
        ? rawCompanyCode.toUpperCase()
        : inferCompanyCode(comp.nom || comp.name);
      
      // Génération du code avec gestion d'erreur
      let referenceCode: string;
      try {
        referenceCode = await generateWebReferenceCode({
          companyId: selectedTrip.companyId,
          companyCode,
          agencyId: selectedTrip.agencyId,
          agencyCode,
          agencyName,
          tripInstanceId
        });
      } catch (genError: any) {
        console.error('[ReservationClientPage] Erreur génération code:', genError);
        // Fallback : générer un code temporaire unique
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        referenceCode = `${companyCode}-${agencyCode || 'AG'}-WEB-${timestamp}-${random}`;
        toast.warning('Code de référence généré en mode dégradé', {
          description: 'Votre réservation est bien enregistrée'
        });
      }

      let originStopOrder: number | null = null;
      let destinationStopOrder: number | null = null;
      let originStopId: string | null = null;
      let destinationStopId: string | null = null;
      const routeId = String((selectedTrip as any).routeId ?? '').trim() || null;
      
      if (routeId) {
        const resolved = await resolveJourneyStopIdsFromCities(
          selectedTrip.companyId,
          routeId,
          selectedTrip.departure,
          selectedTrip.arrival
        );
        if (resolved) {
          originStopOrder = resolved.originStopOrder;
          destinationStopOrder = resolved.destinationStopOrder;
          originStopId = resolved.originStopId;
          destinationStopId = resolved.destinationStopId;
        }
      }

      const nowMs = Date.now();
      const nowTs = Timestamp.now();
      const expiresAtMs = nowMs + RESERVATION_DURATION_MS;
      const telephoneInput = passenger.phone.trim();
      const phoneNorm = normalizePhone(telephoneInput);

      const resCol = collection(
        db,
        'companies',
        selectedTrip.companyId,
        'agences',
        selectedTrip.agencyId,
        'reservations'
      );
      const newResRef = doc(resCol);
      const token = randomToken();
      const publicUrl = pathBase
        ? `${window.location.origin}/${pathBase}/mon-billet?r=${encodeURIComponent(token)}`
        : `${window.location.origin}/mon-billet?r=${encodeURIComponent(token)}`;

      const reservation = {
        nomClient: passenger.fullName.trim(),
        telephone: telephoneInput,
        telephoneOriginal: telephoneInput,
        telephoneNormalized: phoneNorm,
        phone: phoneNorm,
        depart: selectedTrip.departure,
        arrivee: selectedTrip.arrival,
        date: selectedTrip.date,
        heure: selectedTrip.time,
        montant: selectedTrip.price * seats,
        seatsGo: seats,
        seatsReturn: 0,
        tripType: 'aller_simple',
        status: 'en_attente',
        statut: 'en_attente',
        seatHoldOnly: true,
        seatsHeld: seats,
        canal: 'en_ligne',
        paymentChannel: 'online',
        companyId: selectedTrip.companyId,
        companySlug: slug,
        companyName: company.name,
        agencyId: selectedTrip.agencyId,
        agencyNom: agencyName,
        nomAgence: agencyName,
        referenceCode,
        trajetId: selectedTrip.id,
        tripInstanceId,
        publicToken: token,
        publicUrl,
        ...(originStopOrder != null && { originStopOrder }),
        ...(destinationStopOrder != null && { destinationStopOrder }),
        ...(originStopId != null && { originStopId }),
        ...(destinationStopId != null && { destinationStopId }),
        boardingStatus: 'pending',
        dropoffStatus: 'pending',
        journeyStatus: 'booked',
        expiresAt: expiresAtMs,
        createdAt: nowTs,
        updatedAt: serverTimestamp(),
      };

      console.log('[ReservationClientPage] reservation (avant écriture)', reservation);

      const holdMap = await fetchPendingOnlineHoldSeatsMap(companyId);
      const holdKey = onlineHoldCompositeKey(
        tripInstanceId,
        selectedTrip.departure,
        selectedTrip.arrival
      );
      const held = holdMap.get(holdKey) ?? 0;
      const baseRemaining = tripInstanceRemainingFromDoc(tiSnap.data()!);
      
      if (baseRemaining - held < seats) {
        throw new Error('Plus assez de places disponibles sur ce trajet.');
      }
      
      await setDoc(newResRef, reservation);
      const refDoc = { id: newResRef.id };

      const rawProvider = String((reservation as any).paymentMethod ?? (reservation as any).paiement ?? '').toLowerCase();
      const provider = rawProvider.includes('orange')
        ? 'orange'
        : rawProvider.includes('moov')
          ? 'moov'
          : rawProvider.includes('cash') || rawProvider.includes('esp')
            ? 'cash'
            : 'wave';
            
      try {
        await createPayment({
          reservationId: refDoc.id,
          companyId: selectedTrip.companyId,
          agencyId: selectedTrip.agencyId,
          amount: reservation.montant,
          currency: 'XOF',
          channel: 'online',
          provider,
          status: 'pending',
          paymentDocumentId: refDoc.id,
        });
      } catch (payErr: any) {
        console.error('[ReservationClientPage] createPayment failed:', payErr);
        toast.error('Réservation créée, mais le paiement « en attente » n’a pas été enregistré', {
          description: payErr?.message ?? payErr?.code ?? 'Vérifiez les règles Firestore (payments) ou réessayez.',
          duration: 8000,
        });
      }

      const publicSnapshot = {
        reservationId: refDoc.id,
        companyId: selectedTrip.companyId,
        agencyId: selectedTrip.agencyId,
        slug: slug!,
        publicToken: token,
        nomClient: reservation.nomClient,
        telephone: reservation.telephone,
        depart: reservation.depart,
        arrivee: reservation.arrivee,
        date: reservation.date,
        heure: reservation.heure,
        montant: reservation.montant,
        seatsGo: reservation.seatsGo,
        seatsReturn: reservation.seatsReturn,
        tripType: reservation.tripType,
        status: reservation.status,
        canal: reservation.canal,
        referenceCode: reservation.referenceCode,
        companyName: reservation.companyName,
        agencyNom: reservation.agencyNom,
        companySlug: reservation.companySlug,
        trajetId: reservation.trajetId,
        tripInstanceId: reservation.tripInstanceId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      await setDoc(doc(db, 'publicReservations', token), publicSnapshot);
      await setDoc(doc(db, 'publicReservations', refDoc.id), {
        token,
        companyId: selectedTrip.companyId,
        agencyId: selectedTrip.agencyId,
        slug: slug!,
      });
      
      try { 
        await navigator.clipboard.writeText(publicUrl); 
      } catch {}

      savePendingReservation({
        id: refDoc.id,
        companyId: selectedTrip.companyId,
        agencyId: selectedTrip.agencyId,
      });

      setIsSubmitting(false);
      navigate(pathBase ? `/${pathBase}/payment/${refDoc.id}` : `/payment/${refDoc.id}`, {
        replace: true,
        state: {
          reservationId: refDoc.id,
          companyId: selectedTrip.companyId,
          agencyId: selectedTrip.agencyId,
        },
      });
    } catch (e: any) {
      console.error('[ReservationClientPage] Erreur création:', e);
      setSubmitError('Erreur réseau ou places indisponibles');
      setError(e?.message || 'Impossible de créer la réservation');
    } finally { 
      window.clearTimeout(slowHintTimer);
      setShowSlowConnectionHint(false);
      setCreating(false);
      setIsSubmitting(false);
      isCreatingRef.current = false;
    }
  }, [selectedTrip, passenger, seats, creating, isSubmitting, slug, company, agencyInfo, navigate, validatePersonalInfo, pathBase]);

  // Version debounce de la création
  const createReservationDebounced = useCallback(
    debounce(() => {
      createReservationDraft();
    }, 500, { leading: true, trailing: false }),
    [createReservationDraft]
  );

  // Nettoyage du debounce au démontage
  useEffect(() => {
    return () => {
      createReservationDebounced.cancel();
    };
  }, [createReservationDebounced]);

  // ---------- UI: carte trajet épurée ----------
  const RouteCard = (titleRight?: string) => (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${theme.routeGradStart}, ${theme.routeGradEnd})`,
        border: `1px solid ${theme.routeBorder}`,
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

  // ---------- Rendu chargement ----------
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

      {existing ? (
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-12 flex flex-col items-center justify-center">
          <div className="animate-pulse text-gray-500 text-sm">Redirection…</div>
        </div>
      ) : (
        <main className="max-w-[1100px] mx-auto px-2.5 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
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

          <SectionCard
            title="Trajets disponibles"
            icon={Calendar}
            className="rounded-xl border-2 shadow-sm !bg-transparent hover:shadow-md dark:!bg-transparent"
            style={{
              backgroundColor: theme.cardTrajetsBg,
              borderColor: theme.cardTrajetsBorder,
            }}
          >
            <div className="space-y-4">
              {validTrips.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Aucun départ en ligne sur les sept prochains jours pour ce trajet.
                </p>
              ) : null}
              <div
                className="rounded-lg border px-3 py-3"
                style={{
                  backgroundColor: theme.wellDatesBg,
                  borderColor: theme.wellDatesBorder,
                }}
              >
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-gray-800">
                  <Clock className="h-3.5 w-3.5 shrink-0 opacity-70" style={{ color: theme.primary }} aria-hidden />
                  Dates
                </h4>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {calendarDates.map((d) => {
                    const active = d === selectedDate;
                    const hasSlots = validTrips.some((t: any) => String(t.date) === d);
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          setSelectedDate(d);
                          const first = validTrips.find((t: any) => String(t.date) === d);
                          setSelectedTripId(first ? String((first as any).id) : '');
                        }}
                        className="flex-shrink-0 rounded-lg border px-2 py-1 text-xs font-medium transition"
                        style={{
                          borderColor: active ? theme.primary : '#e5e7eb',
                          backgroundColor: active ? theme.lightPrimary : '#fff',
                          color: active ? theme.primary : hasSlots ? '#374151' : '#9ca3af',
                        }}
                      >
                        {formatDateShortFR(d)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {selectedDate ? (
                <div
                  className="rounded-lg border px-3 py-3"
                  style={{
                    backgroundColor: theme.wellHorairesBg,
                    borderColor: theme.wellHorairesBorder,
                  }}
                >
                  <h4 className="mb-2 text-xs font-semibold text-gray-800" style={{ color: theme.secondary }}>
                    Horaires
                  </h4>
                  {slotsForSelectedDate.length === 0 ? (
                    <p className="text-sm text-gray-500">Aucun départ pour cette date.</p>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {(slotsForSelectedDate as any[]).map((t) => {
                        const active = t.id === selectedTripId;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => setSelectedTripId(t.id)}
                            className="inline-flex w-fit max-w-full flex-shrink-0 flex-col items-start rounded-xl border px-3 py-2 text-left transition-all duration-200"
                            style={{
                              borderColor: active ? theme.primary : '#e5e7eb',
                              backgroundColor: active ? theme.lightPrimary : '#fafafa',
                            }}
                          >
                            <p
                              className="text-lg font-bold leading-none"
                              style={{ color: active ? theme.primary : '#111827' }}
                            >
                              {String(t.time || '').slice(0, 5)}
                            </p>
                            <p className="mt-1.5 text-xs" style={{ color: seatColor(t.remainingSeats) }}>
                              {t.remainingSeats} places
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </SectionCard>

          {selectedTrip && (
            <>
              <SectionCard
                title="Vos informations"
                icon={User}
                className="rounded-xl border-2 shadow-sm !bg-transparent hover:shadow-md dark:!bg-transparent"
                style={{
                  backgroundColor: theme.cardInfosBg,
                  borderColor: theme.cardInfosBorder,
                }}
              >
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <User className="h-5 w-5" />
                    </div>
                    <input
                      ref={nameInputRef}
                      disabled={isSubmitting}
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

                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                      <Phone className="h-5 w-5" />
                    </div>
                    <input
                      ref={phoneInputRef}
                      disabled={isSubmitting}
                      inputMode="numeric"
                      autoComplete="tel"
                      maxLength={11}
                      className={`h-12 pl-11 pr-4 w-full border rounded-xl focus:ring-2 focus:ring-offset-0 focus:outline-none bg-gray-50/80 text-gray-900 placeholder-gray-400 transition ${
                        fieldErrors.phone ? 'border-red-300 focus:border-red-400' : 'border-gray-200 focus:border-gray-300'
                      }`}
                      placeholder="Téléphone (ex: 22 22 22 22)"
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

                  <div
                    className="sm:col-span-2 flex flex-wrap items-center gap-3 rounded-lg border px-3 py-3"
                    style={{
                      backgroundColor: theme.wellPlacesBg,
                      borderColor: theme.wellPlacesBorder,
                    }}
                  >
                    <span className="text-sm font-medium text-gray-700">Nombre de places</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSeats(s => Math.max(1, s - 1))}
                        disabled={isSubmitting}
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
                        disabled={isSubmitting}
                        className="w-10 h-10 rounded-xl border-2 grid place-items-center transition hover:bg-gray-100"
                        style={{ borderColor: theme.primary, color: theme.primary }}
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <span className="text-xs text-gray-500" style={{ color: seatColor(selectedTrip.remainingSeats) }}>
                      {selectedTrip.remainingSeats} places disponibles
                    </span>
                  </div>
                </div>

                {isSubmitting && (
                  <div className="mt-4 p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-800 text-sm">
                    ⏳ Creation de votre reservation en cours...
                    {showSlowConnectionHint ? (
                      <div className="mt-1 text-blue-700">Connexion lente, veuillez patienter...</div>
                    ) : null}
                  </div>
                )}
                {submitError && (
                  <div className="mt-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-800 text-sm">
                    ❌ Impossible de créer la réservation
                    <div className="mt-1">🔁 Veuillez réessayer</div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={createReservationDebounced}
                  disabled={creating || isSubmitting}
                  className="mt-6 w-full h-12 rounded-xl font-semibold shadow-md disabled:opacity-60 transition hover:opacity-95 active:scale-[0.99] flex items-center justify-center gap-2 text-white"
                  style={{
                    background: `linear-gradient(135deg, ${theme.secondary}, ${theme.primary})`,
                  }}
                >
                  {creating || isSubmitting ? (
                    'Creation de votre reservation...'
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