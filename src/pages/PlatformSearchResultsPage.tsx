// ✅ PlatformSearchResultsPage.tsx – version corrigée avec protection navigation
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface SearchCriteria {
  departure: string;
  arrival: string;
}

interface Trajet {
  id: string;
  departure: string;
  arrival: string;
  date: string;
  time: string;
  price: number;
  places: number;
  companyId: string;
  compagnieNom?: string;
  logoUrl?: string;
}

const PlatformSearchResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const criteres = location.state as SearchCriteria | null;

  const [groupedTrajets, setGroupedTrajets] = useState<Record<string, Trajet[]>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!criteres?.departure || !criteres?.arrival) {
      console.warn("🔁 Redirection car critères absents :", criteres);
      navigate('/');
      return;
    }

    const fetchTrajets = async () => {
      const capitalize = (text: string) =>
        text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
      const dep = capitalize(criteres.departure);
      const arr = capitalize(criteres.arrival);

      setLoading(true);
      try {
        const trajetsSnapshot = await getDocs(query(collection(db, 'dailyTrips')));
        const now = new Date();

        const trajets: Trajet[] = [];

        for (const docSnap of trajetsSnapshot.docs) {
          const data = docSnap.data();
          if (
            data.departure === dep &&
            data.arrival === arr &&
            !!data.date &&
            !!data.time &&
            !!data.price &&
            !!data.companyId &&
            new Date(`${data.date}T${data.time}`) > now
          ) {
            const companyRef = doc(db, 'companies', data.companyId);
            const companySnap = await getDoc(companyRef);

            trajets.push({
              id: docSnap.id,
              ...data,
              compagnieNom: companySnap.exists() ? companySnap.data().nom : 'Inconnue',
              logoUrl: companySnap.exists() ? companySnap.data().logoUrl : '',
            } as Trajet);
          }
        }

        const grouped: Record<string, Trajet[]> = {};
        for (const t of trajets) {
          const key = `${t.companyId}|${t.compagnieNom}|${t.logoUrl || ''}`;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(t);
        }

        setGroupedTrajets(grouped);
      } catch (err) {
        console.error('Erreur Firestore :', err);
      } finally {
        setLoading(false);
      }
    };

    fetchTrajets();
  }, [criteres, navigate]);

  if (!criteres?.departure || !criteres?.arrival) {
    return null; // protection de rendu
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-6">Trajets disponibles – Plateforme</h2>

      <input
        type="text"
        placeholder="Filtrer par compagnie..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-6 border border-gray-300 rounded px-3 py-2 w-full max-w-md"
      />

      {loading ? (
        <p>Chargement...</p>
      ) : Object.keys(groupedTrajets).length === 0 ? (
        <p className="text-red-600">Aucun trajet trouvé.</p>
      ) : (
        Object.entries(groupedTrajets)
          .filter(([key]) => key.toLowerCase().includes(filter.toLowerCase()))
          .map(([key, trajets]) => {
            const [companyId, compagnieNom, logoUrl] = key.split('|');
            const slug = compagnieNom.toLowerCase().replace(/\s+/g, '-').trim();
            const prixMin = Math.min(...trajets.map(t => t.price));
            return (
              <div key={key} className="border rounded-xl p-4 mb-6 shadow-md bg-white flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {logoUrl && <img src={logoUrl} alt="Logo" className="w-12 h-12 rounded-full object-cover" />}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-800">{compagnieNom}</h3>
                    <p className="text-sm text-gray-500">
                      {criteres?.departure} → {criteres?.arrival}
                    </p>
                    <p className="text-sm text-green-700 font-semibold">À partir de {prixMin.toLocaleString()} FCFA</p>
                  </div>
                </div>

                <button
                  onClick={() =>
                    navigate(`/compagnie/${slug}/resultats?departure=${criteres?.departure}&arrival=${criteres?.arrival}`)
                  }
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 text-sm"
                >
                  Réserver
                </button>
              </div>
            );
          })
      )}
    </div>
  );
};

export default PlatformSearchResultsPage;
