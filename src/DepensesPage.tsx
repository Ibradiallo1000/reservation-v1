// ✅ src/pages/DepensesPage.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { useAuth } from './contexts/AuthContext';
import { formatCurrency } from '@/shared/utils/formatCurrency';

const DepensesPage: React.FC = () => {
  const { user } = useAuth();
  const [depenses, setDepenses] = useState<any[]>([]);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const fetchDepenses = async () => {
      if (!user?.companyId) return;

      const q = query(collection(db, 'depenses'), where('companyId', '==', user.companyId));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => doc.data());
      setDepenses(data);

      const totalDepenses = data.reduce((sum, d) => sum + (d.montant || 0), 0);
      setTotal(totalDepenses);
    };

    fetchDepenses();
  }, [user]);

  return (
    <div className="p-6 bg-white rounded shadow">
      <h2 className="text-lg font-semibold mb-2">📤 Dépenses</h2>
      <p className="text-sm text-gray-600 mb-4">
        Total des dépenses : <span className="font-bold text-red-600">{formatCurrency(total)}</span>
      </p>

      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Date</th>
            <th className="border p-2">Description</th>
            <th className="border p-2">Montant</th>
          </tr>
        </thead>
        <tbody>
          {depenses.length === 0 ? (
            <tr>
              <td colSpan={3} className="text-center text-gray-500 p-4">Aucune dépense enregistrée.</td>
            </tr>
          ) : (
            depenses.map((d, i) => (
              <tr key={i}>
                <td className="border p-2">{d.date || '-'}</td>
                <td className="border p-2">{d.description || '-'}</td>
                <td className="border p-2 text-right">{formatCurrency(d.montant ?? 0)}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default DepensesPage;
