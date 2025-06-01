
// ✅ src/pages/RecettesPage.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

const RecettesPage: React.FC = () => {
  const { user } = useAuth();
  const [recettes, setRecettes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchRecettes = async () => {
      if (!user?.companyId) return;
      const q = query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => doc.data());
      setRecettes(data);
      const totalMontant = data.reduce((sum, r) => sum + (r.montant || 0), 0);
      setTotal(totalMontant);
    };
    fetchRecettes();
  }, [user]);

  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">📥 Recettes</h2>
      <p className="text-sm text-gray-600 mb-4">Total encaissé : <span className="font-bold text-green-600">{total.toLocaleString()} FCFA</span></p>
      <table className="w-full text-sm border-collapse">
        <thead className="bg-gray-100">
          <tr>
            <th className="border p-2">Date</th>
            <th className="border p-2">Nom</th>
            <th className="border p-2">Montant</th>
            <th className="border p-2">Canal</th>
          </tr>
        </thead>
        <tbody>
          {recettes.map((r, i) => (
            <tr key={i}>
              <td className="border p-2">{r.date}</td>
              <td className="border p-2">{r.nomClient}</td>
              <td className="border p-2">{r.montant?.toLocaleString()} FCFA</td>
              <td className="border p-2">{r.canal}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default RecettesPage;
