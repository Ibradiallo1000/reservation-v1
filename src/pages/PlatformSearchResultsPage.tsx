// src/pages/PlatformSearchResultsPage.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Bus, Search, ArrowLeft, ArrowRight } from 'lucide-react';

interface SearchCriteria { departure: string; arrival: string; }

interface Company {
  id: string;
  nom: string;
  slug: string;
  logoUrl?: string;
  rating?: number;
  couleurPrimaire?: string;
}

interface Trajet {
  id: string;
  departure: string;
  arrival: string;
  price: number;
  places: number;
  companyId: string;
  horaires?: string[];
  dates?: string[];
}

// Normalisation
const normalize = (s: string) =>
  s?.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;

const PlatformSearchResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  // 1) via location.state
  const stateCrit = location.state as SearchCriteria | null;
  // 2) fallback via query params
  const qp = {
    departure: (params.get('from') || '').trim(),
    arrival: (params.get('to') || '').trim(),
  };

  // Critères unifiés
  const criteres: SearchCriteria | null = useMemo(() => {
    if (stateCrit?.departure && stateCrit?.arrival) return stateCrit;
    if (qp.departure && qp.arrival) return qp;
    return null;
  }, [stateCrit, qp.departure, qp.arrival]);

  const [groupedTrajets, setGroupedTrajets] = useState<Record<string, Trajet[]>>({});
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!criteres?.departure || !criteres?.arrival) {
      setLoading(false);
      setGroupedTrajets({});
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // Companies
        const companiesSnapshot = await getDocs(collection(db, 'companies'));
        const companiesMap = companiesSnapshot.docs.reduce((acc, d) => {
          acc[d.id] = { ...d.data(), id: d.id } as Company;
          return acc;
        }, {} as Record<string, Company>);
        setCompanies(companiesMap);

        // Normaliser (doit matcher la BDD)
        const dep = capitalize(normalize(criteres.departure));
        const arr = capitalize(normalize(criteres.arrival));

        const qRef = query(
          collectionGroup(db, 'weeklyTrips'),
          where('departure', '==', dep),
          where('arrival', '==', arr)
        );

        const trajetsSnapshot = await getDocs(qRef);
        const grouped: Record<string, Trajet[]> = {};

        trajetsSnapshot.forEach((docSnap) => {
          const data = docSnap.data() as any;
          // /companies/{companyId}/weeklyTrips/{docId}
          const companyId = docSnap.ref.path.split('/')[1];

          const trajet: Trajet = {
            ...data,
            id: docSnap.id,
            companyId,
          };

          (grouped[companyId] ||= []).push(trajet);
        });

        setGroupedTrajets(grouped);
      } catch (err) {
        console.error('❌ Erreur Firestore :', err);
        setGroupedTrajets({});
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [criteres?.departure, criteres?.arrival]);

  const filteredCompanies = useMemo(() => {
    const ids = Object.keys(groupedTrajets);
    const term = filter.toLowerCase();
    return ids.filter((companyId) => {
      const company = companies[companyId];
      return term ? company?.nom?.toLowerCase().includes(term) : true;
    });
  }, [groupedTrajets, companies, filter]);

  if (!criteres?.departure || !criteres?.arrival) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-md sticky top-0 z-50">
          <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
            <button onClick={() => navigate('/')} className="flex items-center text-orange-600">
              <ArrowLeft className="w-5 h-5 mr-1" /> Retour
            </button>
            <div className="flex items-center gap-2">
              <img src="/icons/icon-192.png" alt="Teliya" className="w-7 h-7 object-contain rounded-full" />
              <span className="font-bold text-xl text-orange-600">Teliya</span>
            </div>
          </div>
        </header>

        <div className="max-w-5xl mx-auto p-6">
          <h1 className="text-2xl font-bold mb-3">Résultats de recherche</h1>
          <p className="text-gray-600">Paramètres incomplets. Veuillez relancer une recherche.</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700"
          >
            Nouvelle recherche
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <button onClick={() => navigate('/')} className="flex items-center text-orange-600">
            <ArrowLeft className="w-5 h-5 mr-1" /> Retour
          </button>
          <div className="flex items-center gap-2">
            <img src="/icons/icon-192.png" alt="Teliya" className="w-7 h-7 object-contain rounded-full" />
            <span className="font-bold text-xl text-orange-600">Teliya</span>
          </div>
        </div>
      </header>

      {/* Route + search — villes sur UNE SEULE LIGNE */}
      <div className="max-w-5xl mx-auto px-4 mt-6">
        <div className="flex flex-col gap-3">
          {/* Villes en grille 1fr / auto / 1fr -> garantit une seule ligne */}
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 font-semibold text-gray-900 truncate">
              {capitalize(criteres.departure)}
            </span>

            <div className="flex items-center justify-center">
              <ArrowRight className="h-4 w-4 text-gray-400" />
            </div>

            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 font-semibold text-gray-900 justify-self-end truncate">
              {capitalize(criteres.arrival)}
            </span>
          </div>

          {/* Filtre compagnie (en dessous sur mobile, aligné à droite ≥ sm) */}
          <div className="relative w-full sm:w-[320px] sm:self-end">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Filtrer par compagnie"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="pl-9 border border-gray-300 rounded-lg py-2 px-3 text-sm w-full bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      <div className="max-w-5xl mx-auto p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">Aucune compagnie disponible pour ce trajet</p>
            <button
              onClick={() => navigate('/')}
              className="bg-orange-600 text-white px-6 py-2 rounded-lg hover:bg-orange-700"
            >
              Nouvelle recherche
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCompanies.map((companyId) => {
              const company = companies[companyId]!;
              const trajets = groupedTrajets[companyId];
              const prixMin = Math.min(...trajets.map((t) => t.price));
              const totalPlaces = trajets.reduce((acc, t) => acc + (t.places || 0), 0);

              return (
                <div
                  key={companyId}
                  className="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between border border-gray-200"
                >
                  {/* Colonne gauche : logo + infos */}
                  <div className="flex items-center gap-4 min-w-0">
                    {company.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        alt={company.nom}
                        className="w-12 h-12 rounded-full border object-cover flex-none"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full grid place-items-center bg-orange-50 border border-orange-100 flex-none">
                        <Bus className="w-6 h-6 text-orange-500" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3
                        className="text-[15px] font-semibold leading-snug break-words"
                        style={{ color: company.couleurPrimaire || '#ea580c' }}
                      >
                        {company.nom}
                      </h3>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {totalPlaces} pl. disponibles
                      </p>
                    </div>
                  </div>

                  {/* Colonne droite : prix au-dessus du bouton */}
                  <div className="flex flex-col items-end w-36">
                    <div className="text-emerald-600 font-bold leading-none mb-2">
                      {prixMin.toLocaleString()} FCFA
                    </div>
                    <button
                      onClick={() =>
                        navigate(
                          `/${company.slug}/booking?departure=${encodeURIComponent(
                            criteres.departure
                          )}&arrival=${encodeURIComponent(criteres.arrival)}`,
                          {
                            state: {
                              preloaded: true,
                              company,
                              departure: criteres.departure,
                              arrival: criteres.arrival,
                              preloadedPrice: prixMin,
                            },
                          }
                        )
                      }
                      className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm w-full"
                    >
                      Réserver
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PlatformSearchResultsPage;
