// ✅ src/pages/AgenceFinancesPage.tsx — version compatible structure imbriquée Firestore

import React, { useEffect, useState } from 'react';
import { Timestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/shared/ui/button';

const AgenceFinancesPage: React.FC = () => {
  const { user } = useAuth();
  const money = useFormatCurrency();
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
    if (!user?.companyId || !user?.agencyId) return;

    const start = getStartDate();
    const q = query(
      collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'reservations'),
      where('createdAt', '>=', start),
      where('statut', '==', 'payé')
    );
    const snap = await getDocs(q);
    const total = snap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0);
    setRevenu(total);
    setNombre(snap.size);
  };

  useEffect(() => {
    fetchStats();
  }, [periode, user]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">État financier de l'agence</h2>

      <div className="flex gap-4 mb-4">
        <Button
          variant={periode === 'jour' ? 'primary' : 'secondary'}
          onClick={() => setPeriode('jour')}
        >
          Aujourd'hui
        </Button>
        <Button
          variant={periode === 'semaine' ? 'primary' : 'secondary'}
          onClick={() => setPeriode('semaine')}
        >
          7 derniers jours
        </Button>
        <Button
          variant={periode === 'mois' ? 'primary' : 'secondary'}
          onClick={() => setPeriode('mois')}
        >
          Ce mois-ci
        </Button>
      </div>

      <div className="bg-white p-6 rounded shadow border">
        <p className="text-lg">Revenu total : <span className="font-bold text-green-700">{money(revenu)}</span></p>
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
