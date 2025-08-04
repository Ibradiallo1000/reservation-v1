import React, { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { FaChevronLeft, FaChevronRight, FaFilter, FaDownload, FaPrint } from 'react-icons/fa';
import { saveAs } from 'file-saver';

interface Reservation {
  id: string;
  agencyId: string;
  nomClient: string;
  telephone: string;
  montant?: number;
  canal: string;
  statut: string;
  depart?: string;
  arrivee?: string;
  createdAt?: any;
}

interface Agence {
  id: string;
  nom: string;
}

const CompagnieReservationsPage: React.FC = () => {
  const { user } = useAuth();

  const [agences, setAgences] = useState<Agence[]>([]);
  const [groupedData, setGroupedData] = useState<
    { agencyId: string; reservations: Reservation[] }[]
  >([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(null);
  const [loading, setLoading] = useState({ agences: true, reservations: true });
  const [showFilters, setShowFilters] = useState(false);

  // Filtres
  const [filterDepart, setFilterDepart] = useState('');
  const [filterArrivee, setFilterArrivee] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [filterCanal, setFilterCanal] = useState<string>('tous');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 10;

  const loadAgences = async () => {
  if (!user?.companyId) return;
  try {
    const agencesSnap = await getDocs(
      collection(db, 'companies', user.companyId, 'agences')
    );
    const data = agencesSnap.docs.map(doc => ({
      id: doc.id,
      nom: doc.data().ville || doc.data().nom,
    }));
    setAgences(data);
  } finally {
    setLoading(prev => ({ ...prev, agences: false }));
  }
};

const loadReservations = async () => {
  if (!user?.companyId) return;
  try {
    const agencesSnap = await getDocs(
      collection(db, 'companies', user.companyId, 'agences')
    );
    const agencesList = agencesSnap.docs.map(doc => ({
      id: doc.id,
      nom: doc.data().ville || doc.data().nom,
    }));
    setAgences(agencesList);

    const all: Reservation[] = [];

    for (const agence of agencesList) {
      const resRef = collection(db, 'companies', user.companyId, 'agences', agence.id, 'reservations');
      const snap = await getDocs(resRef); // tu peux filtrer par statut ici si besoin
      const data = snap.docs.map(doc => ({
        id: doc.id,
        agencyId: agence.id,
        nomClient: doc.data().nomClient,
        telephone: doc.data().telephone,
        montant: doc.data().montant || 0,
        canal: doc.data().canal || '',
        statut: doc.data().statut,
        depart: doc.data().depart || '',
        arrivee: doc.data().arrivee || '',
        createdAt: doc.data().createdAt?.toDate() || null,
      }));
      all.push(...data);
    }

    // Grouper
    const groups: { [key: string]: Reservation[] } = {};
    all.forEach(r => {
      if (!groups[r.agencyId]) groups[r.agencyId] = [];
      groups[r.agencyId].push(r);
    });

    const grouped = Object.keys(groups).map(agencyId => ({
      agencyId,
      reservations: groups[agencyId],
    }));

    setGroupedData(grouped);
  } finally {
    setLoading(prev => ({ ...prev, reservations: false }));
  }
};

  useEffect(() => {
    loadAgences();
    loadReservations();
  }, [user]);

  const findAgencyName = (id: string) => {
    const found = agences.find(a => a.id === id);
    return found ? found.nom : 'Agence inconnue';
  };

  const filteredDetails = () => {
    let data = groupedData.find(g => g.agencyId === selectedAgencyId)?.reservations || [];
    
    if (filterDepart)
      data = data.filter(r => r.depart?.toLowerCase().includes(filterDepart.toLowerCase()));
    if (filterArrivee)
      data = data.filter(r => r.arrivee?.toLowerCase().includes(filterArrivee.toLowerCase()));
    if (filterStart)
      data = data.filter(r => r.createdAt && new Date(r.createdAt) >= new Date(filterStart));
    if (filterEnd)
      data = data.filter(r => r.createdAt && new Date(r.createdAt) <= new Date(filterEnd));
    if (filterCanal !== 'tous')
      data = data.filter(r => r.canal.toLowerCase() === filterCanal.toLowerCase());
    
    return data;
  };

  const paginated = filteredDetails().slice(
    (currentPage - 1) * perPage,
    currentPage * perPage
  );

  const totalPages = Math.ceil(filteredDetails().length / perPage);

  const exportToCSV = () => {
    const data = filteredDetails();
    if (data.length === 0) return;

    const csvHeader = 'Nom,Téléphone,Départ,Arrivée,Canal,Montant,Date\n';
    const csvRows = data.map(r =>
      [
        `"${r.nomClient}"`,
        r.telephone,
        `"${r.depart}"`,
        `"${r.arrivee}"`,
        r.canal,
        r.montant || 0,
        r.createdAt ? new Date(r.createdAt).toLocaleDateString() : ''
      ].join(',')
    ).join('\n');

    const csvContent = csvHeader + csvRows;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, `reservations-${findAgencyName(selectedAgencyId || '')}-${new Date().toISOString().split('T')[0]}.csv`);
  };

  const totalMontant = filteredDetails().reduce((sum, r) => sum + (r.montant || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Gestion des Réservations</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-4 py-2 bg-white border rounded-lg text-gray-700 hover:bg-gray-50"
            >
              <FaFilter className="mr-2" />
              Filtres
            </button>
            {selectedAgencyId && (
              <>
                <button
                  onClick={exportToCSV}
                  disabled={filteredDetails().length === 0}
                  className="flex items-center px-4 py-2 bg-white border rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  <FaDownload className="mr-2" />
                  Exporter
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <FaPrint className="mr-2" />
                  Imprimer
                </button>
              </>
            )}
          </div>
        </div>

        {loading.agences || loading.reservations ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {groupedData.map(group => {
                const total = group.reservations.reduce((sum, r) => sum + (r.montant || 0), 0);
                return (
                  <div
                    key={group.agencyId}
                    onClick={() => {
                      setSelectedAgencyId(selectedAgencyId === group.agencyId ? null : group.agencyId);
                      setCurrentPage(1);
                      setFilterDepart('');
                      setFilterArrivee('');
                      setFilterStart('');
                      setFilterEnd('');
                    }}
                    className={`p-6 bg-white rounded-xl shadow-sm border transition-all cursor-pointer hover:shadow-md ${
                      selectedAgencyId === group.agencyId ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'
                    }`}
                  >
                    <h2 className="font-bold text-lg text-gray-800 mb-2">
                      {findAgencyName(group.agencyId)}
                    </h2>
                    <div className="flex justify-between text-sm text-gray-600">
                      <span>{group.reservations.length} réservations</span>
                      <span className="font-medium">{total.toLocaleString()} FCFA</span>
                    </div>
                    <div className="mt-4 h-2 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${Math.min(100, (group.reservations.length / 50) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedAgencyId && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xl font-semibold text-gray-800">
                      {findAgencyName(selectedAgencyId)}
                      <span className="ml-2 text-sm font-normal text-gray-500">
                        ({filteredDetails().length} réservations - {totalMontant.toLocaleString()} FCFA)
                      </span>
                    </h3>
                  </div>

                  {showFilters && (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Départ</label>
                        <input
                          placeholder="Filtrer par départ"
                          value={filterDepart}
                          onChange={e => setFilterDepart(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Arrivée</label>
                        <input
                          placeholder="Filtrer par arrivée"
                          value={filterArrivee}
                          onChange={e => setFilterArrivee(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date début</label>
                        <input
                          type="date"
                          value={filterStart}
                          onChange={e => setFilterStart(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Date fin</label>
                        <input
                          type="date"
                          value={filterEnd}
                          onChange={e => setFilterEnd(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Canal</label>
                        <select
                          value={filterCanal}
                          onChange={e => setFilterCanal(e.target.value)}
                          className="w-full p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="tous">Tous les canaux</option>
                          <option value="guichet">Guichet</option>
                          <option value="en ligne">En ligne</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Téléphone</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trajet</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Canal</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Montant</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {paginated.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                            {Object.values({
                              filterDepart,
                              filterArrivee,
                              filterStart,
                              filterEnd,
                              filterCanal
                            }).some(Boolean) 
                              ? "Aucune réservation ne correspond aux filtres" 
                              : "Aucune réservation trouvée"}
                          </td>
                        </tr>
                      ) : (
                        paginated.map(r => (
                          <tr key={r.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{r.nomClient}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.telephone}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              <span className="font-medium">{r.depart}</span> → <span className="font-medium">{r.arrivee}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                r.canal === 'guichet' 
                                  ? 'bg-blue-100 text-blue-800' 
                                  : 'bg-green-100 text-green-800'
                              }`}>
                                {r.canal}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{r.montant?.toLocaleString()} FCFA</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {r.createdAt ? new Date(r.createdAt).toLocaleDateString('fr-FR') : ''}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {filteredDetails().length > perPage && (
                  <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                      className="flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      <FaChevronLeft className="mr-1" />
                      Précédent
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {currentPage} sur {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => prev + 1)}
                      disabled={currentPage === totalPages}
                      className="flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                    >
                      Suivant
                      <FaChevronRight className="ml-1" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CompagnieReservationsPage;