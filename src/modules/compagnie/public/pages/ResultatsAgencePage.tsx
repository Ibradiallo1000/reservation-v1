import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { Company } from '@/types/companyTypes';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useTranslation } from 'react-i18next';
import { SectionCard } from '@/ui';
import { Clock, MapPin, Ticket, Users, ChevronLeft, Calendar } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { PageLoadingState } from '@/shared/ui/PageStates';
import {
  listTripInstancesByRouteAndDate,
  getOrCreateTripInstanceForSlot,
} from '@/modules/compagnie/tripInstances/tripInstanceService';

interface WeeklyTrip {
  id: string;
  departure: string;
  arrival: string;
  horaires: { [key: string]: string[] };
  price: number;
  places?: number;
  active: boolean;
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

const getDateLocale = (language: string) => (language === 'en' ? 'en-US' : 'fr-FR');

const ResultatsAgencePage: React.FC<Props> = ({ company }) => {
  const { t, i18n } = useTranslation();
  const language = (i18n.language || 'fr').toLowerCase().startsWith('en') ? 'en' : 'fr';
  const locale = getDateLocale(language);
  const location = useLocation();
  const navigate = useNavigate();
  const money = useFormatCurrency();
  const searchParams = new URLSearchParams(location.search);
  const departure = searchParams.get('departure') || '';
  const arrival = searchParams.get('arrival') || '';

  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [selectedTime, setSelectedTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const isOnline = useOnlineStatus();

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

  const filteredTrips = useMemo(() => trips, [trips]);

  const fetchTripsForDate = useCallback(async (dateStr: string) => {
    if (!company.id || !departure?.trim() || !arrival?.trim()) return;
    setLoading(true);
    setError(null);
    const depNorm = departure.trim();
    const arrNorm = arrival.trim();
    try {
      let instances = await listTripInstancesByRouteAndDate(company.id, depNorm, arrNorm, dateStr);
      if (instances.length === 0) {
        const agencesSnap = await getDocs(collection(db, 'companies', company.id, 'agences'));
        const agences = agencesSnap.docs.map(d => ({ id: d.id }));
        const d = new Date(dateStr);
        const dayName = DAYS[d.getDay()];
        for (const agence of agences) {
          const trajetsSnap = await getDocs(query(
            collection(db, 'companies', company.id, 'agences', agence.id, 'weeklyTrips'),
            where('active', '==', true)
          ));
          const weeklyTrips = trajetsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as Omit<WeeklyTrip, 'id'>) }));
          for (const trip of weeklyTrips) {
            const tripData = trip as any;
            const tripDep = (tripData.departureCity ?? tripData.departure ?? '').trim();
            const tripArr = (tripData.arrivalCity ?? tripData.arrival ?? '').trim();
            if (tripDep.toLowerCase() !== depNorm.toLowerCase() || tripArr.toLowerCase() !== arrNorm.toLowerCase()) continue;
            const horaires = trip.horaires?.[dayName] || [];
            for (const heure of horaires) {
              await getOrCreateTripInstanceForSlot(company.id, {
                agencyId: agence.id,
                departureCity: depNorm,
                arrivalCity: arrNorm,
                date: dateStr,
                departureTime: heure,
                seatCapacity: (trip as any).seats ?? trip.places ?? 30,
                price: trip.price ?? null,
                weeklyTripId: trip.id,
                routeId: (trip as any).routeId ?? null,
              });
            }
          }
        }
        instances = await listTripInstancesByRouteAndDate(company.id, depNorm, arrNorm, dateStr);
      }
      const list: Trip[] = instances
        .filter(ti => ti.status !== 'CANCELLED' && (ti.seatCapacity - ti.reservedSeats) > 0)
        .map(ti => ({
          id: ti.id,
          date: ti.date,
          time: ti.departureTime,
          departure: ti.departureCity,
          arrival: ti.arrivalCity,
          price: (ti as any).price ?? 0,
          places: ti.seatCapacity,
          remainingSeats: ti.seatCapacity - ti.reservedSeats,
          agencyId: ti.agencyId,
        }));
      setTrips(list);
    } catch (err) {
      console.error('Erreur Firestore:', err);
      setError('Erreur lors du chargement des trajets');
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [company.id, departure, arrival]);

  useEffect(() => {
    if (!selectedDate || !company.id || !departure || !arrival) {
      setLoading(false);
      if (company.id && departure && arrival && !selectedDate) setTrips([]);
      return;
    }
    fetchTripsForDate(selectedDate);
  }, [company.id, departure, arrival, selectedDate, reloadKey, fetchTripsForDate]);

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
    return date.toLocaleDateString(locale, {
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
      <div className="min-h-screen p-4 sm:p-6" style={{ background: colors.background }}>
        <div className="max-w-4xl mx-auto">
          <PageLoadingState blocks={3} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="flex flex-col items-center justify-center min-h-screen p-4 text-center"
        style={{ background: colors.background }}
      >
        <SectionCard title="Erreur" icon={Clock} className="max-w-md shadow-md">
          <p className="text-gray-700">{error}</p>
          {!isOnline && (
            <p className="text-sm text-amber-700 mt-2">
              Vous semblez hors ligne. Vérifiez votre connexion puis réessayez.
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2">
            <button
              onClick={() => navigate(`/${company.slug}`)}
              className={`w-full px-4 py-3 rounded-lg font-medium ${classes.button}`}
              style={{ backgroundColor: colors.primary, color: colors.textOnPrimary }}
            >
              Retour à la compagnie
            </button>
            <button
              onClick={() => setReloadKey((v) => v + 1)}
              className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-gray-700 border border-gray-300 hover:bg-gray-50"
            >
              Réessayer
            </button>
          </div>
        </SectionCard>
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
        <SectionCard title={`${departure} → ${arrival}`} icon={MapPin} className="mb-6 shadow-md">
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
                    {new Date(date).toLocaleDateString(locale, { day: 'numeric' })}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {filteredTrips.length === 0 ? (
            <SectionCard title="Aucun départ à cette date" icon={Clock} className="text-center text-gray-800 shadow-md">
              <p className="text-sm text-gray-600">Pas de départ {departure} → {arrival} le {selectedDate ? new Date(selectedDate).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' }) : ''}.</p>
              <p className="text-xs text-gray-500 mt-2">Choisissez une autre date ci-dessus (Aujourd&apos;hui, Demain, etc.) ou modifiez votre recherche.</p>
            </SectionCard>
          ) : (
            <div className="space-y-4">
              <SectionCard title="Choisissez votre heure de départ" icon={Clock} className="shadow-md overflow-hidden" noPad>
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
              </SectionCard>
            </div>
          )}
        </SectionCard>

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
                {t('reserveNow')}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ResultatsAgencePage;