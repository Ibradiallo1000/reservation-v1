import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { collection, collectionGroup, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { Bus, Search, ArrowLeft, ArrowRight, Wind, Wifi, Zap, Coffee, Sofa } from 'lucide-react';

/* =========================
   TYPES
========================= */
interface SearchCriteria {
  departure: string;
  arrival: string;
}

interface Company {
  id: string;
  nom: string;
  slug: string;
  logoUrl?: string;
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

/* =========================
   AJOUT: Interface Reservation
========================= */
interface Reservation {
  companyId: string;
  weeklyTripId: string;
  places: number;
  statut: string;
}

/* =========================
   UTILS
========================= */
const normalize = (s: string) =>
  s
    ?.trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const capitalize = (s: string) =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

/* =========================
   SERVICES ICONS CONFIG
========================= */
const serviceIcons = [
  { icon: Wind, label: 'Climatisation', color: 'text-blue-500' },
  { icon: Wifi, label: 'Wi-Fi', color: 'text-purple-500' },
  { icon: Zap, label: 'Prise USB', color: 'text-yellow-500' },
  { icon: Coffee, label: 'Boisson', color: 'text-orange-500' },
  { icon: Sofa, label: 'Sièges confort', color: 'text-green-500' },
];

/* =========================
   COMPONENT
========================= */
const PlatformSearchResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  /* ---------- critères ---------- */
  const stateCrit = location.state as SearchCriteria | null;

  const qpCrit: SearchCriteria = {
    departure: params.get('from') || '',
    arrival: params.get('to') || '',
  };

  const criteres = useMemo<SearchCriteria | null>(() => {
    if (stateCrit?.departure && stateCrit?.arrival) return stateCrit;
    if (qpCrit.departure && qpCrit.arrival) return qpCrit;
    return null;
  }, [stateCrit, qpCrit.departure, qpCrit.arrival]);

  /* ---------- state ---------- */
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [groupedTrajets, setGroupedTrajets] = useState<Record<string, Trajet[]>>(
    {}
  );
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  /* =========================
     AJOUT: State pour les places réservées
  ========================= */
  const [reservedPlacesMap, setReservedPlacesMap] = useState<Record<string, number>>({});

  /* =========================
     FETCH DATA (CORRIGÉ)
  ========================= */
  useEffect(() => {
    if (!criteres?.departure || !criteres?.arrival) {
      setGroupedTrajets({});
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);

      try {
        /* ----- companies ----- */
        const companiesSnap = await getDocs(collection(db, 'companies'));
        const companiesMap: Record<string, Company> = {};

        companiesSnap.forEach((d) => {
          const data = d.data() as Omit<Company, 'id'>;

          companiesMap[d.id] = {
            ...data,
            id: d.id,
          };
        });

        setCompanies(companiesMap);

        /* ----- weeklyTrips (SANS where !) ----- */
        const tripsSnap = await getDocs(collectionGroup(db, 'weeklyTrips'));

        const grouped: Record<string, Trajet[]> = {};
        const depNorm = normalize(criteres.departure);
        const arrNorm = normalize(criteres.arrival);

        tripsSnap.forEach((docSnap) => {
          const data = docSnap.data() as any;

          if (
            normalize(data.departure) !== depNorm ||
            normalize(data.arrival) !== arrNorm
          ) {
            return;
          }

          // path: companies/{companyId}/agences/{agencyId}/weeklyTrips/{id}
          const companyId = docSnap.ref.path.split('/')[1];

          (grouped[companyId] ||= []).push({
            id: docSnap.id,
            companyId,
            departure: data.departure,
            arrival: data.arrival,
            price: data.price,
            places: data.places || 0,
          });
        });

        setGroupedTrajets(grouped);

        /* =========================
           AJOUT: Chargement des réservations
        ========================= */
        const reservationsSnap = await getDocs(collectionGroup(db, 'reservations'));

        const reservedMap: Record<string, number> = {};

        reservationsSnap.forEach((doc) => {
          const r = doc.data() as Reservation;

          // on ne compte que les réservations actives
          if (!['en_attente', 'payé', 'preuve_recue'].includes(r.statut)) return;

          const key = `${r.companyId}_${r.weeklyTripId}`;
          reservedMap[key] = (reservedMap[key] || 0) + (r.places || 0);
        });

        setReservedPlacesMap(reservedMap);

      } catch (err) {
        console.error('❌ Erreur recherche plateforme:', err);
        setGroupedTrajets({});
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [criteres?.departure, criteres?.arrival]);

  /* ---------- filtre compagnies ---------- */
  const filteredCompanyIds = useMemo(() => {
    const ids = Object.keys(groupedTrajets);
    if (!filter.trim()) return ids;
    return ids.filter((id) =>
      companies[id]?.nom?.toLowerCase().includes(filter.toLowerCase())
    );
  }, [groupedTrajets, companies, filter]);

  /* =========================
     UI
  ========================= */
  if (!criteres) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Paramètres manquants</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* HEADER */}
      <header className="bg-white shadow sticky top-0 z-50">
        <div className="max-w-5xl mx-auto flex items-center justify-between px-4 py-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center text-orange-600 hover:text-orange-700 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-1" />
            Retour
          </button>
          <span className="font-bold text-orange-600 text-xl">Teliya</span>
          <div className="w-10"></div> {/* Pour équilibrer la flexbox */}
        </div>
      </header>

      {/* ROUTE */}
      <div className="max-w-5xl mx-auto px-4 mt-6">
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
          <span className="px-3 py-1.5 rounded-xl bg-orange-50 border border-orange-100 font-semibold truncate">
            {capitalize(criteres.departure)}
          </span>
          <ArrowRight className="text-gray-400" />
          <span className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 font-semibold truncate text-right">
            {capitalize(criteres.arrival)}
          </span>
        </div>

        <div className="relative mt-4 sm:w-[320px] sm:ml-auto">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrer par compagnie"
            className="pl-9 border border-gray-300 rounded-lg py-2 px-3 text-sm w-full focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* RESULTS */}
      <div className="max-w-5xl mx-auto p-4 pb-8">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="h-10 w-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredCompanyIds.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">
              Aucune compagnie disponible pour ce trajet
            </p>
            <button
              onClick={() => navigate('/')}
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-2 rounded-lg transition-colors"
            >
              Nouvelle recherche
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredCompanyIds.map((companyId) => {
              const company = companies[companyId];
              const trajets = groupedTrajets[companyId];
              const prixMin = Math.min(...trajets.map((t) => t.price));

              return (
                <div
                  key={companyId}
                  className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 hover:shadow-md transition-shadow"
                >
                  {/* Mobile layout (stacked) */}
                  <div className="block md:hidden">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {company?.logoUrl ? (
                          <img
                            src={company.logoUrl}
                            alt={company.nom}
                            className="w-12 h-12 rounded-full object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full grid place-items-center bg-orange-50 border border-orange-100">
                            <Bus className="text-orange-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3
                            className="font-semibold truncate"
                            style={{
                              color: company?.couleurPrimaire || 'rgb(234,88,12)',
                            }}
                          >
                            {company?.nom}
                          </h3>
                          {/* Services icons - Mobile */}
                          <div className="flex items-center gap-2 mt-1.5">
                            {serviceIcons.slice(0, 4).map((service, index) => {
                              const Icon = service.icon;
                              return (
                                <div
                                  key={index}
                                  className={`${service.color} p-1 rounded-full bg-gray-50`}
                                  title={service.label}
                                >
                                  <Icon className="w-3.5 h-3.5" />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                      <div className="text-emerald-600 font-bold text-lg">
                        {prixMin.toLocaleString()} FCFA
                      </div>
                      <button
                        onClick={() =>
                          navigate(
                            `/${company.slug}/booking?departure=${encodeURIComponent(
                              criteres.departure
                            )}&arrival=${encodeURIComponent(
                              criteres.arrival
                            )}`
                          )
                        }
                        className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2.5 rounded-lg text-sm font-medium transition-colors"
                      >
                        Réserver
                      </button>
                    </div>
                  </div>

                  {/* Desktop layout (side by side) */}
                  <div className="hidden md:flex items-center justify-between">
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      {company?.logoUrl ? (
                        <img
                          src={company.logoUrl}
                          alt={company.nom}
                          className="w-14 h-14 rounded-full object-cover border border-gray-200"
                        />
                      ) : (
                        <div className="w-14 h-14 rounded-full grid place-items-center bg-orange-50 border border-orange-100">
                          <Bus className="text-orange-500" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3
                          className="font-semibold text-lg truncate"
                          style={{
                            color: company?.couleurPrimaire || 'rgb(234,88,12)',
                          }}
                        >
                          {company?.nom}
                        </h3>
                        {/* Services icons - Desktop */}
                        <div className="flex items-center gap-2 mt-2">
                          {serviceIcons.map((service, index) => {
                            const Icon = service.icon;
                            return (
                              <div
                                key={index}
                                className={`${service.color} p-1.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors`}
                                title={service.label}
                              >
                                <Icon className="w-4 h-4" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-emerald-600 font-bold text-xl">
                          {prixMin.toLocaleString()} FCFA
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">À partir de</div>
                      </div>
                      <button
                        onClick={() =>
                          navigate(
                            `/${company.slug}/booking?departure=${encodeURIComponent(
                              criteres.departure
                            )}&arrival=${encodeURIComponent(
                              criteres.arrival
                            )}`
                          )
                        }
                        className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        Réserver
                      </button>
                    </div>
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
