// src/pages/CompagnieCourrierPage.tsx

import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

const CompagnieCourrierPage: React.FC = () => {
  const { user } = useAuth();
  const [courriers, setCourriers] = useState<any[]>([]);
  const [description, setDescription] = useState('');
  const [receiver, setReceiver] = useState('');
  const [departure, setDeparture] = useState('');
  const [arrival, setArrival] = useState('');
  const [loading, setLoading] = useState(false);

  const loadCourriers = async () => {
    if (!user?.companyId) return;
    const q = query(collection(db, 'courriers'), where('companyId', '==', user.companyId));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setCourriers(list);
  };

  const handleAddCourrier = async () => {
    if (!description || !receiver || !departure || !arrival || !user?.companyId) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'courriers'), {
        companyId: user.companyId,
        description,
        receiver,
        departure,
        arrival,
        status: 'En attente',
        createdAt: Timestamp.now()
      });
      setDescription('');
      setReceiver('');
      setDeparture('');
      setArrival('');
      await loadCourriers();
    } catch (err) {
      console.error('Erreur ajout courrier :', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCourriers();
  }, [user]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Gestion des courriers</h1>

      <div className="bg-white rounded-xl shadow p-4 mb-6">
        <h2 className="font-semibold text-lg mb-3">Ajouter un courrier</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="border p-2 rounded w-full"
          />
          <input
            type="text"
            placeholder="Destinataire"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            className="border p-2 rounded w-full"
          />
          <input
            type="text"
            placeholder="Ville de départ"
            value={departure}
            onChange={(e) => setDeparture(e.target.value)}
            className="border p-2 rounded w-full"
          />
          <input
            type="text"
            placeholder="Ville d’arrivée"
            value={arrival}
            onChange={(e) => setArrival(e.target.value)}
            className="border p-2 rounded w-full"
          />
        </div>
        <button
          onClick={handleAddCourrier}
          disabled={loading}
          className="mt-4 bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
        >
          {loading ? 'Ajout...' : 'Ajouter'}
        </button>
      </div>

      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold text-lg mb-3">Liste des courriers</h2>
        {courriers.length === 0 ? (
          <p className="text-gray-500">Aucun courrier enregistré.</p>
        ) : (
          <ul className="divide-y">
            {courriers.map((courrier) => (
              <li key={courrier.id} className="py-2">
                <div className="flex justify-between">
                  <div>
                    <p className="font-semibold">{courrier.description}</p>
                    <p className="text-sm text-gray-600">
                      {courrier.departure} → {courrier.arrival} | Destinataire : {courrier.receiver}
                    </p>
                  </div>
                  <span className="text-sm text-gray-500 italic">{courrier.status}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CompagnieCourrierPage;
