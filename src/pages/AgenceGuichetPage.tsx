import React, { useEffect, useState, useCallback } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
  Timestamp,
  addDoc,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Trip {
  id: string;
  date: string;
  time: string;
  departure: string;
  arrival: string;
  price: number;
  places?: number;
  remainingSeats?: number;
}
type WeeklyTrip = {
  id: string;
  departure: string;
  arrival: string;
  active: boolean;
  horaires: { [key: string]: string[] };
  price: number;
  places?: number;
};

type TripType = 'aller_simple' | 'aller_retour';
type PaymentMethod = 'espèces' | 'mobile_money';

const MAX_SEATS = 30;
const DAYS_IN_ADVANCE = 8;
const DEFAULT_COMPANY_SLUG = 'compagnie-par-defaut';

const AgenceGuichetPage: React.FC = () => {
  // Context and navigation
  const { user } = useAuth();
  const navigate = useNavigate();

  // State for search filters
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [selectedDate, setSelectedDate] = useState('');

  // State for trips data
  const [trips, setTrips] = useState<Trip[]>([]);
  const [filteredTrips, setFilteredTrips] = useState<Trip[]>([]);
  const [allDepartures, setAllDepartures] = useState<string[]>([]);
  const [allArrivals, setAllArrivals] = useState<string[]>([]);

  // State for reservation
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [nomClient, setNomClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [places, setPlaces] = useState(1);
  const [placesRetour, setPlacesRetour] = useState(0);
  const [tripType, setTripType] = useState<TripType>('aller_simple');
  const [totalPrice, setTotalPrice] = useState(0);
  const [paiement, setPaiement] = useState<PaymentMethod>('espèces');
  const [isProcessing, setIsProcessing] = useState(false);

  // Generate available dates (today + 7 days)
  const availableDates = Array.from({ length: DAYS_IN_ADVANCE }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    return date.toISOString().split('T')[0];
  });

  // Check if a trip time is in the past
  const isPastTime = useCallback((date: string, time: string): boolean => {
    const now = new Date();
    const [hours, minutes] = time.split(':').map(Number);
    const tripDate = new Date(date);
    tripDate.setHours(hours, minutes, 0, 0);
    return tripDate.getTime() < now.getTime();
  }, []);

  // Verify user company on component mount
  useEffect(() => {
    const loadCities = async () => {
      try {
        const snapshot = await getDocs(
          query(collection(db, 'weeklyTrips'), where('active', '==', true))
        );
        const allTrips = snapshot.docs.map(doc => doc.data());

        const uniqueDepartures = Array.from(new Set(allTrips.map((t: any) => t.departure)));
        const uniqueArrivals = Array.from(new Set(allTrips.map((t: any) => t.arrival)));

        setAllDepartures(uniqueDepartures);
        setAllArrivals(uniqueArrivals);
      } catch (error) {
        console.error('Erreur chargement des villes:', error);
      }
    };

    loadCities();
  }, []);

  // Calculate total price when relevant values change
  useEffect(() => {
    if (!selectedTrip) {
      setTotalPrice(0);
      return;
    }

    const basePrice = selectedTrip.price;
    let calculatedTotal = places * basePrice;
    
    if (tripType === 'aller_retour') {
      calculatedTotal += placesRetour * basePrice;
    }

    setTotalPrice(calculatedTotal);
  }, [places, placesRetour, tripType, selectedTrip]);

  const handleSearch = useCallback(async () => {
    if (!departure || !arrival) {
      alert('Veuillez sélectionner une ville de départ et une ville d\'arrivée');
      return;
    }

    try {
      const depLower = departure.trim().toLowerCase();
      const arrLower = arrival.trim().toLowerCase();

      // Charger les weeklyTrips de cette agence
      const q = query(
        collection(db, 'weeklyTrips'),
        where('agencyId', '==', user?.agencyId || '')
      );
      const snapshot = await getDocs(q);
      const weeklyTrips = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as WeeklyTrip[];

      // Générer dynamiquement les trajets à venir sur 8 jours
      const generatedTrips: Trip[] = [];
      const now = new Date();

      for (let i = 0; i < DAYS_IN_ADVANCE; i++) {
        const date = new Date(now);
        date.setDate(now.getDate() + i);
        const jourSemaine = date
          .toLocaleDateString('fr-FR', { weekday: 'long' })
          .toLowerCase(); // ex: "lundi"

        for (const trip of weeklyTrips) {
          if (
            trip.departure?.toLowerCase() === depLower &&
            trip.arrival?.toLowerCase() === arrLower &&
            trip.active &&
            trip.horaires?.[jourSemaine]?.length > 0
          ) {
            for (const heure of trip.horaires[jourSemaine]) {
              generatedTrips.push({
                id: `${trip.id}_${date.toISOString().split('T')[0]}_${heure}`,
                date: date.toISOString().split('T')[0],
                time: heure,
                departure: trip.departure,
                arrival: trip.arrival,
                price: trip.price,
                places: trip.places || MAX_SEATS,
              });
            }
          }
        }
      }

      // Récupérer les réservations payées pour calculer les places restantes
      const reservationsSnap = await getDocs(collection(db, 'reservations'));
      const reservations = reservationsSnap.docs.map(doc => doc.data());

      const enrichedTrips = generatedTrips
        .map(trip => {
          const reservedSeats = reservations
            .filter(res =>
              res.trajetId === trip.id &&
              res.statut === 'payé'
            )
            .reduce((acc, res) => acc + (res.seatsGo || 1), 0);

          return {
            ...trip,
            remainingSeats: (trip.places || MAX_SEATS) - reservedSeats
          };
        })
        .filter(trip => !isPastTime(trip.date, trip.time));

      setTrips(enrichedTrips);

      // Sélectionner la première date disponible
      const firstAvailableDate = enrichedTrips.length > 0 ? enrichedTrips[0].date : '';
      setSelectedDate(firstAvailableDate);

      if (firstAvailableDate) {
        const tripsForDate = enrichedTrips
          .filter(trip => trip.date === firstAvailableDate)
          .sort((a, b) => a.time.localeCompare(b.time));
        setFilteredTrips(tripsForDate);
      } else {
        setFilteredTrips([]);
      }

      setSelectedTrip(null);

    } catch (error) {
      console.error('Erreur lors de la recherche :', error);
      alert('Une erreur est survenue lors de la recherche des trajets');
    }
  }, [departure, arrival, user?.agencyId, isPastTime]);

  // Handle date selection
  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate(date);
    
    const tripsForDate = trips
      .filter(trip => trip.date === date && !isPastTime(trip.date, trip.time))
      .sort((a, b) => a.time.localeCompare(b.time));
    
    setFilteredTrips(tripsForDate);
    setSelectedTrip(null);
  }, [trips, isPastTime]);

  // Handle trip selection
  const handleSelectTrip = useCallback((trip: Trip) => {
    setSelectedTrip(trip);
    setPlaces(1);
    setPlacesRetour(0);
  }, []);

  // Handle reservation submission
  const handleReservation = useCallback(async () => {
  if (!selectedTrip || !nomClient || !telephone || places < 1) {
    alert('Veuillez remplir tous les champs obligatoires');
    return;
  }

  if (!user?.companyId) {
    alert('Votre compte n\'est pas associé à une compagnie valide');
    return;
  }

  const totalSeats = tripType === 'aller_retour' ? places + placesRetour : places;

  if (selectedTrip.remainingSeats !== undefined && totalSeats > selectedTrip.remainingSeats) {
    alert(`Désolé, il ne reste que ${selectedTrip.remainingSeats} places disponibles.`);
    return;
  }

  setIsProcessing(true);

  try {
    let companySlug = DEFAULT_COMPANY_SLUG;
    let companyName = 'Compagnie';

    // Charger compagnie
    const compagnieRef = doc(db, 'compagnies', user.companyId);
    const compagnieSnap = await getDoc(compagnieRef);

    if (compagnieSnap.exists()) {
      companySlug = compagnieSnap.data().slug || DEFAULT_COMPANY_SLUG;
      companyName = compagnieSnap.data().nom || 'Compagnie';
    }

    // ⚡️ Charger agence pour avoir le TEL
    let agencyName = '';
    let agencyTelephone = '';

    if (user.agencyId) {
      const agencyRef = doc(db, 'agences', user.agencyId);
      const agencySnap = await getDoc(agencyRef);
      if (agencySnap.exists()) {
        const agencyData = agencySnap.data();
        agencyName = agencyData.nomAgence || agencyData.nom || '';
        agencyTelephone = agencyData.telephone || '';
      }
    }

    const reservationData = {
      trajetId: selectedTrip.id,
      nomClient,
      telephone,
      seatsGo: places,
      seatsReturn: tripType === 'aller_retour' ? placesRetour : 0,
      date: selectedTrip.date,
      heure: selectedTrip.time,
      depart: selectedTrip.departure,
      arrivee: selectedTrip.arrival,
      montant: totalPrice,
      statut: 'payé',
      compagnieId: user.companyId,
      compagnieNom: companyName,
      agencyId: user.agencyId || null,
      agencyNom: agencyName,
      agencyTelephone: agencyTelephone,
      createdAt: Timestamp.now(),
      canal: 'guichet',
      tripType,
      paiement,
      companySlug: companySlug
    };

    const docRef = await addDoc(collection(db, 'reservations'), reservationData);
    navigate(`/agence/receipt/${docRef.id}`);

  } catch (error) {
    console.error('Erreur création réservation:', error);
    alert('Erreur lors de la réservation');
  } finally {
    setIsProcessing(false);
  }
}, [selectedTrip, nomClient, telephone, user, places, placesRetour, tripType, totalPrice, paiement, navigate]);

  // Get unique available dates from trips
  const availableTripDates = Array.from(new Set(trips.map(trip => trip.date)));

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gradient-to-br from-indigo-50 to-blue-50 min-h-screen">
      {/* Left column - Search and results */}
      <div className="lg:col-span-2 space-y-6">
        <header className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 rounded-xl shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-800 bg-clip-text bg-gradient-to-r from-indigo-600 to-blue-500">Guichet de vente</h1>
              <p className="text-gray-600">Recherchez et réservez des billets en quelques clics</p>
            </div>
          </div>
        </header>

        {/* Search form */}
        <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Rechercher un trajet
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="departure" className="block text-sm font-medium text-gray-700 mb-2">Départ</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <input 
                  id="departure"
                  list="depList" 
                  value={departure} 
                  onChange={(e) => setDeparture(e.target.value)} 
                  placeholder="Ville de départ" 
                  className="w-full pl-10 border-2 border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                />
                <datalist id="depList">
                  {allDepartures.map(city => (
                    <option key={`dep-${city}`} value={city} />
                  ))}
                </datalist>
              </div>
            </div>
            
            <div>
              <label htmlFor="arrival" className="block text-sm font-medium text-gray-700 mb-2">Arrivée</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <input 
                  id="arrival"
                  list="arrList" 
                  value={arrival} 
                  onChange={(e) => setArrival(e.target.value)} 
                  placeholder="Ville d'arrivée" 
                  className="w-full pl-10 border-2 border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200"
                />
                <datalist id="arrList">
                  {allArrivals.map(city => (
                    <option key={`arr-${city}`} value={city} />
                  ))}
                </datalist>
              </div>
            </div>
            
            <div className="flex items-end">
              <button 
                onClick={handleSearch} 
                className="w-full bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white font-medium px-4 py-3 rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Rechercher
              </button>
            </div>
          </div>
        </section>

        {/* Date selection */}
        {trips.length > 0 && (
          <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Dates disponibles
            </h2>
            <div className="flex flex-wrap gap-3">
              {availableDates.map(date => {
                const isAvailable = availableTripDates.includes(date);
                const isSelected = selectedDate === date;
                const dateObj = new Date(date);
                const dayName = dateObj.toLocaleDateString('fr-FR', { weekday: 'short' });
                const dayNumber = dateObj.getDate();
                
                return (
                  <button
                    key={date}
                    onClick={() => isAvailable && handleSelectDate(date)}
                    className={`flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 transition-all duration-200 ${
                      isSelected 
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' 
                        : isAvailable 
                          ? 'bg-white text-indigo-600 border-indigo-200 hover:bg-indigo-50 hover:border-indigo-300' 
                          : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                    }`}
                    disabled={!isAvailable}
                    title={isAvailable ? `Voir les trajets pour le ${date}` : 'Date non disponible'}
                  >
                    <span className="text-xs font-medium">{dayName}</span>
                    <span className="text-lg font-bold">{dayNumber}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Available trips */}
        <section className="bg-white p-6 rounded-2xl shadow-lg border border-gray-100">
          <h2 className="text-xl font-semibold mb-4 text-gray-800 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Horaires disponibles
          </h2>
          
          {filteredTrips.length === 0 ? (
            <div className="text-center py-8">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500 mt-3">
                {trips.length === 0 
                  ? 'Aucun trajet trouvé. Veuillez effectuer une recherche.'
                  : 'Aucun horaire disponible pour cette date.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTrips.map(trip => (
                <div 
                  key={trip.id} 
                  onClick={() => handleSelectTrip(trip)} 
                  className={`p-4 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                    selectedTrip?.id === trip.id 
                      ? 'border-indigo-500 bg-indigo-50 shadow-md' 
                      : 'border-gray-200 hover:border-indigo-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-4">
                      <div className="bg-indigo-100 p-3 rounded-lg">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-bold text-gray-800">
                          <span className="text-xl">{trip.time}</span> — {trip.departure} → {trip.arrival}
                        </p>
                        <p className="text-sm text-gray-600">
                          {new Date(trip.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-indigo-600 text-lg">{trip.price.toLocaleString('fr-FR')} FCFA</p>
                      <div className="flex items-center justify-end gap-1">
                        <span className={`inline-block w-2 h-2 rounded-full ${
                          (trip.remainingSeats || 0) > 10 ? 'bg-green-500' : 
                          (trip.remainingSeats || 0) > 5 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}></span>
                        <span className="text-xs text-gray-500">
                          {trip.remainingSeats ?? 'NC'} places
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Right column - Reservation form */}
      <div className="bg-white p-6 rounded-2xl shadow-xl border border-gray-100 space-y-6 sticky top-6 h-fit">
        <h2 className="text-2xl font-bold text-gray-800 bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">
          Détails de la réservation
        </h2>

        {selectedTrip ? (
          <div className="bg-indigo-50 rounded-xl p-4 border-2 border-indigo-100 space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-indigo-800">{selectedTrip.departure} → {selectedTrip.arrival}</p>
                <p className="text-sm text-indigo-600">
                  {new Date(selectedTrip.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <div className="bg-white rounded-lg px-2 py-1 shadow-sm">
                <p className="font-medium text-indigo-600">{selectedTrip.time}</p>
              </div>
            </div>
            <div className="flex justify-between items-center pt-2 border-t border-indigo-100">
              <p className="text-sm text-indigo-700">
                <span className="font-medium">Prix unitaire:</span> {selectedTrip.price.toLocaleString('fr-FR')} FCFA
              </p>
              {selectedTrip.remainingSeats !== undefined && (
                <div className="flex items-center gap-1">
                  <span className={`inline-block w-2 h-2 rounded-full ${
                    selectedTrip.remainingSeats > 10 ? 'bg-green-500' : 
                    selectedTrip.remainingSeats > 5 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}></span>
                  <span className="text-xs font-medium text-indigo-700">
                    {selectedTrip.remainingSeats} restantes
                  </span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-6 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-500">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            <p className="mt-2">Sélectionnez un trajet pour continuer</p>
          </div>
        )}

        {/* Trip type selector */}
        <div className="bg-gray-50 p-1 rounded-xl inline-flex w-full">
          <button 
            onClick={() => setTripType('aller_simple')} 
            className={`flex-1 py-2 px-3 rounded-lg transition-all duration-200 ${
              tripType === 'aller_simple' 
                ? 'bg-white shadow-sm border border-gray-200 text-indigo-600 font-medium' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Aller simple
          </button>
          <button 
            onClick={() => setTripType('aller_retour')} 
            className={`flex-1 py-2 px-3 rounded-lg transition-all duration-200 ${
              tripType === 'aller_retour' 
                ? 'bg-white shadow-sm border border-gray-200 text-indigo-600 font-medium' 
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Aller-retour
          </button>
        </div>

        {/* Passenger details */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Nom complet du passager*</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input 
                type="text" 
                value={nomClient} 
                onChange={(e) => setNomClient(e.target.value)} 
                className="w-full pl-10 border-2 border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200" 
                required 
                placeholder="Jean Dupont"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Numéro de téléphone*</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </div>
              <input 
                type="tel" 
                value={telephone} 
                onChange={(e) => setTelephone(e.target.value)} 
                className="w-full pl-10 border-2 border-gray-200 px-4 py-3 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-200" 
                required 
                placeholder="+225 XX XX XX XX"
              />
            </div>
          </div>
        </div>

        {/* Seats selection */}
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Nombre de places (Aller)*</label>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setPlaces(p => Math.max(1, p - 1))} 
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedTrip || places <= 1}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>
              <span className="flex-1 text-center py-2 bg-indigo-50 text-indigo-600 font-bold rounded-lg">{places}</span>
              <button 
                onClick={() => setPlaces(p => p + 1)} 
                className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!selectedTrip || (selectedTrip.remainingSeats !== undefined && places >= selectedTrip.remainingSeats)}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>
          </div>

          {tripType === 'aller_retour' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">Nombre de places (Retour)</label>
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setPlacesRetour(p => Math.max(0, p - 1))} 
                  className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedTrip || placesRetour <= 0}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                  </svg>
                </button>
                <span className="flex-1 text-center py-2 bg-indigo-50 text-indigo-600 font-bold rounded-lg">{placesRetour}</span>
                <button 
                  onClick={() => setPlacesRetour(p => p + 1)} 
                  className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors duration-200 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={!selectedTrip || (selectedTrip.remainingSeats !== undefined && (places + placesRetour) >= selectedTrip.remainingSeats)}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Payment summary */}
        <div className="pt-4 border-t border-gray-200 space-y-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Mode de paiement</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setPaiement('espèces')}
                className={`py-2 px-3 rounded-lg border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                  paiement === 'espèces'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                    : 'border-gray-200 hover:border-indigo-300 text-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Espèces
              </button>
              <button
                onClick={() => setPaiement('mobile_money')}
                className={`py-2 px-3 rounded-lg border-2 transition-all duration-200 flex items-center justify-center gap-2 ${
                  paiement === 'mobile_money'
                    ? 'border-indigo-500 bg-indigo-50 text-indigo-600'
                    : 'border-gray-200 hover:border-indigo-300 text-gray-700'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Mobile Money
              </button>
            </div>
          </div>

          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 p-4 rounded-xl">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Total à payer</span>
              <span className="text-2xl font-bold text-indigo-600">
                {totalPrice.toLocaleString('fr-FR')} FCFA
              </span>
            </div>
          </div>
        </div>

        {/* Submit button */}
        <button 
          onClick={handleReservation} 
          disabled={!selectedTrip || !nomClient || !telephone || places < 1 || isProcessing}
          className={`w-full py-4 px-6 rounded-xl font-bold transition-all duration-300 flex items-center justify-center gap-2 shadow-lg ${
            !selectedTrip || !nomClient || !telephone || places < 1
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 to-blue-500 hover:from-indigo-700 hover:to-blue-600 text-white transform hover:-translate-y-1'
          }`}
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Traitement en cours...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Valider la réservation
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AgenceGuichetPage;