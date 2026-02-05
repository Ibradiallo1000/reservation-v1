import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  collection,
  collectionGroup,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Bus, Search, ArrowLeft, ArrowRight } from 'lucide-react';

/* ================= TYPES ================= */

interface SearchCriteria {
  departure: string;
  arrival: string;
}

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
}

/* ================= HELPERS ================= */

// Normalisation STRICTEMENT côté JS
const normalize = (s: string) =>
  s
    ?.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

/* ================= PAGE ================= */

const PlatformSearchResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  // 1️⃣ depuis location.state (desktop)
  const stateCrit = location.state as SearchCriteria | null;

  // 2️⃣ fallback query params (mobile / refresh)
  const qp = {
    departure: (params.get('departure') || params.get('from') || '').trim(),
    arrival: (params.get('arrival') || params.get('to') || '').trim(),
  };

  // Critères unifiés
  const criteres: SearchCriteria | null = useMemo(() => {
    if (stateCrit?.departure && stateCrit?.arrival) return stateCrit;
    if (qp.departure && qp.arrival) return qp;
    return null;
  }, [stateCrit, qp.departure, qp.arrival]);

  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [groupedTrajets, setGroupedTrajets] = useState<Record<string, Trajet[]>>(
    {}
  );
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  /* ================= FETCH ================= */

  useEffect(() => {
    if (!criteres) {
      setGroupedTrajets({});
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      try {
        /* ===== COMPANIES ===== */
        const companiesSnap = await getDocs(collection(db, 'companies'));
        const companiesMap: Record<string, Company> = {};
        companiesSnap.forEach((d) => {
          companiesMap[d.id] = { id: d.id, ...(d.data() as any) };
        });
        setCompanies(companiesMap);

        /* ===== WEEKLY TRIPS ===== */
        const depRaw = criteres.departure.trim();
        const arrRaw = criteres.arrival.trim();

        // 🔥 Requête volontairement SIMPLE
        const qRef = query(
          collectionGroup(db, 'weeklyTrips'),
          where('departure', '==', depRaw)
        );

        const snap = await getDocs(qRef);

        const grouped: Record<string, Trajet[]> = {};

        snap.forEach((docSnap) => {
          const data = docSnap.data() as any;

          // 🧠 Filtrage intelligent côté JS (corrige le bug mobile)
          if (normalize(data.arrival) !== normalize(arrRaw)) return;

          const companyId = docSnap.ref.path.split('/')[1];

          const trajet: Trajet = {
            id: docSnap.id,
            companyId,
            ...data,
          };

          (grouped[companyId] ||= []).push(trajet);
        });

        setGroupedTrajets(grouped);
      } catch (err) {
        console.error('❌ Erreur recherche plateforme:', err);
        setGroupedTrajets({});
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [criteres]);

  /* ================= FILTER ================= */

  const filteredCompanies = useMemo(() => {
    const ids = Object.keys(groupedTrajets);
    const term = filter.toLowerCase();
    return ids.filter((companyId) => {
      const company = companies[companyId];
      return term ? company?.nom?.toLowerCase().includes(term) : true;
    });
  }, [groupedTrajets, companies, filter]);

  /* ================= UI ================= */

  if (!criteres) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-600">Paramètres de recherche manquants.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===== HEADER ===== */}
      <header className="bg-white shadow-md sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-orange-600"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Retour
          </button>
          <div className="flex items-center gap-2">
            <img
              src="/icons/icon-192.png"
              alt="Teliya"
              className="w-7 h-7 rounded-full"
            />
            <span className="font-bold text-xl text-orange-600">Teliya</span>
          </div>
        </div>
      </header>

      {/* ===== ROUTE + FILTRE ===== */}
      <div className="max-w-5xl mx-auto px-4 mt-6 space-y-3">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          <span className="px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-200 font-semibold truncate">
            {capitalize(criteres.departure)}
          </span>
          <ArrowRight className="h-4 w-4 text-gray-400 mx-auto" />
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 font-semibold justify-self-end truncate">
            {capitalize(criteres.arrival)}
          </span>
        </div>

        <div className="relative w-full sm:w-[320px] sm:ml-auto">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer par compagnie"
            className="pl-9 border rounded-lg py-2 px-3 text-sm w-full focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* ===== RESULTS ===== */}
      <div className="max-w-5xl mx-auto p-4">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredCompanies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">
              Aucune compagnie disponible pour ce trajet
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-orange-600 text-white px-6 py-2 rounded-lg"
            >
              Nouvelle recherche
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredCompanies.map((companyId) => {
              const company = companies[companyId];
              const trajets = groupedTrajets[companyId];
              const prixMin = Math.min(...trajets.map((t) => t.price));
              const totalPlaces = trajets.reduce(
                (acc, t) => acc + (t.places || 0),
                0
              );

              return (
                <div
                  key={companyId}
                  className="bg-white rounded-xl shadow-sm p-4 flex justify-between items-center border"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    {company.logoUrl ? (
                      <img
                        src={company.logoUrl}
                        className="w-12 h-12 rounded-full object-cover border"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-orange-50 border grid place-items-center">
                        <Bus className="text-orange-500" />
                      </div>
                    )}

                    <div className="min-w-0">
                      <h3
                        className="font-semibold truncate"
                        style={{
                          color: company.couleurPrimaire || '#ea580c',
                        }}
                      >
                        {company.nom}
                      </h3>
                      <p className="text-xs text-gray-500">
                        {totalPlaces} places disponibles
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end w-36">
                    <div className="text-emerald-600 font-bold mb-2">
                      {prixMin.toLocaleString()} FCFA
                    </div>
                    <button
                      onClick={() =>
                        navigate(
                          `/${company.slug}/booking?departure=${encodeURIComponent(
                            criteres.departure
                          )}&arrival=${encodeURIComponent(criteres.arrival)}`
                        )
                      }
                      className="bg-orange-600 text-white px-4 py-2 rounded-lg w-full"
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
