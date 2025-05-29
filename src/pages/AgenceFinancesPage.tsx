// ✅ Fichier : src/pages/AgenceFinancesPage.tsx

import React, { useEffect, useState } from 'react';
import { Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

const AgenceFinancesPage: React.FC = () => {
  const { user } = useAuth();
  const [periode, setPeriode] = useState<'jour' | 'semaine' | 'mois'>('jour');
  const [revenu, setRevenu] = useState(0);
  const [nombre, setNombre] = useState(0);

  const getStartDate = () => {
    const now = new Date();
    switch (periode) {
      case 'semaine':
        now.setDate(now.getDate() - 7);
        break;
      case 'mois':
        now.setDate(now.getDate() - 30);
        break;
      default:
        now.setHours(0, 0, 0, 0);
    }
    return Timestamp.fromDate(now);
  };

  const fetchStats = async () => {
    if (!user?.agencyId) return;

    const start = getStartDate();
    const q = query(
      collection(db, 'reservations'),
      where('agencyId', '==', user.agencyId),
      where('createdAt', '>=', start)
    );
    const snap = await getDocs(q);
    const total = snap.docs.reduce((sum, doc) => sum + (doc.data().prixTotal || 0), 0);
    setRevenu(total);
    setNombre(snap.size);
  };

  useEffect(() => {
    fetchStats();
  }, [periode, user]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">État financier de l’agence</h2>

      <div className="flex gap-4 mb-4">
        <button
          className={`px-4 py-2 rounded ${periode === 'jour' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          onClick={() => setPeriode('jour')}
        >
          Aujourd’hui
        </button>
        <button
          className={`px-4 py-2 rounded ${periode === 'semaine' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          onClick={() => setPeriode('semaine')}
        >
          7 derniers jours
        </button>
        <button
          className={`px-4 py-2 rounded ${periode === 'mois' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
          onClick={() => setPeriode('mois')}
        >
          Ce mois-ci
        </button>
      </div>

      <div className="bg-white p-6 rounded shadow border">
        <p className="text-lg">Revenu total : <span className="font-bold text-green-700">{revenu} FCFA</span></p>
        <p className="text-lg">Nombre de réservations : <span className="font-bold text-blue-700">{nombre}</span></p>
      </div>

      <div className="mt-4">
        <button
          onClick={() => window.print()}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Imprimer le résumé
        </button>
      </div>
    </div>
  );
};

export default AgenceFinancesPage;
