import React, { useEffect, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { Company } from '@/types/companyTypes';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { Clock, MapPin, Ticket, Users, ChevronLeft, Calendar } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  horaires: { [key: string]: string[] };
  price: number;
  places?: number;
  active: boolean;
}

interface Reservation {
  trajetId: string;
  statut: string;
  seatsGo: number;
}

interface Trip {
  id: string;
  date: string;
  time: string;
  departure: string;
  arrival: string;
  price: number;
  places: number;
  remainingSeats: number;
  agencyId: string;
}

interface Props {
  company: Company;
}

const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

const hexToRgba = (hex: string, alpha: number = 1): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getContrastColor = (hexColor: string): string => {
  if (!hexColor || hexColor.length < 7) return '#000000';
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

const ResultatsAgencePage: React.FC<Props> = ({ company }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const searchParams = new URLSearchParams(location.search);
  const departure = searchParams.get('departure') || '';
  const arrival = searchParams.get('arrival') || '';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const themeConfig = useMemo(() => {
    const primary = company.couleurPrimaire || '#3b82f6';
    const secondary = company.couleurSecondaire || '#93c5fd';
    
    return {
      colors: {
        primary,
        secondary,
        text: getContrastColor(primary),
        textOnPrimary: getContrastColor(primary),
        background: '#ffffff'
      },
      classes: {
        card: 'bg-white rounded-xl shadow-sm border border-gray-200',
        button: 'transition-all hover:scale-105 active:scale-95',
        animations: 'transition-all duration-300 ease-in-out',
        header: 'sticky top-0 z-50 px-4 py-3'
      }
    };
  }, [company]);

  const { colors, classes } = themeConfig;

  const allDates = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  }, []);

  const filteredTrips = useMemo(() => {
    return trips.filter(t => t.date === selectedDate);
  }, [trips, selectedDate]);

  useEffect(() => {
    const fetchTrajets = async () => {
      if (!company.id || !departure || !arrival) return;

      setLoading(true);
      try {
        const agencesSnap = await getDocs(collection(db, 'companies', company.id, 'agences'));
        const agences = agencesSnap.docs.map(doc => ({ id: doc.id }));

        const allGenerated: Trip[] = [];

        for (const agence of agences) {
          const trajetsSnap = await getDocs(query(
            collection(db, 'companies', company.id, 'agences', agence.id, 'weeklyTrips'),
            where('active', '==', true)
          ));
          const weeklyTrips = trajetsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<WeeklyTrip, 'id'>) }));

          const reservationsSnap = await getDocs(collection(db, 'companies', company.id, 'agences', agence.id, 'reservations'));
          const reservations = reservationsSnap.docs.map(doc => doc.data() as Reservation);

          for (const dateStr of allDates) {
            const d = new Date(dateStr);
            const dayName = DAYS[d.getDay()];

            for (const trip of weeklyTrips) {
              if (
                trip.departure.toLowerCase() !== departure.toLowerCase() ||
                trip.arrival.toLowerCase() !== arrival.toLowerCase()
              ) continue;

              const horaires = trip.horaires?.[dayName] || [];
              for (const heure of horaires) {
                const trajetId = `${trip.id}_${dateStr}_${heure}`;
                const reserved = reservations.filter(r => r.trajetId === trajetId && r.statut === 'payé');
                const remainingSeats = (trip.places || 30) - reserved.reduce((acc, r) => acc + r.seatsGo, 0);
                
                if (remainingSeats > 0) {
                  allGenerated.push({
                    id: trajetId,
                    date: dateStr,
                    time: heure,
                    departure: trip.departure,
                    arrival: trip.arrival,
                    price: trip.price,
                    places: trip.places || 30,
                    remainingSeats,
                    agencyId: agence.id
                  });
                }
              }
            }
          }
        }

        setTrips(allGenerated);
        const dates = [...new Set(allGenerated.map(t => t.date))];
        setSelectedDate(dates[0] || '');
      } catch (err) {
        console.error('Erreur Firestore:', err);
        setError('Erreur lors du chargement des trajets');
      } finally {
        setLoading(false);
      }
    };

    fetchTrajets();
  }, [company.id, allDates, departure, arrival]);

  useEffect(() => {
    if (filteredTrips.length > 0) {
      const sorted = [...filteredTrips].sort((a, b) => a.time.localeCompare(b.time));
      setSelectedTime(sorted[0]?.time || '');
    }
  }, [selectedDate, filteredTrips]);

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
  };

  const handleSelectTime = (time: string) => {
    setSelectedTime(time);
  };

  const handleBooking = () => {
    const selectedTrip = filteredTrips.find(t => t.time === selectedTime);
    if (!selectedTrip) return;

    navigate(`/${company.slug}/booking`, {
      state: {
        tripData: {
          ...selectedTrip,
          companyId: company.id,
          agencyId: selectedTrip.agencyId,
          compagnieNom: company.nom,
          logoUrl: company.logoUrl
        },
        companyInfo: {
          id: company.id,
          slug: company.slug,
          nom: company.nom,
          logoUrl: company.logoUrl,
          primaryColor: colors.primary
        }
      }
    });
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  const isPastTime = (date: string, time: string) => {
    const dt = new Date(`${date}T${time}`);
    return dt.getTime() < new Date().getTime();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ background: colors.background }}>
        <div
          className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2"
          style={{ borderColor: colors.primary }}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-4 text-center"
        style={{ background: colors.background }}
      >
        <div className={`p-4 rounded-lg max-w-md ${classes.card}`}>
          <h2 className="text-xl font-bold mb-2 text-gray-900">Erreur</h2>
          <p className="text-gray-700">{error}</p>
          <button
            onClick={() => navigate(`/${company.slug}`)}
            className={`mt-4 px-4 py-2 rounded ${classes.button}`}
            style={{ backgroundColor: colors.primary, color: colors.textOnPrimary }}
          >
            Retour à la compagnie
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen" 
      style={{ 
        background: colors.background,
        color: colors.text
      }}
    >
      <header 
        className={classes.header}
        style={{
          backgroundColor: hexToRgba(colors.primary, 0.95),
          color: colors.textOnPrimary,
          backdropFilter: 'blur(10px)'
        }}
      >
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <button 
            onClick={() => navigate(`/${company.slug}`)}
            className="p-2 rounded-full hover:bg-white/10 transition"
            style={{ color: colors.textOnPrimary }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2">
            {company.logoUrl && (
              <LazyLoadImage 
                src={company.logoUrl} 
                alt={`Logo ${company.nom}`}
                effect="blur"
                className="h-8 w-8 rounded-full object-cover border-2"
                style={{ 
                  borderColor: colors.textOnPrimary,
                  backgroundColor: hexToRgba(colors.primary, 0.2)
                }}
              />
            )}
            <div>
              <h1 className="text-lg font-bold">Résultats de recherche</h1>
              <p className="text-xs opacity-80">{departure} → {arrival}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24">
        <div className={`p-4 rounded-xl mb-6 ${classes.card}`}>
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>{departure} → {arrival}</span>
          </h2>

          <div className="mb-4">
            <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-800">
              <Calendar className="h-5 w-5" style={{ color: colors.primary }} />
              Choisissez votre date de départ
            </h3>
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
              {allDates.map(date => (
                <button
                  key={date}
                  onClick={() => handleSelectDate(date)}
                  className={`flex flex-col items-center min-w-[90px] p-3 rounded-xl border transition-all flex-shrink-0 ${
                    selectedDate === date
                      ? 'shadow-md'
                      : 'bg-white hover:bg-gray-50 border-gray-200 text-gray-800'
                  }`}
                  style={{
                    backgroundColor: selectedDate === date ? colors.primary : undefined,
                    borderColor: selectedDate === date ? colors.primary : undefined,
                    color: selectedDate === date ? colors.textOnPrimary : undefined
                  }}
                >
                  <span className="text-xs font-medium">
                    {formatDateDisplay(date)}
                  </span>
                  <span className="text-sm mt-1">
                    {new Date(date).toLocaleDateString('fr-FR', { day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {filteredTrips.length === 0 ? (
            <div className={`p-6 rounded-xl text-center ${classes.card} text-gray-800`}>
              <div className="bg-gray-100 p-4 rounded-full inline-flex mb-3">
                <Clock className="h-6 w-6 text-gray-500" />
              </div>
              <h3 className="text-lg font-medium mb-1">
                Aucun trajet disponible pour cette date
              </h3>
              <p className="text-sm opacity-80">Veuillez choisir une autre date</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`rounded-xl overflow-hidden ${classes.card}`}>
                <div className="p-4 border-b" style={{ borderColor: hexToRgba(colors.primary, 0.1) }}>
                  <h3 className="font-semibold flex items-center gap-2 mb-3 text-gray-800">
                    <Clock className="h-5 w-5" style={{ color: colors.primary }} />
                    Choisissez votre heure de départ
                  </h3>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {filteredTrips
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map(trip => (
                        <button
                          key={trip.id}
                          onClick={() => handleSelectTime(trip.time)}
                          disabled={isPastTime(trip.date, trip.time)}
                          className={`p-3 rounded-lg border flex flex-col items-center transition ${
                            selectedTime === trip.time
                              ? 'bg-blue-50 text-blue-600'
                              : isPastTime(trip.date, trip.time)
                              ? 'bg-gray-50 text-gray-400'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-800'
                          }`}
                          style={{
                            borderColor: selectedTime === trip.time ? colors.primary : undefined,
                            backgroundColor: selectedTime === trip.time ? hexToRgba(colors.primary, 0.1) : undefined
                          }}
                        >
                          <span className="font-medium">{trip.time}</span>
                          <span className="text-xs mt-1">
                            {trip.remainingSeats} places
                          </span>
                        </button>
                      ))}
                  </div>
                </div>

                {filteredTrips
                  .filter(trip => trip.time === selectedTime && !isPastTime(trip.date, trip.time))
                  .map(trip => (
                    <div key={trip.id} className="p-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 text-gray-800">
                        <div className="flex items-center gap-3">
                          <div 
                            className="p-2 rounded-full" 
                            style={{ 
                              backgroundColor: hexToRgba(colors.primary, 0.1),
                              color: colors.primary 
                            }}
                          >
                            <Ticket className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium opacity-80">Prix</h3>
                            <p className="text-lg font-bold text-gray-900">
                              {money(trip.price)}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <div 
                            className="p-2 rounded-full" 
                            style={{ 
                              backgroundColor: hexToRgba(colors.primary, 0.1),
                              color: colors.primary 
                            }}
                          >
                            <Users className="h-5 w-5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-medium opacity-90">Places disponibles</h3>
                            <p
                              className={`text-lg font-bold ${
                                trip.remainingSeats === 0 ? 'text-red-600' :
                                trip.remainingSeats <= 10 ? 'text-yellow-600' : 'text-green-600'
                              }`}
                            >
                              {trip.remainingSeats}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>

        {selectedTime && (
          <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg p-4 border-t border-gray-200">
            <div className="max-w-xl mx-auto flex justify-between items-center">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-xl font-bold text-gray-900">
                  {money(filteredTrips.find(t => t.time === selectedTime)?.price ?? 0)}
                </p>
              </div>
              
              <button
                onClick={handleBooking}
                disabled={!selectedTime}
                className={`px-6 py-3 rounded-lg font-bold ${classes.button} ${
                  !selectedTime ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary
                }}
              >
                Réserver maintenant
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ResultatsAgencePage;