import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams, useLocation } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { ChevronLeft, Clock, MapPin, Calendar, Users, Ticket } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';
import { hexToRgba, safeTextColor } from '../utils/color';

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

const ResultatsAgencePage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams<{ slug?: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const state = location.state as {
    departure?: string;
    arrival?: string;
    companyInfo?: CompanyInfo;
  };

  const departureParam = state?.departure || searchParams.get('departure') || '';
  const arrivalParam = state?.arrival || searchParams.get('arrival') || '';

  const capitalize = (str: string) => str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  const departure = capitalize(departureParam);
  const arrival = capitalize(arrivalParam);

  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [agence, setAgence] = useState<AgenceInfo | null>(null);
  const agenceId = agence?.id || null;
  const [groupedTrajets, setGroupedTrajets] = useState<Record<string, Trajet[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');

  const themeConfig = useMemo(() => {
    return {
      colors: {
        primary: company?.couleurPrimaire || '#3b82f6',
        secondary: company?.couleurSecondaire || '#93c5fd',
        text: company?.couleurPrimaire ? safeTextColor(company.couleurPrimaire) : '#ffffff',
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
      try {
        let companyId = '';

        if (state?.companyInfo) {
          setCompany(state.companyInfo);
          companyId = state.companyInfo.id;
        } else {
          if (!slug) {
            setError('Compagnie non trouvée');
            setLoading(false);
            return;
          }

          const q = query(collection(db, 'companies'), where('slug', '==', slug));
          const snapshot = await getDocs(q);

          if (snapshot.empty) {
            setError('Compagnie non trouvée');
            setLoading(false);
            return;
          }

          const doc = snapshot.docs[0];
          const data = doc.data();
          setCompany({ id: doc.id, ...data } as CompanyInfo);
          companyId = doc.id;
        }

        const agenceQuery = query(collection(db, 'agences'), where('companyId', '==', companyId));
        const agencesSnapshot = await getDocs(agenceQuery);

        if (!agencesSnapshot.empty) {
          const agenceDoc = agencesSnapshot.docs[0];
          const agenceData = agenceDoc.data();
          setAgence({ id: agenceDoc.id, ...agenceData } as AgenceInfo);
        } else {
          console.warn("Aucune agence trouvée pour la compagnie", companyId);
        }
      } catch (err) {
        console.error('Erreur Firestore:', err);
        setError('Erreur lors du chargement');
      } finally {
        setLoading(false);
      }
    };

    fetchCompanyAndAgence();
  }, [slug, state?.companyInfo]);

  useEffect(() => {
    if (!departure || !arrival || !agenceId) {
      console.warn("⏳ Attente des données pour charger les trajets", { departure, arrival, agenceId });
      return;
    }

    const fetchTrajets = async () => {
      setLoading(true);

      try {
        const allDates = getNextNDates(8);
        const q = query(collection(db, 'dailyTrips'));
        const snapshot = await getDocs(q);
        const allTrajets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Trajet));

        const reservationsSnap = await getDocs(collection(db, 'reservations'));
        const reservations = reservationsSnap.docs.map(doc => doc.data());

        const trajetsValides = allTrajets.filter(doc =>
          doc.departure?.trim().toLowerCase() === departure.toLowerCase() &&
          doc.arrival?.trim().toLowerCase() === arrival.toLowerCase() &&
          doc.agencyId === agenceId &&
          allDates.includes(doc.date)
        ).map(trajet => {
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

    fetchTrajets();
  }, [departure, arrival, agenceId]);

  // Le reste de l'affichage reste inchangé...

  return <div>...</div>;
};

export default ResultatsAgencePage;
