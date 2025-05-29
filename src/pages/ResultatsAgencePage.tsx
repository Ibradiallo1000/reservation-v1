// ✅ ResultatsAgencePage.tsx avec désactivation des heures passées et saut automatique de date
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

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

interface CompanyInfo {
  id: string;
  nom: string;
  pays: string;
  slug: string;
}

interface AgenceInfo {
  id: string;
  ville: string;
  quartier?: string;
  pays: string;
  telephone?: string;
  nomAgence?: string;
}

const ResultatsAgencePage: React.FC = () => {
  const navigate = useNavigate();
  const { slug } = useParams();
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
      const q = query(collection(db, 'companies'), where('slug', '==', slug));
      const snapshot = await getDocs(q);
      if (snapshot.empty) {
        setError("Aucune agence trouvée pour ce lien.");
        setLoading(false);
        return;
      }
      const doc = snapshot.docs[0];
      const data = doc.data();
      const companyId = doc.id;
      setCompany({ id: companyId, nom: data.nom, pays: data.pays, slug: data.slug });

      const agenceQuery = query(collection(db, 'agences'), where('companyId', '==', companyId));
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
      setLoading(false);
    };

    fetchCompanyAndAgence();
  }, [slug]);

  useEffect(() => {
    const fetchTrajets = async () => {
      if (!departure || !arrival || !agence?.id) return;
      setLoading(true);

      try {
        const allDates = getNextNDates(8);
        const q = query(collection(db, 'dailyTrips'));
        const snapshot = await getDocs(q);
        const allTrajets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Trajet[];

        const reservationsSnap = await getDocs(collection(db, 'reservations'));
        const reservations = reservationsSnap.docs.map(doc => doc.data());

        const trajetsValides = allTrajets.filter(doc =>
          doc.departure?.trim().toLowerCase() === departure.toLowerCase() &&
          doc.arrival?.trim().toLowerCase() === arrival.toLowerCase() &&
          doc.agencyId === agence.id &&
          allDates.includes(doc.date)
        ).map(trajet => {
          const reserved = reservations.filter(r => r.trajetId === trajet.id && r.statut === 'payé')
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
        setSelectedDate(prev => (availableDates.includes(prev) ? prev : availableDates[0]));

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
        console.error('🚨 Erreur Firestore :', err);
        setError('Erreur lors du chargement des trajets.');
      } finally {
        setLoading(false);
      }
    };

    fetchTrajets();
  }, [departure, arrival, agence]);

  const filteredGrouped = Object.fromEntries(
    Object.entries(groupedTrajets).map(([key, trajets]) => [
      key,
      trajets.filter((t) => t.date === selectedDate),
    ])
  );

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

  if (error) {
    return (
      <div className="text-center py-10 text-red-600">
        {error} <br />
        <button onClick={() => navigate('/')} className="mt-4 underline text-sm text-blue-700">
          ↩ Retour à l’accueil
        </button>
      </div>
    );
  }

  if (loading) {
    return <div className="text-center py-10 text-gray-600">Chargement...</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="text-center mb-4">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-800">
          Veuillez choisir votre date de départ ci-dessous
        </h1>
        {agence && (
          <div className="bg-gray-50 mt-2 p-3 rounded-md shadow-sm text-xs text-gray-600">
            📍 Agence : {agence.nomAgence} ({agence.ville}, {agence.pays}) | ☎ {agence.telephone}
          </div>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto scrollbar-hide mb-6 px-1">
        {dates.map(date => (
          <button
            key={date}
            onClick={() => setSelectedDate(date)}
            className={`min-w-[110px] px-4 py-2 border rounded-full text-sm flex-shrink-0 transition ${
              selectedDate === date
                ? 'bg-yellow-500 text-white font-semibold'
                : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
            }`}
          >
            {new Date(date).toLocaleDateString()}
          </button>
        ))}
      </div>

      {Object.keys(filteredGrouped).length === 0 ? (
        <p className="text-center text-red-600">Aucun trajet trouvé pour cette date.</p>
      ) : (
        Object.entries(filteredGrouped).map(([key, trajets]) => (
          <div key={key} className="border rounded-lg p-4 mb-6 shadow-sm bg-white">
            <h2 className="text-base font-semibold text-gray-800 mb-3">
              {agence?.nomAgence || 'Agence'} – {agence?.ville}, {agence?.quartier} – {agence?.telephone}
            </h2>

            <h3 className="text-sm font-medium text-gray-700 mb-2">Choisissez une heure :</h3>
            {!selectedTime && <p className="text-red-500 text-sm">Aucune heure sélectionnée.</p>}

            <div key={selectedDate + selectedTime} className="flex flex-wrap gap-4 mb-4">
              {trajets
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(t => (
                  <label key={t.id} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="selectedTime"
                      value={t.time}
                      checked={selectedTime === t.time}
                      onChange={() => setSelectedTime(t.time)}
                      disabled={isPastTime(t.date, t.time)}
                    />
                    <span className={`font-medium ${isPastTime(t.date, t.time) ? 'text-gray-400' : 'text-blue-700'}`}>{t.time}</span>
                  </label>
                ))}
            </div>

            {trajets
              .filter(t => t.time === selectedTime && !isPastTime(t.date, t.time))
              .map(t => (
                <div key={t.id} className="space-y-2 text-sm text-gray-700">
                  <p>🛣️ <strong>Trajet :</strong> {t.departure} → {t.arrival}</p>
                  <p>📅 <strong>Date :</strong> {t.date}</p>
                  <p>
                    💰 <strong>Prix :</strong> <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full">
                      {t.price.toLocaleString()} FCFA
                    </span>{' '}
                    | <strong>Places :</strong>{' '}
                    <span className={`font-bold ${
                      t.places === 0 ? 'text-red-600' : t.places <= 10 ? 'text-yellow-600' : 'text-green-600'
                    }`}>
                      {t.places}
                    </span>
                  </p>
                  <button
                    onClick={() => navigate('/compagnie/' + slug + '/booking', {
                      state: {
                        ...t,
                        tripId: t.id,
                        companyId: company?.id,
                        company: company?.nom,
                        logoUrl: t.logoUrl || ''
                      }
                    })}
                    className="mt-4 w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
                  >
                    Réserver
                  </button>
                </div>
              ))}
          </div>
        ))
      )}

      <div className="text-center mt-8">
        <button
          onClick={() => navigate(`/compagnie/${slug}`)}
          className="text-sm text-blue-600 hover:underline"
        >
          ↩ Retour à la vitrine
        </button>
      </div>
    </div>
  );
};

export default ResultatsAgencePage;