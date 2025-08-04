import React, { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import ModifierReservationForm from './ModifierReservationForm';
import { useNavigate, useParams } from 'react-router-dom';

interface Reservation {
  id: string;
  nomClient: string;
  telephone: string;
  depart: string;
  arrivee: string;
  date: string;
  heure: string;
  canal: string;
  montant?: number;
  statut: string;
  statutEmbarquement?: string;
}

const ITEMS_PER_PAGE = 15;

const AgenceReservationsPage: React.FC = () => {
  const { user, company } = useAuth();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [dateFiltre, setDateFiltre] = useState('');
  const [heureFiltre, setHeureFiltre] = useState('');
  const [trajetFiltre, setTrajetFiltre] = useState('');
  const [canalFiltre, setCanalFiltre] = useState('');
  const [page, setPage] = useState(1);
  const [reservationAModifier, setReservationAModifier] = useState<Reservation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const { id: agencyIdFromURL } = useParams();

  useEffect(() => {
    if (!user?.companyId) return;
    const agencyId = agencyIdFromURL || user?.agencyId;
    if (!agencyId) return;

    const q = query(
      collection(db, 'companies', user.companyId, 'agences', agencyId, 'reservations'),
      where('statut', '==', 'payé')
    );

    const unsubscribe = onSnapshot(q, snapshot => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reservation[];
      setReservations(data);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [user?.companyId, user?.agencyId, agencyIdFromURL]);

  const filteredReservations = useMemo(() => {
    return reservations.filter((res) => {
      const matchDate = dateFiltre ? res.date === dateFiltre : true;
      const matchHeure = heureFiltre ? res.heure === heureFiltre : true;
      const matchTrajet = trajetFiltre
        ? `${res.depart.toLowerCase()}-${res.arrivee.toLowerCase()}`.includes(trajetFiltre.toLowerCase())
        : true;
      const matchCanal = canalFiltre ? res.canal === canalFiltre : true;
      return matchDate && matchHeure && matchTrajet && matchCanal;
    });
  }, [reservations, dateFiltre, heureFiltre, trajetFiltre, canalFiltre]);

  const paginatedReservations = useMemo(() => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return filteredReservations.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredReservations, page]);

  const handleImpression = () => {
    navigate('impression-reservations', {
      state: {
        reservations: filteredReservations,
        date: dateFiltre,
        heure: heureFiltre,
        trajet: trajetFiltre,
        agencyName: user?.agencyName,
        logoUrl: company?.logoUrl,
        companyName: company?.nom,
      },
    });
  };

  const today = format(new Date(), 'dd/MM/yyyy');

  const theme = {
    primary: company?.couleurPrimaire || '#06b6d4',
    secondary: company?.couleurSecondaire || '#8b5cf6',
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 text-gray-800">
      {/* En-tête */}
      <div className="mb-8 p-6 rounded-xl bg-white shadow-md border border-gray-200">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="flex items-center gap-4">
            {company?.logoUrl && (
              <img src={company.logoUrl} alt="logo" className="h-12 w-12 rounded-full object-contain" />
            )}
            <div>
              <h1 className="text-3xl font-bold" style={{ color: theme.primary }}>
                {company?.nom || 'Compagnie de Transport'}
              </h1>
              <p className="text-sm text-gray-500">
                {user?.agencyName} • {today}
              </p>
            </div>
          </div>
          <button
            onClick={handleImpression}
            className="mt-4 md:mt-0 px-6 py-2 text-white font-semibold rounded-lg shadow-md hover:opacity-90 transition-all"
            style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}
          >
            🖨️ Imprimer la liste
          </button>
        </div>
      </div>

      {/* Tableau */}
      <div className="rounded-xl bg-white shadow-md border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ backgroundColor: theme.secondary, color: '#fff' }}>
                <th className="p-4 text-left font-semibold">#</th>
                <th className="p-4 text-left font-semibold">Client</th>
                <th className="p-4 text-left font-semibold">Contact</th>
                <th className="p-4 text-left font-semibold">Trajet</th>
                <th className="p-4 text-left font-semibold">Date</th>
                <th className="p-4 text-left font-semibold">Heure</th>
                <th className="p-4 text-left font-semibold">Canal</th>
                <th className="p-4 text-left font-semibold">Statut Embarquement</th>
                <th className="p-4 text-right font-semibold">Montant</th>
                <th className="p-4 text-center font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center">Chargement...</td>
                </tr>
              ) : paginatedReservations.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-gray-400">Aucune réservation trouvée</td>
                </tr>
              ) : (
                paginatedReservations.map((res, i) => (
                  <tr key={res.id} className="border-t border-gray-200 hover:bg-gray-50 transition">
                    <td className="p-4">{(page - 1) * ITEMS_PER_PAGE + i + 1}</td>
                    <td className="p-4">{res.nomClient}</td>
                    <td className="p-4 text-cyan-600">{res.telephone}</td>
                    <td className="p-4">{res.depart} → {res.arrivee}</td>
                    <td className="p-4">{format(new Date(res.date), 'dd/MM/yyyy')}</td>
                    <td className="p-4">{res.heure}</td>
                    <td className="p-4">
                      {res.canal === 'guichet' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Guichet
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          En ligne
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          res.statutEmbarquement === "embarqué"
                            ? "bg-green-100 text-green-700"
                            : res.statutEmbarquement === "absent"
                            ? "bg-red-100 text-red-700"
                            : res.statutEmbarquement === "reporté"
                            ? "bg-yellow-100 text-yellow-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {res.statutEmbarquement || "En attente"}
                      </span>
                    </td>
                    <td className="p-4 text-right">{res.montant?.toLocaleString()} FCFA</td>
                    <td className="p-4 text-center flex justify-center gap-2">
                      <button
                        onClick={() => navigate(`/agence/receipt/${res.id}`)}
                        className="text-green-600 hover:text-green-500 font-medium"
                      >
                        Voir
                      </button>
                      <button
                        onClick={() => setReservationAModifier(res)}
                        className="text-cyan-600 hover:text-cyan-500 font-medium"
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AgenceReservationsPage;
