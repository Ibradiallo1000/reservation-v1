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
    if (user && !user.companyId) {
      console.error('Aucune compagnie associée à cet utilisateur');
      alert('Votre compte n\'est associé à aucune compagnie. Contactez l\'administrateur.');
    }
  }, [user]);

  // Load all available cities
  useEffect(() => {
    const loadCities = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'dailyTrips'));
        const allTrips = snapshot.docs.map(doc => doc.data());
        
        const uniqueDepartures = Array.from(new Set(allTrips.map((t: any) => t.departure)));
        const uniqueArrivals = Array.from(new Set(allTrips.map((t: any) => t.arrival)));
        
        setAllDepartures(uniqueDepartures);
        setAllArrivals(uniqueArrivals);
      } catch (error) {
        console.error('Error loading cities:', error);
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

  // Handle search for trips
  const handleSearch = useCallback(async () => {
    if (!departure || !arrival) {
      alert('Veuillez sélectionner une ville de départ et une ville d\'arrivée');
      return;
    }

    try {
      const depLower = departure.trim().toLowerCase();
      const arrLower = arrival.trim().toLowerCase();

      // Get all trips matching the departure and arrival
      const snapshot = await getDocs(collection(db, 'dailyTrips'));
      const allTrips: Trip[] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Trip[];
      
      const matchingTrips = allTrips.filter(trip => 
        trip.departure?.toLowerCase() === depLower &&
        trip.arrival?.toLowerCase() === arrLower
      );

      // Get reservations to calculate remaining seats
      const reservationsSnap = await getDocs(collection(db, 'reservations'));
      const reservations = reservationsSnap.docs.map(doc => doc.data());

      // Process trips: filter valid dates, calculate remaining seats, exclude past times
      const processedTrips = matchingTrips
        .filter(trip => trip.date && availableDates.includes(trip.date))
        .map(trip => {
          const reservedSeats = reservations
            .filter((res: any) => res.trajetId === trip.id && res.statut === 'payé')
            .reduce((acc, res: any) => acc + (res.seatsGo || 1), 0);
          
          return {
            ...trip,
            remainingSeats: (trip.places || MAX_SEATS) - reservedSeats
          };
        })
        .filter(trip => !isPastTime(trip.date, trip.time))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setTrips(processedTrips);
      
      // Set default selected date to the first available date
      const firstAvailableDate = processedTrips.length > 0 ? processedTrips[0].date : '';
      setSelectedDate(firstAvailableDate);
      
      // Filter trips for the selected date
      if (firstAvailableDate) {
        const tripsForDate = processedTrips
          .filter(trip => trip.date === firstAvailableDate)
          .sort((a, b) => a.time.localeCompare(b.time));
        setFilteredTrips(tripsForDate);
      } else {
        setFilteredTrips([]);
      }
      
      setSelectedTrip(null);
    } catch (error) {
      console.error('Error searching trips:', error);
      alert('Une erreur est survenue lors de la recherche des trajets');
    }
  }, [departure, arrival, availableDates, isPastTime]);

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

      // Try to get company info if available
      const compagnieRef = doc(db, 'compagnies', user.companyId);
      const compagnieSnap = await getDoc(compagnieRef);
      
      if (compagnieSnap.exists()) {
        companySlug = compagnieSnap.data().slug || DEFAULT_COMPANY_SLUG;
        companyName = compagnieSnap.data().nom || 'Compagnie';
      } else {
        console.warn(`Compagnie ${user.companyId} non trouvée, utilisation des valeurs par défaut`);
      }

      // Create reservation document
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
      
      let errorMessage = 'Erreur lors de la réservation';
      if (error instanceof Error) {
        errorMessage += `: ${error.message}`;
      }
      
      alert(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedTrip, nomClient, telephone, user, places, placesRetour, tripType, totalPrice, paiement, navigate]);

  // Get unique available dates from trips
  const availableTripDates = Array.from(new Set(trips.map(trip => trip.date)));

  return (
    <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 bg-gray-50 min-h-screen">
      {/* Left column - Search and results */}
      <div className="lg:col-span-2 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-800">🎛 Guichet – Vente de billets</h1>
          <p className="text-gray-600">Recherchez et réservez des billets pour vos clients</p>
        </header>

        {/* Search form */}
        <section className="bg-white p-4 rounded-xl shadow">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">🔍 Rechercher un trajet</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="departure" className="block text-sm font-medium text-gray-700 mb-1">Départ</label>
              <input 
                id="departure"
                list="depList" 
                value={departure} 
                onChange={(e) => setDeparture(e.target.value)} 
                placeholder="Ville de départ" 
                className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
              />
              <datalist id="depList">
                {allDepartures.map(city => (
                  <option key={`dep-${city}`} value={city} />
                ))}
              </datalist>
            </div>
            
            <div>
              <label htmlFor="arrival" className="block text-sm font-medium text-gray-700 mb-1">Arrivée</label>
              <input 
                id="arrival"
                list="arrList" 
                value={arrival} 
                onChange={(e) => setArrival(e.target.value)} 
                placeholder="Ville d'arrivée" 
                className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500"
              />
              <datalist id="arrList">
                {allArrivals.map(city => (
                  <option key={`arr-${city}`} value={city} />
                ))}
              </datalist>
            </div>
            
            <div className="flex items-end">
              <button 
                onClick={handleSearch} 
                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-medium px-4 py-2 rounded transition-colors duration-200"
              >
                Rechercher
              </button>
            </div>
          </div>
        </section>

        {/* Date selection */}
        {trips.length > 0 && (
          <section className="bg-white p-4 rounded-xl shadow">
            <h2 className="text-xl font-semibold mb-3 text-gray-800">📅 Dates disponibles</h2>
            <div className="flex flex-wrap gap-2">
              {availableDates.map(date => {
                const isAvailable = availableTripDates.includes(date);
                const isSelected = selectedDate === date;
                
                return (
                  <button
                    key={date}
                    onClick={() => isAvailable && handleSelectDate(date)}
                    className={`px-3 py-1 rounded-full text-sm border shadow-sm transition-colors duration-200 ${
                      isSelected 
                        ? 'bg-yellow-600 text-white border-yellow-700' 
                        : isAvailable 
                          ? 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200' 
                          : 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed'
                    }`}
                    disabled={!isAvailable}
                    title={isAvailable ? `Voir les trajets pour le ${date}` : 'Date non disponible'}
                  >
                    {new Date(date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* Available trips */}
        <section className="bg-white p-4 rounded-xl shadow">
          <h2 className="text-xl font-semibold mb-3 text-gray-800">🕒 Horaires disponibles</h2>
          
          {filteredTrips.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {trips.length === 0 
                  ? 'Aucun trajet trouvé. Veuillez effectuer une recherche.'
                  : 'Aucun horaire disponible pour cette date.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {filteredTrips.map(trip => (
                <li 
                  key={trip.id} 
                  onClick={() => handleSelectTrip(trip)} 
                  className={`py-3 px-2 cursor-pointer transition-colors duration-200 ${
                    selectedTrip?.id === trip.id 
                      ? 'bg-yellow-100 border-l-4 border-yellow-500' 
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-bold">
                        <span className="text-lg">{trip.time}</span> — {trip.departure} → {trip.arrival}
                      </p>
                      <p className="text-sm text-gray-600">
                        {new Date(trip.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-yellow-700">{trip.price.toLocaleString('fr-FR')} FCFA</p>
                      <p className="text-xs text-gray-500">
                        {trip.remainingSeats ?? 'NC'} places restantes
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Right column - Reservation form */}
      <div className="bg-white p-6 rounded-xl shadow space-y-4 sticky top-6 h-fit">
        <h2 className="text-xl font-semibold text-gray-800">🧍‍♂️ Détails du passager</h2>

        {selectedTrip ? (
          <div className="text-sm text-gray-700 bg-yellow-50 rounded-lg border-l-4 border-yellow-500 p-3 space-y-1">
            <p className="font-medium">{selectedTrip.departure} → {selectedTrip.arrival}</p>
            <p>
              <span className="font-medium">Date:</span> {new Date(selectedTrip.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </p>
            <p>
              <span className="font-medium">Heure:</span> {selectedTrip.time}
            </p>
            <p>
              <span className="font-medium">Prix unitaire:</span> {selectedTrip.price.toLocaleString('fr-FR')} FCFA
            </p>
            {selectedTrip.remainingSeats !== undefined && (
              <p>
                <span className="font-medium">Places restantes:</span> {selectedTrip.remainingSeats}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-4 bg-gray-50 rounded-lg text-gray-500">
            Sélectionnez un trajet pour continuer
          </div>
        )}

        {/* Trip type selector */}
        <div className="flex gap-2">
          <button 
            onClick={() => setTripType('aller_simple')} 
            className={`flex-1 py-2 rounded transition-colors duration-200 ${
              tripType === 'aller_simple' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Aller simple
          </button>
          <button 
            onClick={() => setTripType('aller_retour')} 
            className={`flex-1 py-2 rounded transition-colors duration-200 ${
              tripType === 'aller_retour' 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Aller-retour
          </button>
        </div>

        {/* Passenger details */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Nom complet du passager*</label>
          <input 
            type="text" 
            value={nomClient} 
            onChange={(e) => setNomClient(e.target.value)} 
            className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            required 
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Numéro de téléphone*</label>
          <input 
            type="tel" 
            value={telephone} 
            onChange={(e) => setTelephone(e.target.value)} 
            className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
            required 
          />
        </div>

        {/* Seats selection */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Nombre de places (Aller)*</label>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setPlaces(p => Math.max(1, p - 1))} 
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200"
              disabled={!selectedTrip}
            >
              -
            </button>
            <span className="w-8 text-center">{places}</span>
            <button 
              onClick={() => setPlaces(p => p + 1)} 
              className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200"
              disabled={!selectedTrip || (selectedTrip.remainingSeats !== undefined && places >= selectedTrip.remainingSeats)}
            >
              +
            </button>
          </div>
        </div>

        {tripType === 'aller_retour' && (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Nombre de places (Retour)</label>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setPlacesRetour(p => Math.max(0, p - 1))} 
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200"
                disabled={!selectedTrip}
              >
                -
              </button>
              <span className="w-8 text-center">{placesRetour}</span>
              <button 
                onClick={() => setPlacesRetour(p => p + 1)} 
                className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300 transition-colors duration-200"
                disabled={!selectedTrip || (selectedTrip.remainingSeats !== undefined && (places + placesRetour) >= selectedTrip.remainingSeats)}
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Payment summary */}
        <div className="pt-2 border-t border-gray-200 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-gray-700">Total à payer</span>
            <span className="text-xl font-bold text-green-600">
              {totalPrice.toLocaleString('fr-FR')} FCFA
            </span>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Mode de paiement</label>
            <select 
              value={paiement} 
              onChange={(e) => setPaiement(e.target.value as PaymentMethod)} 
              className="w-full border px-3 py-2 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="espèces">Espèces</option>
              <option value="mobile_money">Mobile Money</option>
            </select>
          </div>
        </div>

        {/* Submit button */}
        <button 
          onClick={handleReservation} 
          disabled={!selectedTrip || !nomClient || !telephone || places < 1 || isProcessing}
          className={`w-full py-3 px-4 rounded font-semibold transition-colors duration-200 flex items-center justify-center ${
            !selectedTrip || !nomClient || !telephone || places < 1
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 text-white'
          }`}
        >
          {isProcessing ? (
            <>
              <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Traitement...
            </>
          ) : (
            '✅ Valider la réservation'
          )}
        </button>
      </div>
    </div>
  );
};

export default AgenceGuichetPage;