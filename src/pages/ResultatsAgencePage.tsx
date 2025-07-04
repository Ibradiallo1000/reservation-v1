import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChevronLeft, Clock, MapPin, Calendar, Users, Ticket } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

interface CompanyInfo {
  id: string;
  nom: string;
  pays: string;
  slug: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  themeStyle?: string;
  logoUrl?: string;
  banniereUrl?: string;
}

interface Trajet {
  id: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
  price: number;
  places: number;
  remainingSeats?: number;
  companyId: string;
  agencyId: string;
  compagnieNom?: string;
  logoUrl?: string;
}

interface AgenceInfo {
  id: string;
  ville: string;
  quartier?: string;
  pays: string;
  telephone?: string;
  nomAgence?: string;
}

interface ThemeClasses {
  card: string;
  button: string;
  animations: string;
  header: string;
}

// Fonctions utilitaires pour la gestion des couleurs
const hexToRgba = (hex: string, alpha: number = 1): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const safeTextColor = (hexColor: string): string => {
  return getContrastColor(hexColor);
};

const getContrastColor = (hexColor: string, relativeTo = '#ffffff'): string => {
  if (!hexColor || hexColor.length < 7) return '#000000';
  
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  
  // Calcul de la luminance (formule WCAG)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  
  return luminance > 0.5 ? '#000000' : '#ffffff';
};

const ResultatsAgencePage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const [searchParams] = useSearchParams();

  const departureParam = searchParams.get('departure') || '';
  const arrivalParam = searchParams.get('arrival') || '';

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  const departure = capitalize(departureParam);
  const arrival = capitalize(arrivalParam);

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [agence, setAgence] = useState<AgenceInfo | null>(null);
  const [groupedTrajets, setGroupedTrajets] = useState<Record<string, Trajet[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');

  const themeConfig = useMemo(() => {
    const primary = company?.couleurPrimaire || '#3b82f6';
    const secondary = company?.couleurSecondaire || '#93c5fd';
    
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
      } as ThemeClasses
    };
  }, [company]);

  const { colors, classes } = themeConfig;

  const getNextNDates = (n: number): string[] => {
    const today = new Date();
    return Array.from({ length: n }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      return d.toISOString().split('T')[0];
    });
  };

  useEffect(() => {
    const fetchCompanyAndAgence = async () => {
      if (!slug) {
        setError('Compagnie non trouvée');
        setLoading(false);
        return;
      }

      try {
        const q = query(collection(db, 'companies'), where('slug', '==', slug));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          setError('Compagnie non trouvée');
          setLoading(false);
          return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();
        setCompany({ 
          id: doc.id, 
          nom: data.nom, 
          pays: data.pays, 
          slug: data.slug,
          couleurPrimaire: data.couleurPrimaire,
          couleurSecondaire: data.couleurSecondaire,
          themeStyle: data.themeStyle,
          logoUrl: data.logoUrl,
          banniereUrl: data.banniereUrl
        });

        const agenceQuery = query(collection(db, 'agences'), where('companyId', '==', doc.id));
        const agencesSnapshot = await getDocs(agenceQuery);
        
        if (!agencesSnapshot.empty) {
          const agenceDoc = agencesSnapshot.docs[0];
          const agenceData = agenceDoc.data();
          setAgence({
            id: agenceDoc.id,
            ville: agenceData.ville,
            quartier: agenceData.quartier,
            pays: agenceData.pays,
            telephone: agenceData.telephone,
            nomAgence: agenceData.nomAgence,
          });
        }
      } catch (err) {
        console.error('Erreur Firestore:', err);
        setError('Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyAndAgence();
  }, [slug]);

  useEffect(() => {
    const fetchTrajets = async () => {
      if (!departure || !arrival || !agence?.id) return;

      setLoading(true);

      try {
        const allDates = getNextNDates(8);
        const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

        const q = query(
          collection(db, 'weeklyTrips'),
          where('agencyId', '==', agence.id),
          where('departure', '==', departure),
          where('arrival', '==', arrival),
          where('active', '==', true)
        );

        const snapshot = await getDocs(q);
        const virtualTrajets: Trajet[] = [];

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const { departure, arrival, horaires, price, places = 30, agencyId, companyId } = data;

          for (const dateStr of allDates) {
            const d = new Date(dateStr);
            const dayName = DAYS[d.getDay()];
            const heures = horaires?.[dayName] || [];

            for (const heure of heures) {
              virtualTrajets.push({
                id: `${doc.id}-${dateStr}-${heure}`,
                departure,
                arrival,
                date: dateStr,
                time: heure,
                price,
                places,
                companyId,
                agencyId,
                compagnieNom: company?.nom,
                logoUrl: company?.logoUrl
              });
            }
          }
        }

        const reservationsSnap = await getDocs(collection(db, 'reservations'));
        const reservations = reservationsSnap.docs.map(doc => doc.data());

        const trajetsValides = virtualTrajets.map(trajet => {
          const reserved = reservations
            .filter(r => r.trajetId === trajet.id && r.statut === 'payé')
            .reduce((acc, r) => acc + (r.seatsGo || 1), 0);

          return {
            ...trajet,
            places: (trajet.places || 30) - reserved
          };
        });

        const trajetsParDate: Record<string, Trajet[]> = {};
        trajetsValides.forEach(trajet => {
          if (!trajetsParDate[trajet.date]) trajetsParDate[trajet.date] = [];
          trajetsParDate[trajet.date].push(trajet);
        });

        const now = new Date();
        const availableDates = allDates.filter(date => {
          const trajets = trajetsParDate[date];
          if (!trajets) return false;
          return trajets.some(t => new Date(`${t.date}T${t.time}`) > now);
        });

        setDates(availableDates);
        setSelectedDate(prev => (availableDates.includes(prev) ? prev : availableDates[0] || ''));

        const grouped: Record<string, Trajet[]> = {};
        for (const t of trajetsValides) {
          if (new Date(`${t.date}T${t.time}`) > now) {
            const key = `${t.companyId}`;
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(t);
          }
        }

        setGroupedTrajets(grouped);
      } catch (err) {
        console.error('Erreur Firestore:', err);
        setError('Erreur lors du chargement des trajets');
      } finally {
        setLoading(false);
      }
    };

    if (agence?.id) {
      fetchTrajets();
    }
  }, [departure, arrival, agence?.id]);

  const filteredGrouped = useMemo(() => {
    return Object.fromEntries(
      Object.entries(groupedTrajets).map(([key, trajets]) => [
        key,
        trajets.filter((t) => t.date === selectedDate),
      ])
    );
  }, [groupedTrajets, selectedDate]);

  useEffect(() => {
    const todayTrips = Object.values(filteredGrouped).flat().filter(t => t.date === selectedDate);
    if (todayTrips.length > 0) {
      const sorted = todayTrips.sort((a, b) => a.time.localeCompare(b.time));
      const defaultTime = sorted[0]?.time || '';
      setSelectedTime(prev => {
        const isStillValid = todayTrips.some(t => t.time === prev);
        return isStillValid ? prev : defaultTime;
      });
    } else {
      setSelectedTime('');
    }
  }, [selectedDate, filteredGrouped]);

  const isPastTime = (date: string, time: string) => {
    const dt = new Date(`${date}T${time}`);
    return dt.getTime() < new Date().getTime();
  };

  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  };

  const handleBooking = (trajet: Trajet) => {
    navigate(`/compagnie/${slug}/booking`, {
      state: {
        tripData: {
          id: trajet.id,
          departure: trajet.departure,
          arrival: trajet.arrival,
          date: trajet.date,
          time: trajet.time,
          price: trajet.price,
          places: trajet.places,
          companyId: trajet.companyId,
          agencyId: trajet.agencyId
        },
        companyInfo: {
          id: company?.id,
          nom: company?.nom,
          logoUrl: company?.logoUrl,
          primaryColor: colors.primary
        }
      }
    });
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
            onClick={() => navigate(`/compagnie/${slug}`)}
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
            onClick={() => navigate(`/compagnie/${slug}`)}
            className="p-2 rounded-full hover:bg-white/10 transition"
            style={{ color: colors.textOnPrimary }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          
          <div className="flex items-center gap-2">
            {company?.logoUrl && (
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
            <h1 className="text-lg font-bold">
              {company?.nom}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 sm:p-6">
        <div className={`p-4 rounded-xl mb-6 ${classes.card}`}>
          <h1 className="text-xl sm:text-2xl font-bold mb-2 text-gray-900">
            {departure} → {arrival}
          </h1>
          
          {agence && (
            <div className="flex items-center gap-3 mt-3">
              <div 
                className="p-2 rounded-full" 
                style={{ 
                  backgroundColor: hexToRgba(colors.primary, 0.1),
                  color: colors.primary 
                }}
              >
                <MapPin className="h-5 w-5" />
              </div>
              <div className="text-gray-800">
                <h3 className="font-semibold">{agence.nomAgence}</h3>
                <p className="text-sm opacity-80">
                  {agence.ville}, {agence.quartier} • ☎ {agence.telephone}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-800">
            <Calendar className="h-5 w-5" style={{ color: colors.primary }} />
            Dates disponibles
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
            {dates.map(date => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
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

        {Object.keys(filteredGrouped).length === 0 ? (
          <div className={`p-6 rounded-xl text-center ${classes.card} text-gray-800`}>
            <div className="bg-gray-100 p-4 rounded-full inline-flex mb-3">
              <Clock className="h-6 w-6 text-gray-500" />
            </div>
            <h3 className="text-lg font-medium mb-1">Aucun trajet disponible</h3>
            <p className="text-sm opacity-80">Veuillez choisir une autre date</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(filteredGrouped).map(([key, trajets]) => (
              <div key={key} className={`rounded-xl overflow-hidden ${classes.card}`}>
                <div className="p-4 border-b" style={{ borderColor: hexToRgba(colors.primary, 0.1) }}>
                  <h2 className="font-semibold flex items-center gap-2 mb-3 text-gray-800">
                    <Clock className="h-5 w-5" style={{ color: colors.primary }} />
                    Heures de départ
                  </h2>
                  
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                    {trajets
                      .sort((a, b) => a.time.localeCompare(b.time))
                      .map(trajet => (
                        <button
                          key={trajet.id}
                          onClick={() => setSelectedTime(trajet.time)}
                          disabled={isPastTime(trajet.date, trajet.time)}
                          className={`p-3 rounded-lg border flex flex-col items-center transition ${
                            selectedTime === trajet.time
                              ? 'bg-blue-50 text-blue-600'
                              : isPastTime(trajet.date, trajet.time)
                              ? 'bg-gray-50 text-gray-400'
                              : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50 text-gray-800'
                          }`}
                          style={{
                            borderColor: selectedTime === trajet.time ? colors.primary : undefined,
                            backgroundColor: selectedTime === trajet.time ? hexToRgba(colors.primary, 0.1) : undefined
                          }}
                        >
                          <span className="font-medium">{trajet.time}</span>
                          <span className="text-xs mt-1">
                            {trajet.places} places
                          </span>
                        </button>
                      ))}
                  </div>
                </div>

                {trajets
                  .filter(trajet => trajet.time === selectedTime && !isPastTime(trajet.date, trajet.time))
                  .map(trajet => (
                    <div key={trajet.id} className="p-4">
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
                              {trajet.price.toLocaleString()} FCFA
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
                            <h3 className="text-sm font-medium opacity-80">Places disponibles</h3>
                            <p
                              className={`text-lg font-bold ${
                                trajet.places === 0 ? 'text-red-600' :
                                trajet.places <= 10 ? 'text-yellow-600' : 'text-green-600'
                              }`}
                            >
                              {trajet.places}
                            </p>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleBooking(trajet)}
                        disabled={trajet.places === 0}
                        className={`w-full py-3 font-bold rounded-lg ${classes.button} ${
                          trajet.places === 0 ? 'opacity-70 cursor-not-allowed' : ''
                        }`}
                        style={{
                          backgroundColor: trajet.places === 0 ? '#e5e7eb' : colors.primary,
                          color: trajet.places === 0 ? '#6b7280' : colors.textOnPrimary
                        }}
                      >
                        {trajet.places === 0 ? 'Complet' : 'Réserver maintenant'}
                      </button>
                    </div>
                  ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default ResultatsAgencePage;