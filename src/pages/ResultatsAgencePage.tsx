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
  const [agenceAller, setAgenceAller] = useState<AgenceInfo | null>(null);
  const [agenceRetour, setAgenceRetour] = useState<AgenceInfo | null>(null);
  const [trajetsAller, setTrajetsAller] = useState<Trajet[]>([]);
  const [trajetsRetour, setTrajetsRetour] = useState<Trajet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [datesAller, setDatesAller] = useState<string[]>([]);
  const [datesRetour, setDatesRetour] = useState<string[]>([]);
  const [selectedDateAller, setSelectedDateAller] = useState<string>('');
  const [selectedDateRetour, setSelectedDateRetour] = useState<string>('');
  const [selectedTimeAller, setSelectedTimeAller] = useState<string>('');
  const [selectedTimeRetour, setSelectedTimeRetour] = useState<string>('');
  const [tripType, setTripType] = useState<'aller_simple' | 'aller_retour'>('aller_simple');

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

  // Chargement de la compagnie et des agences
  useEffect(() => {
    const fetchCompanyAndAgences = async () => {
      if (!slug) {
        setError('Compagnie non trouvée');
        setLoading(false);
        return;
      }

      try {
        // Charger la compagnie
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
          logoUrl: data.logoUrl,
          banniereUrl: data.banniereUrl
        });

        // Charger l'agence aller (departure)
        const agenceAllerQuery = query(
          collection(db, 'agences'),
          where('ville', '==', departure),
          where('companyId', '==', doc.id)
        );
        const agenceAllerSnap = await getDocs(agenceAllerQuery);
        
        if (!agenceAllerSnap.empty) {
          const agenceDoc = agenceAllerSnap.docs[0];
          const agenceData = agenceDoc.data();
          setAgenceAller({
            id: agenceDoc.id,
            ville: agenceData.ville,
            quartier: agenceData.quartier,
            pays: agenceData.pays,
            telephone: agenceData.telephone,
            nomAgence: agenceData.nomAgence,
          });
        }

        // Charger l'agence retour (arrival) si différent
        if (departure !== arrival) {
          const agenceRetourQuery = query(
            collection(db, 'agences'),
            where('ville', '==', arrival),
            where('companyId', '==', doc.id)
          );
          const agenceRetourSnap = await getDocs(agenceRetourQuery);
          
          if (!agenceRetourSnap.empty) {
            const agenceDoc = agenceRetourSnap.docs[0];
            const agenceData = agenceDoc.data();
            setAgenceRetour({
              id: agenceDoc.id,
              ville: agenceData.ville,
              quartier: agenceData.quartier,
              pays: agenceData.pays,
              telephone: agenceData.telephone,
              nomAgence: agenceData.nomAgence,
            });
          }
        }
      } catch (err) {
        console.error('Erreur Firestore:', err);
        setError('Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyAndAgences();
  }, [slug, departure, arrival]);

  // Chargement des trajets aller
  useEffect(() => {
    const fetchTrajetsAller = async () => {
      if (!agenceAller?.id) return;

      setLoading(true);
      try {
        const allDates = getNextNDates(8);
        const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

        // Charger les réservations
        const reservationsQuery = query(
          collection(db, 'reservations'),
          where('statut', '==', 'payé')
        );
        const reservationsSnap = await getDocs(reservationsQuery);
        const reservations = reservationsSnap.docs.map(doc => doc.data());

        // Charger les weeklyTrips pour l'aller
        const q = query(
          collection(db, 'weeklyTrips'),
          where('agencyId', '==', agenceAller.id),
          where('departure', '==', departure),
          where('arrival', '==', arrival),
          where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        const virtualTrajets: Trajet[] = [];

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const { horaires, price, places = 30, agencyId, companyId } = data;

          for (const dateStr of allDates) {
            const d = new Date(dateStr);
            const dayName = DAYS[d.getDay()];

            const heures = horaires?.[dayName] || [];
            if (heures.length === 0) continue;

            for (const heure of heures) {
              const trajetId = `${doc.id}_${dateStr}_${heure.replace(/\s+/g, '')}`;
              const tripDateTime = new Date(`${dateStr}T${heure}`);

              const reservedSeats = reservations
                .filter(r => r.trajetId === trajetId)
                .reduce((acc, r) => acc + (r.seatsGo || 1) + (r.seatsReturn || 0), 0);

              const remainingSeats = Math.max(0, places - reservedSeats);

              if (tripDateTime > new Date()) {
                virtualTrajets.push({
                  id: trajetId,
                  departure: data.departure,
                  arrival: data.arrival,
                  date: dateStr,
                  time: heure,
                  price,
                  places: remainingSeats,
                  companyId,
                  agencyId,
                  compagnieNom: company?.nom,
                  logoUrl: company?.logoUrl,
                  remainingSeats
                });
              }
            }
          }
        }

        // Grouper par date
        const trajetsParDate: Record<string, Trajet[]> = {};
        virtualTrajets.forEach(t => {
          if (!trajetsParDate[t.date]) trajetsParDate[t.date] = [];
          trajetsParDate[t.date].push(t);
        });

        setDatesAller(Object.keys(trajetsParDate));
        setSelectedDateAller(prev => trajetsParDate[prev] ? prev : Object.keys(trajetsParDate)[0] || '');
        setTrajetsAller(virtualTrajets);
      } catch (err) {
        console.error('Erreur Firestore:', err);
        setError('Erreur lors du chargement des trajets aller');
      } finally {
        setLoading(false);
      }
    };

    fetchTrajetsAller();
  }, [agenceAller?.id, departure, arrival, company?.nom, company?.logoUrl]);

  // Chargement des trajets retour (seulement si aller_retour)
  useEffect(() => {
    const fetchTrajetsRetour = async () => {
      if (tripType !== 'aller_retour' || !agenceRetour?.id) return;

      setLoading(true);
      try {
        const allDates = getNextNDates(8);
        const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

        // Charger les réservations
        const reservationsQuery = query(
          collection(db, 'reservations'),
          where('statut', '==', 'payé')
        );
        const reservationsSnap = await getDocs(reservationsQuery);
        const reservations = reservationsSnap.docs.map(doc => doc.data());

        // Charger les weeklyTrips pour le retour (sens inverse)
        const q = query(
          collection(db, 'weeklyTrips'),
          where('agencyId', '==', agenceRetour.id),
          where('departure', '==', arrival), // Inversé !
          where('arrival', '==', departure), // Inversé !
          where('active', '==', true)
        );
        const snapshot = await getDocs(q);
        const virtualTrajets: Trajet[] = [];

        for (const doc of snapshot.docs) {
          const data = doc.data();
          const { horaires, price, places = 30, agencyId, companyId } = data;

          for (const dateStr of allDates) {
            const d = new Date(dateStr);
            const dayName = DAYS[d.getDay()];

            const heures = horaires?.[dayName] || [];
            if (heures.length === 0) continue;

            for (const heure of heures) {
              const trajetId = `${doc.id}_${dateStr}_${heure.replace(/\s+/g, '')}_retour`;
              const tripDateTime = new Date(`${dateStr}T${heure}`);

              const reservedSeats = reservations
                .filter(r => r.trajetId === trajetId)
                .reduce((acc, r) => acc + (r.seatsGo || 1) + (r.seatsReturn || 0), 0);

              const remainingSeats = Math.max(0, places - reservedSeats);

              if (tripDateTime > new Date()) {
                virtualTrajets.push({
                  id: trajetId,
                  departure: data.departure,
                  arrival: data.arrival,
                  date: dateStr,
                  time: heure,
                  price,
                  places: remainingSeats,
                  companyId,
                  agencyId,
                  compagnieNom: company?.nom,
                  logoUrl: company?.logoUrl,
                  remainingSeats
                });
              }
            }
          }
        }

        // Grouper par date
        const trajetsParDate: Record<string, Trajet[]> = {};
        virtualTrajets.forEach(t => {
          if (!trajetsParDate[t.date]) trajetsParDate[t.date] = [];
          trajetsParDate[t.date].push(t);
        });

        setDatesRetour(Object.keys(trajetsParDate));
        setSelectedDateRetour(prev => trajetsParDate[prev] ? prev : Object.keys(trajetsParDate)[0] || '');
        setTrajetsRetour(virtualTrajets);
      } catch (err) {
        console.error('Erreur Firestore:', err);
        setError('Erreur lors du chargement des trajets retour');
      } finally {
        setLoading(false);
      }
    };

    fetchTrajetsRetour();
  }, [agenceRetour?.id, departure, arrival, company?.nom, company?.logoUrl, tripType]);

  // Filtrer les trajets par date sélectionnée
  const filteredTrajetsAller = useMemo(() => {
    return trajetsAller.filter(t => t.date === selectedDateAller);
  }, [trajetsAller, selectedDateAller]);

  const filteredTrajetsRetour = useMemo(() => {
    return trajetsRetour.filter(t => t.date === selectedDateRetour);
  }, [trajetsRetour, selectedDateRetour]);

  // Gérer la sélection des heures
  useEffect(() => {
    if (filteredTrajetsAller.length > 0) {
      const sorted = [...filteredTrajetsAller].sort((a, b) => a.time.localeCompare(b.time));
      const defaultTime = sorted[0]?.time || '';
      setSelectedTimeAller(prev => {
        const isStillValid = filteredTrajetsAller.some(t => t.time === prev);
        return isStillValid ? prev : defaultTime;
      });
    } else {
      setSelectedTimeAller('');
    }
  }, [selectedDateAller, filteredTrajetsAller]);

  useEffect(() => {
    if (filteredTrajetsRetour.length > 0) {
      const sorted = [...filteredTrajetsRetour].sort((a, b) => a.time.localeCompare(b.time));
      const defaultTime = sorted[0]?.time || '';
      setSelectedTimeRetour(prev => {
        const isStillValid = filteredTrajetsRetour.some(t => t.time === prev);
        return isStillValid ? prev : defaultTime;
      });
    } else {
      setSelectedTimeRetour('');
    }
  }, [selectedDateRetour, filteredTrajetsRetour]);

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

  const handleBooking = (trajetAller: Trajet | null, trajetRetour: Trajet | null = null) => {
    if (!trajetAller) return;

    navigate(`/compagnie/${slug}/booking`, {
      state: {
        tripData: trajetAller,
        returnTripData: trajetRetour,
        companyInfo: {
          id: company?.id,
          nom: company?.nom,
          logoUrl: company?.logoUrl,
          primaryColor: colors.primary,
          slug: company?.slug
        },
        tripType: tripType
      }
    });
  };

  // Calcul du prix total
  const totalPrice = useMemo(() => {
    const allerPrice = filteredTrajetsAller.find(t => t.time === selectedTimeAller)?.price || 0;
    const retourPrice = tripType === 'aller_retour' 
      ? (filteredTrajetsRetour.find(t => t.time === selectedTimeRetour)?.price || 0)
      : 0;
    return allerPrice + retourPrice;
  }, [selectedTimeAller, selectedTimeRetour, tripType, filteredTrajetsAller, filteredTrajetsRetour]);

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

  const renderTripSection = (
    title: string,
    trajets: Trajet[],
    selectedDate: string,
    setSelectedDate: React.Dispatch<React.SetStateAction<string>>,
    dates: string[],
    selectedTime: string,
    setSelectedTime: React.Dispatch<React.SetStateAction<string>>,
    isReturn: boolean = false
  ) => {
    const currentAgence = isReturn ? agenceRetour : agenceAller;
    const hasTrips = trajets.length > 0;

    return (
      <div className={`p-4 rounded-xl mb-6 ${classes.card}`}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          {isReturn ? (
            <span>{arrival} → {departure}</span>
          ) : (
            <span>{departure} → {arrival}</span>
          )}
        </h2>

        {currentAgence && (
          <div className="flex items-center gap-3 mb-4">
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
              <h3 className="font-semibold">{currentAgence.nomAgence}</h3>
              <p className="text-sm opacity-80">
                {currentAgence.ville}, {currentAgence.quartier} • ☎ {currentAgence.telephone}
              </p>
            </div>
          </div>
        )}

        <div className="mb-4">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2 text-gray-800">
            <Calendar className="h-5 w-5" style={{ color: colors.primary }} />
            Dates disponibles
          </h3>
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

        {!hasTrips ? (
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
                  Heures de départ
                </h3>
                
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
                          <h3 className="text-sm font-medium opacity-90">Places disponibles</h3>
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
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    );
  };

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

      <main className="max-w-4xl mx-auto p-4 sm:p-6 pb-24"> {/* Ajout de pb-24 pour laisser de la place au bouton sticky */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTripType('aller_simple')}
            className={`px-4 py-2 rounded-lg ${tripType === 'aller_simple' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
          >
            Aller simple
          </button>
          <button
            onClick={() => setTripType('aller_retour')}
            className={`px-4 py-2 rounded-lg ${tripType === 'aller_retour' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-800'}`}
          >
            Aller-retour
          </button>
        </div>

        {/* Section Aller */}
        {renderTripSection(
          `${departure} → ${arrival}`,
          filteredTrajetsAller,
          selectedDateAller,
          setSelectedDateAller,
          datesAller,
          selectedTimeAller,
          setSelectedTimeAller
        )}

        {/* Section Retour (seulement si aller-retour) */}
        {tripType === 'aller_retour' && renderTripSection(
          `${arrival} → ${departure}`,
          filteredTrajetsRetour,
          selectedDateRetour,
          setSelectedDateRetour,
          datesRetour,
          selectedTimeRetour,
          setSelectedTimeRetour,
          true
        )}

        {/* Bouton de réservation global */}
        <div className="fixed bottom-0 left-0 right-0 bg-white shadow-lg p-4 border-t border-gray-200">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-xl font-bold text-gray-900">
                {totalPrice.toLocaleString()} FCFA
              </p>
            </div>
            
            {tripType === 'aller_simple' ? (
              <button
                onClick={() => handleBooking(
                  filteredTrajetsAller.find(t => t.time === selectedTimeAller) || null
                )}
                disabled={!selectedTimeAller}
                className={`px-6 py-3 rounded-lg font-bold ${classes.button} ${
                  !selectedTimeAller ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary
                }}
              >
                Réserver maintenant
              </button>
            ) : (
              <button
                onClick={() => handleBooking(
                  filteredTrajetsAller.find(t => t.time === selectedTimeAller) || null,
                  filteredTrajetsRetour.find(t => t.time === selectedTimeRetour) || null
                )}
                disabled={!selectedTimeAller || !selectedTimeRetour}
                className={`px-6 py-3 rounded-lg font-bold ${classes.button} ${
                  !selectedTimeAller || !selectedTimeRetour ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                style={{
                  backgroundColor: colors.primary,
                  color: colors.textOnPrimary
                }}
              >
                Réserver aller-retour
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ResultatsAgencePage;