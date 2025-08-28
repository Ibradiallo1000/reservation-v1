import React, { useEffect, useState, useMemo } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { db } from '@/firebaseConfig';
import { Trip } from '@/types';
import { ChevronLeft, Phone, Bus, Plus, Minus } from 'lucide-react';
import {
  collection, getDocs, query, where, addDoc, doc, getDoc, serverTimestamp
} from 'firebase/firestore';
import { format, isToday, isTomorrow, parseISO, parse } from 'date-fns';
import { fr } from 'date-fns/locale';
import { motion } from 'framer-motion';

// ===================== DEBUG / LOGGER =====================
// Mets DEBUG=false en prod pour couper les consoles.
const DEBUG = true;
const NS = '[ReservationClientPage]';
const log = {
  info: (...args: any[]) => DEBUG && console.log(NS, ...args),
  warn: (...args: any[]) => DEBUG && console.warn(NS, ...args),
  error: (...args: any[]) => DEBUG && console.error(NS, ...args),
  group: (label: string) => DEBUG && console.group(`${NS} ${label}`),
  groupEnd: () => DEBUG && console.groupEnd(),
};
// =========================================================

interface WeeklyTrip {
  id: string;
  active: boolean;
  depart?: string;
  departure?: string;
  arrivee?: string;
  arrival?: string;
  price: number;
  places?: number;
  horaires?: Record<string, string[]>;
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Normalise une chaîne (retire accents, tirets, espaces multiples) pour matcher Firestore
const normalizeForQuery = (str: string) =>
  str ? str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/-/g, ' ').replace(/\s+/g, ' ') : '';

const formatCityName = (name: string) => name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();

const ReservationClientPage: React.FC = () => {
  // ======= Routing / Query =======
  const { slug } = useParams<{ slug: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const searchParams = new URLSearchParams(location.search);
  const departure = normalizeForQuery(searchParams.get('departure') || '');
  const arrival = normalizeForQuery(searchParams.get('arrival') || '');

  // ======= State =======
  const [company, setCompany] = useState({
    id: '',
    name: '',
    couleurPrimaire: '#3b82f6',
    couleurSecondaire: '#93c5fd',
    logoUrl: ''
  });
  const [agencyInfo, setAgencyInfo] = useState({ nom: '', telephone: '' });
  const [trips, setTrips] = useState<Trip[]>([]);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [passengerInfo, setPassengerInfo] = useState({
    fullName: '',
    phone: '',
    email: ''
  });
  const [seats, setSeats] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // ======= Récupération du cache (sessionStorage) =======
  useEffect(() => {
    log.group('Init / Cache');
    try {
      const key = `preload_${slug}_${departure}_${arrival}`;
      const cachedData = sessionStorage.getItem(key);
      log.info('Query', { slug, departure, arrival, key, hasCache: !!cachedData });

      if (cachedData) {
        const { company, trips, dates, agencyInfo } = JSON.parse(cachedData);
        setCompany(company);
        setTrips(trips);
        setDates(dates);
        setSelectedDate(dates[0] || '');
        setAgencyInfo(agencyInfo);
        log.info('Cache restored', { company, tripsCount: trips.length, dates, agencyInfo });
      }
    } catch (e) {
      log.warn('Cache parse error', e);
    } finally {
      log.groupEnd();
    }
  }, [slug, departure, arrival]);

  // ======= Chargement Firestore en parallèle =======
  useEffect(() => {
    if (!slug || !departure || !arrival) {
      log.warn('Missing slug/departure/arrival => skip load');
      return;
    }

    const loadAllData = async () => {
      setLoading(true);
      log.group('LoadAllData');
      try {
        const [companyData, tripsData] = await Promise.all([
          loadCompanyData(),
          loadTripsData()
        ]);

        if (companyData) {
          setCompany(companyData);
          sessionStorage.setItem('companyInfo', JSON.stringify(companyData));
          log.info('Company loaded', companyData);
        }

        if (tripsData) {
          const { trips, dates, agencyInfo } = tripsData;
          setTrips(trips);
          setDates(dates);
          setSelectedDate(dates[0] || '');
          setAgencyInfo(agencyInfo);

          const key = `preload_${slug}_${departure}_${arrival}`;
          sessionStorage.setItem(
            key,
            JSON.stringify({ company: companyData, trips, dates, agencyInfo, timestamp: Date.now() })
          );
          log.info('Trips loaded', { tripsCount: trips.length, dates, agencyInfo, cacheKey: key });
        }
      } catch (err) {
        log.error('LoadAllData error', err);
        setError('Une erreur est survenue lors du chargement des données');
      } finally {
        setLoading(false);
        log.groupEnd();
      }
    };

    loadAllData();
  }, [slug, departure, arrival]);

  // ------- Firestore: compagnie -------
  const loadCompanyData = async () => {
    log.group('loadCompanyData');
    try {
      const snap = await getDocs(query(collection(db, 'companies'), where('slug', '==', slug)));
      if (snap.empty) {
        log.warn('Company not found for slug', slug);
        return null;
      }
      const d = snap.docs[0];
      const c = {
        id: d.id,
        name: d.data().nom || '',
        couleurPrimaire: d.data().couleurPrimaire || '#3b82f6',
        couleurSecondaire: d.data().couleurSecondaire || '#93c5fd',
        logoUrl: d.data().logoUrl || '',
        slug
      };
      log.info('Company data', c);
      return c;
    } catch (e) {
      log.error('loadCompanyData error', e);
      return null;
    } finally {
      log.groupEnd();
    }
  };

  // ------- Firestore: trajets / réservations / places restantes -------
  const loadTripsData = async () => {
    log.group('loadTripsData');
    try {
      const companySnap = await getDocs(query(collection(db, 'companies'), where('slug', '==', slug)));
      if (companySnap.empty) return null;

      const companyId = companySnap.docs[0].id;

      // On récupère toutes les agences de la compagnie
      const agencesSnap = await getDocs(collection(db, 'companies', companyId, 'agences'));
      const agences = agencesSnap.docs.map(doc => ({
        id: doc.id,
        nom: doc.data().nom || '',
        telephone: doc.data().telephone || ''
      }));

      const agencyInfo = agences.length > 0
        ? { nom: agences[0].nom, telephone: agences[0].telephone }
        : { nom: '', telephone: '' };

      // 8 prochains jours
      const next8Days = Array.from({ length: 8 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() + i);
        return d.toISOString().split('T')[0];
      });

      const allTrips: Trip[] = [];

      await Promise.all(agences.map(async (agence) => {
        // weeklyTrips + reservations en parallèle
        const [weeklyTripsSnap, reservationsSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'companies', companyId, 'agences', agence.id, 'weeklyTrips'),
            where('active', '==', true)
          )),
          getDocs(collection(db, 'companies', companyId, 'agences', agence.id, 'reservations'))
        ]);

        const matched: WeeklyTrip[] = weeklyTripsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() } as WeeklyTrip))
          .filter((t) => {
            const dep = normalizeForQuery(t.depart || t.departure || '');
            const arr = normalizeForQuery(t.arrivee || t.arrival || '');
            return dep === departure && arr === arrival;
          });

        const reservations = reservationsSnap.docs.map(doc => doc.data());

        next8Days.forEach(dateStr => {
          const d = new Date(dateStr);
          const dayName = DAYS[d.getDay()];

          matched.forEach(t => {
            const horaires = t.horaires?.[dayName] || [];

            horaires.forEach(heure => {
              const trajetId = `${t.id}_${dateStr}_${heure}`;

              // Filtre les horaires déjà passés aujourd'hui
              if (dateStr === new Date().toISOString().split('T')[0]) {
                const now = new Date();
                const tripTime = parse(heure, 'HH:mm', new Date());
                if (tripTime <= now) return;
              }

              const reserved = (reservations as any[])
                .filter((r) => String(r.trajetId) === trajetId && ['payé', 'preuve_recue'].includes(String(r.statut).toLowerCase()))
                .reduce((acc, r) => acc + (r.seatsGo || 0), 0);

              const total = t.places || 30;
              const remaining = total - reserved;

              if (remaining > 0) {
                allTrips.push({
                  id: trajetId,
                  date: dateStr,
                  time: heure,
                  departure: t.depart || t.departure || '',
                  arrival: t.arrivee || t.arrival || '',
                  price: t.price,
                  agencyId: agence.id as any,
                  companyId: companyId as any,
                  places: total,
                  remainingSeats: remaining,
                } as any);
              }
            });
          });
        });
      }));

      const sorted = allTrips.sort((a, b) => a.date.localeCompare(b.date));
      const uniqueDates = [...new Set(sorted.map(t => t.date))]
        .filter(date => sorted.some(t => t.date === date));

      log.info('TripsData built', { count: sorted.length, dates: uniqueDates });
      return { trips: sorted, dates: uniqueDates, agencyInfo };
    } catch (e) {
      log.error('loadTripsData error', e);
      return null;
    } finally {
      log.groupEnd();
    }
  };

  // ======= Filtre par date / heure (memo) =======
  const filteredTrips = useMemo(() => {
    const label = 'filteredTrips';
    log.group(label);
    try {
      if (!selectedDate) {
        log.info('No selectedDate');
        return [];
      }

      const baseFiltered = trips.filter((t: any) => t.date === selectedDate);
      if (isToday(parseISO(selectedDate))) {
        const now = new Date();
        const next = baseFiltered.filter((trip: any) => parse(trip.time, 'HH:mm', new Date()) > now);
        log.info('Today filter', { input: baseFiltered.length, output: next.length });
        return next;
      }
      log.info('Base filter', { count: baseFiltered.length });
      return baseFiltered;
    } finally {
      log.groupEnd();
    }
  }, [trips, selectedDate]);

  const selectedTrip: any = filteredTrips.find((t: any) => t.time === selectedTime);

  const formatShortDate = (dateStr: string) => {
    const date = parseISO(dateStr);
    return format(date, 'EEE d', { locale: fr });
  };

  // ===================== BOOKING =====================
  const handleBooking = async () => {
    // Vérifs basiques
    if (!selectedTrip) return;
    if (!passengerInfo.fullName || !passengerInfo.phone) {
      setError('Veuillez remplir votre nom complet et numéro de téléphone');
      return;
    }

    log.group('handleBooking');
    try {
      // 1) Agency fetch (pour nom + tel agency)
      const agencyRef = doc(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId);
      const agencySnap = await getDoc(agencyRef);
      const agencyData = agencySnap.data() || {};
      log.info('Agency', { id: selectedTrip.agencyId, agencyData });

      // 2) Construction de la réservation (AUCUN numéro généré ici)
      const reservation = {
        nomClient: passengerInfo.fullName,
        telephone: passengerInfo.phone,
        email: passengerInfo.email || null,

        depart: selectedTrip.departure,
        arrivee: selectedTrip.arrival,
        date: selectedTrip.date,
        heure: selectedTrip.time,

        montant: selectedTrip.price * seats,
        seatsGo: seats,

        statut: 'en_attente',       // en ligne = en attente (preuve à envoyer)
        canal: 'en_ligne',
        tripType: 'aller_simple',

        companyId: selectedTrip.companyId,
        agencyId: selectedTrip.agencyId,
        agencyNom: (agencyData as any).nom || '',
        agencyTelephone: (agencyData as any).telephone || '',

        trajetId: selectedTrip.id,

        // ⚠️ On NE génère PAS de referenceCode ici.
        companySlug: slug,
        companyName: company.name,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 3) Enregistrement Firestore
      const ref = await addDoc(
        collection(db, 'companies', selectedTrip.companyId, 'agences', selectedTrip.agencyId, 'reservations'),
        reservation
      );
      log.info('Reservation added', { resId: ref.id, reservation });

      // 4) Contexte pour l’upload de preuve
      const companyForReceipt = {
        id: selectedTrip.companyId,
        name: company.name,
        logoUrl: company.logoUrl,
        couleurPrimaire: company.couleurPrimaire,
        couleurSecondaire: company.couleurSecondaire,
        slug,
      };

      sessionStorage.setItem('reservationDraft', JSON.stringify({ ...reservation, id: ref.id }));
      sessionStorage.setItem('companyInfo', JSON.stringify(companyForReceipt));
      log.info('Draft saved to sessionStorage', { id: ref.id });

      // 5) REDIRECTION OK → page d’upload de preuve (PMA)
      navigate(`/${slug}/upload-preuve/${ref.id}`);
      log.info('Navigate to upload-preuve', { path: `/${slug}/upload-preuve/${ref.id}` });
    } catch (err) {
      log.error('Booking error', err);
      setError('Une erreur est survenue lors de la réservation');
    } finally {
      log.groupEnd();
    }
  };
  // ===================================================

  // Skeletons
  const DateSkeleton = () => (<div className="h-12 w-16 bg-gray-200 rounded-lg animate-pulse" />);
  const TimeSkeleton = () => (<div className="h-20 bg-gray-200 rounded-lg animate-pulse" />);

  // Thème
  const theme = useMemo(() => ({
    primary: company.couleurPrimaire,
    secondary: company.couleurSecondaire,
    lightPrimary: `${company.couleurPrimaire}20`,
    lightSecondary: `${company.couleurSecondaire}20`,
    textOnPrimary: '#ffffff',
  }), [company.couleurPrimaire, company.couleurSecondaire]);

  // Loader initial
  if (loading || !company.id || dates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: -50, scale: 0.5 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative flex items-center justify-center mb-6"
        >
          <motion.div
            className="absolute w-28 h-28 rounded-full"
            style={{ backgroundColor: company.couleurPrimaire, opacity: 0.2 }}
            animate={{ scale: [1, 1.4, 1], opacity: [0.2, 0, 0.2] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <motion.img
            src={company.logoUrl}
            alt="Logo compagnie"
            className="h-20 w-20 rounded-full object-cover border-4 shadow-lg"
            style={{ borderColor: company.couleurSecondaire }}
            whileHover={{ scale: 1.05 }}
          />
        </motion.div>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6, duration: 0.6 }} className="text-gray-600 font-medium">
          Recherche en cours...
        </motion.p>
      </div>
    );
  }

  const priceToShow = (selectedTrip?.price ?? (filteredTrips[0] as any)?.price);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <header className="p-4 shadow-sm sticky top-0 z-50" style={{ backgroundColor: theme.primary }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between text-white">
          <button onClick={() => navigate(-1)} className="hover:opacity-80 transition-opacity">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            {company.logoUrl && (
              <img src={company.logoUrl} alt="logo" className="h-8 w-8 rounded-full object-cover border border-white" />
            )}
            <span className="font-semibold text-lg">{company.name}</span>
          </div>
        </div>
      </header>

      {/* Agency info */}
      {agencyInfo.nom && (
        <div className="bg-white py-2 px-4 border-b border-gray-100">
          <div className="max-w-5xl mx-auto text-sm text-gray-600">
            Agence : {agencyInfo.nom} — {agencyInfo.telephone}
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto p-4">
        {/* Route + price */}
        <section className="flex items-center justify-between bg-white p-4 mb-6 rounded-xl shadow-sm border" style={{ borderColor: theme.primary }}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-full" style={{ backgroundColor: theme.lightPrimary }}>
              <Bus className="w-5 h-5" style={{ color: theme.primary }} />
            </div>
            <h1 className="font-semibold text-lg text-gray-900">
              {formatCityName(departure)} → {formatCityName(arrival)}
            </h1>
          </div>
          <div className="text-right font-bold text-lg" style={{ color: theme.primary }}>
            {priceToShow ? `${priceToShow.toLocaleString('fr-FR')} FCFA` : 'Prix non disponible'}
          </div>
        </section>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-3 text-red-800">
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Step 1: Date */}
        {!loading && dates.length > 0 && (
          <div className="mb-8 p-5 rounded-xl shadow-sm border"
               style={{ backgroundColor: theme.lightPrimary, borderColor: theme.primary }}>
            <div className="flex items-center mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full font-bold mr-3 text-white"
                   style={{ backgroundColor: theme.primary }}>1</div>
              <h2 className="text-lg font-semibold text-gray-900">Choisissez votre date du voyage</h2>
            </div>
            <div className="overflow-x-auto pb-2">
              <div className="flex space-x-3 w-max">
                {dates.map(date => (
                  <button
                    key={date}
                    onClick={() => { setSelectedDate(date); setSelectedTime(''); log.info('Select date', date); }}
                    className={`py-2 px-4 rounded-lg border transition-all flex flex-col items-center min-w-[80px] ${
                      selectedDate === date ? 'shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                    }`}
                    style={{
                      borderColor: selectedDate === date ? theme.primary : '',
                      backgroundColor: selectedDate === date ? theme.lightPrimary : 'white'
                    }}
                  >
                    <div className="font-medium text-sm">{formatShortDate(date)}</div>
                    {isToday(parseISO(date)) && <div className="text-xs mt-1">Aujourd'hui</div>}
                    {isTomorrow(parseISO(date)) && <div className="text-xs mt-1">Demain</div>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Time */}
        {!loading && filteredTrips.length > 0 && (
          <div className="mb-8 p-5 rounded-xl shadow-sm border"
               style={{ backgroundColor: theme.lightSecondary, borderColor: theme.secondary }}>
            <div className="flex items-center mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full font-bold mr-3 text-white"
                   style={{ backgroundColor: theme.secondary }}>2</div>
              <h2 className="text-lg font-semibold text-gray-900">Choisissez votre heure de depart</h2>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {filteredTrips.map((trip: any) => (
                <button
                  key={trip.id}
                  onClick={() => { setSelectedTime(trip.time); log.info('Select time', trip.time, { trip }); }}
                  className={`py-3 px-4 rounded-lg border transition-all ${
                    selectedTime === trip.time ? 'shadow-sm' : 'bg-white text-gray-700 border-gray-200 hover:border-gray-300'
                  }`}
                  style={{
                    borderColor: selectedTime === trip.time ? theme.secondary : '',
                    backgroundColor: selectedTime === trip.time ? theme.lightSecondary : 'white'
                  }}
                >
                  <div className="font-bold text-center text-lg">{trip.time}</div>
                  <div className="text-sm text-center mt-1">
                    {trip.remainingSeats} place{trip.remainingSeats > 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 3: Passenger */}
        {!loading && selectedTrip && (
          <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center mb-4">
              <div className="flex items-center justify-center w-8 h-8 rounded-full font-bold mr-3 text-white"
                   style={{ backgroundColor: theme.primary }}>3</div>
              <h2 className="text-lg font-semibold text-gray-900">Informations personnelles</h2>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Nom complet *
                </label>
                <input
                  id="fullName"
                  type="text"
                  placeholder="Votre nom complet"
                  value={passengerInfo.fullName}
                  onChange={e => { setPassengerInfo({ ...passengerInfo, fullName: e.target.value }); }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:outline-none focus:ring-blue-500"
                  style={{ borderColor: theme.lightPrimary }}
                  required
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                  Numéro de téléphone *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Phone className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="phone"
                    type="tel"
                    placeholder="Votre numéro de téléphone"
                    value={passengerInfo.phone}
                    onChange={e => { setPassengerInfo({ ...passengerInfo, phone: e.target.value }); }}
                    className="w-full pl-10 px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:outline-none focus:ring-blue-500"
                    style={{ borderColor: theme.lightPrimary }}
                    required
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Email (facultatif)
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="Votre email"
                  value={passengerInfo.email}
                  onChange={e => { setPassengerInfo({ ...passengerInfo, email: e.target.value }); }}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:outline-none focus:ring-blue-500"
                  style={{ borderColor: theme.lightPrimary }}
                />
              </div>

              <div>
                <label htmlFor="seats" className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de places ({selectedTrip.remainingSeats} disponible{selectedTrip.remainingSeats > 1 ? 's' : ''})
                </label>
                <div className="flex items-center space-x-4">
                  <button
                    onClick={() => { const s = Math.max(1, seats - 1); setSeats(s); log.info('Seats--', s); }}
                    className="w-10 h-10 rounded-full flex items-center justify-center border"
                    style={{ borderColor: theme.lightPrimary, color: theme.primary }}
                  >
                    <Minus className="w-5 h-5" />
                  </button>
                  <span className="text-lg font-semibold px-4 py-2 rounded-lg"
                        style={{ backgroundColor: theme.lightPrimary, color: theme.primary }}>
                    {seats}
                  </span>
                  <button
                    onClick={() => { const s = Math.min(10, selectedTrip.remainingSeats, seats + 1); setSeats(s); log.info('Seats++', s); }}
                    className="w-10 h-10 rounded-full flex items-center justify-center border"
                    style={{ borderColor: theme.lightPrimary, color: theme.primary }}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Bouton fixe */}
      {!loading && selectedTrip && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 py-3 px-4 shadow-lg">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <div>
              <div className="text-sm text-gray-600">Total pour {seats} place{seats > 1 ? 's' : ''}</div>
              <div className="font-bold text-lg" style={{ color: theme.primary }}>
                {(selectedTrip.price * seats).toLocaleString('fr-FR')} FCFA
              </div>
            </div>
            <button
              onClick={handleBooking}
              className="py-3 px-6 text-white font-bold rounded-lg shadow-md hover:shadow-lg transition-all"
              style={{ backgroundColor: theme.secondary }}
            >
              Confirmer la réservation
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationClientPage;
