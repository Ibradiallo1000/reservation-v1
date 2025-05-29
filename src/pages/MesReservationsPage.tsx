// ✅ MesReservationsPage.tsx – amélioré pour affichage client

import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

const MesReservationsPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reservations, setReservations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchReservations = async () => {
      if (!user) return;
      setLoading(true);

      const reservationsRef = collection(db, 'reservations');
      const reservationsQuery = query(reservationsRef, where('clientId', '==', user.uid));
      const reservationsSnapshot = await getDocs(reservationsQuery);
      const data = reservationsSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      setReservations(data);
      setLoading(false);
    };

    fetchReservations();
  }, [user]);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-6">Mes Réservations</h1>
      {loading ? (
        <p>Chargement...</p>
      ) : (
        <div className="overflow-auto rounded-lg shadow">
          <table className="min-w-full bg-white text-sm">
            <thead className="bg-gray-100 text-left">
              <tr>
                <th className="p-3">Trajet</th>
                <th className="p-3">Date & Heure</th>
                <th className="p-3">Places</th>
                <th className="p-3">Montant</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((r) => (
                <tr key={r.id} className="border-t hover:bg-gray-50">
                  <td className="p-3 font-semibold">{r.depart} → {r.arrivee}</td>
                  <td className="p-3 text-blue-700">{dayjs(r.date).format('DD/MM/YYYY')} à {r.heure}</td>
                  <td className="p-3">{r.nombre_places}</td>
                  <td className="p-3">{r.montant_total?.toLocaleString()} FCFA</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-white text-xs ${
                      r.statut === 'payée' ? 'bg-green-600' :
                      r.statut === 'en attente' ? 'bg-yellow-500' :
                      'bg-red-600'}
                    `}>
                      {r.statut}
                    </span>
                  </td>
                  <td className="p-3 flex gap-2">
                    <button
                      onClick={() => navigate(`/reservation/${r.id}`)}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Voir
                    </button>
                    {dayjs().isBefore(dayjs(`${r.date}T${r.heure}`)) && (
                      <button
                        onClick={() => navigate(`/modifier-reservation/${r.id}`)}
                        className="text-orange-600 hover:underline text-sm"
                      >
                        Modifier
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {reservations.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-gray-500">Aucune réservation trouvée</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default MesReservationsPage;
