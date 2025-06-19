import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface SearchCriteria {
  departure: string;
  arrival: string;
}

interface Company {
  id: string;
  nom: string;
  logoUrl: string;
  rating?: number;
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
}

const PlatformSearchResultsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const criteres = location.state as SearchCriteria | null;

  const [groupedTrajets, setGroupedTrajets] = useState<Record<string, Trajet[]>>({});
  const [companies, setCompanies] = useState<Record<string, Company>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (!criteres?.departure || !criteres?.arrival) {
      navigate('/');
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        // 1. Fetch all companies first
        const companiesSnapshot = await getDocs(collection(db, 'companies'));
        const companiesMap = companiesSnapshot.docs.reduce((acc, doc) => {
          acc[doc.id] = { id: doc.id, ...doc.data() } as Company;
          return acc;
        }, {} as Record<string, Company>);
        setCompanies(companiesMap);

        // 2. Fetch trips with capitalised cities
        const capitalize = (text: string) => 
          text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
        
        const dep = capitalize(criteres.departure);
        const arr = capitalize(criteres.arrival);

        const q = query(
          collection(db, 'dailyTrips'),
          where('departure', '==', dep),
          where('arrival', '==', arr)
        );

        const trajetsSnapshot = await getDocs(q);
        const now = new Date();
        const grouped: Record<string, Trajet[]> = {};

        trajetsSnapshot.forEach((doc) => {
          const data = doc.data();
          const tripDate = new Date(`${data.date}T${data.time}`);
          
          if (tripDate > now) {
            const trajet = {
              id: doc.id,
              ...data,
            } as Trajet;

            if (!grouped[trajet.companyId]) {
              grouped[trajet.companyId] = [];
            }
            grouped[trajet.companyId].push(trajet);
          }
        });

        // Sort trips by time for each company
        Object.values(grouped).forEach(trajets => {
          trajets.sort((a, b) => {
            const timeA = a.time.split(':').map(Number);
            const timeB = b.time.split(':').map(Number);
            return timeA[0] * 60 + timeA[1] - (timeB[0] * 60 + timeB[1]);
          });
        });

        setGroupedTrajets(grouped);
      } catch (err) {
        console.error('Erreur Firestore :', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [criteres, navigate]);

  if (!criteres?.departure || !criteres?.arrival) {
    return null;
  }

  const filteredCompanies = Object.keys(groupedTrajets)
    .filter(companyId => {
      const company = companies[companyId];
      return company?.nom.toLowerCase().includes(filter.toLowerCase());
    })
    .sort((a, b) => {
      // Sort by minimum price
      const minPriceA = Math.min(...groupedTrajets[a].map(t => t.price));
      const minPriceB = Math.min(...groupedTrajets[b].map(t => t.price));
      return minPriceA - minPriceB;
    });

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          {criteres.departure} → {criteres.arrival}
        </h1>
        <input
          type="text"
          placeholder="Filtrer par compagnie..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 w-64 text-sm"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-green-500"></div>
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500 text-lg">Aucune compagnie disponible pour ce trajet</p>
          <button 
            onClick={() => navigate('/')}
            className="mt-4 bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 text-sm"
          >
            Nouvelle recherche
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCompanies.map((companyId) => {
            const company = companies[companyId] || { 
              nom: 'Compagnie inconnue', 
              logoUrl: '',
              rating: 4.0
            };
            const trajets = groupedTrajets[companyId];
            const prixMin = Math.min(...trajets.map(t => t.price));
            const prixMax = Math.max(...trajets.map(t => t.price));

            return (
              <div 
                key={companyId} 
                className="flex justify-between items-center border p-4 rounded-lg hover:shadow-md transition-shadow bg-white"
              >
                <div className="flex items-center space-x-4 flex-1">
                  {company.logoUrl && (
                    <img 
                      src={company.logoUrl} 
                      alt={company.nom} 
                      className="w-12 h-12 rounded-full object-cover border"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <h3 className="font-semibold">{company.nom}</h3>
                      {company.rating && (
                        <span className="flex items-center text-sm text-gray-500">
                          <span className="text-yellow-500">★</span> {company.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                      <span>{trajets.length} départs aujourd'hui</span>
                      <span>•</span>
                      <span>
                        {prixMin === prixMax ? (
                          `${prixMin.toLocaleString()} FCFA`
                        ) : (
                          `${prixMin.toLocaleString()} - ${prixMax.toLocaleString()} FCFA`
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => navigate(
                    `/compagnie/${company.nom.toLowerCase().replace(/\s+/g, '-')}/resultats?departure=${criteres.departure}&arrival=${criteres.arrival}`
                  )}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm whitespace-nowrap ml-4"
                >
                  Voir les horaires
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 text-center text-sm text-gray-500">
        <p>Prix affichés en Francs CFA (FCFA)</p>
        {/* Future currency selector can be added here */}
      </div>
    </div>
  );
};

export default PlatformSearchResultsPage;