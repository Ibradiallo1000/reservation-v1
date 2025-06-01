
// ✅ src/pages/EquilibrePage.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

const EquilibrePage: React.FC = () => {
  const { user } = useAuth();
  const [recettes, setRecettes] = useState(0);
  const [depenses, setDepenses] = useState(0);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.companyId) return;

      // Recettes
      const recettesSnap = await getDocs(
        query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé'))
      );
      const totalRecettes = recettesSnap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0);
      setRecettes(totalRecettes);

      // Dépenses
      const depensesSnap = await getDocs(
        query(collection(db, 'depenses'), where('companyId', '==', user.companyId))
      );
      const totalDepenses = depensesSnap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0);
      setDepenses(totalDepenses);

      // Balance
      setBalance(totalRecettes - totalDepenses);
    };

    fetchData();
  }, [user]);

  return (
    <div className="p-4 bg-white rounded shadow">
      <h2 className="text-lg font-semibold mb-2">📊 Équilibre financier</h2>
      <div className="text-sm text-gray-600 mb-4">
        Cette section affiche le résultat net de la compagnie : recettes totales - dépenses totales.
      </div>
      <ul className="text-sm space-y-2">
        <li>💰 Recettes totales : <span className="font-semibold text-green-600">{recettes.toLocaleString()} FCFA</span></li>
        <li>📤 Dépenses totales : <span className="font-semibold text-red-500">{depenses.toLocaleString()} FCFA</span></li>
        <li>🧾 Résultat net : <span className={`font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`}>{balance.toLocaleString()} FCFA</span></li>
      </ul>
    </div>
  );
};

export default EquilibrePage;
