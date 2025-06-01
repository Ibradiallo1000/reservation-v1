// ✅ src/pages/StatistiquesFinancieresPage.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';

interface DonneeMensuelle {
  mois: string;
  recettes: number;
  depenses: number;
  solde: number;
}

const StatistiquesFinancieresPage: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<DonneeMensuelle[]>([]);
  const [loading, setLoading] = useState(true);

  const moisLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.companyId) return;

      const recettesSnap = await getDocs(
        query(collection(db, 'recettes'), where('companyId', '==', user.companyId))
      );
      const depensesSnap = await getDocs(
        query(collection(db, 'depenses'), where('companyId', '==', user.companyId))
      );

      const stats: Record<number, DonneeMensuelle> = {};

      for (let i = 0; i < 12; i++) {
        stats[i] = {
          mois: moisLabels[i],
          recettes: 0,
          depenses: 0,
          solde: 0,
        };
      }

      recettesSnap.forEach(doc => {
        const data = doc.data();
        const date = new Date(data.date?.toDate?.() || data.date);
        const mois = date.getMonth();
        stats[mois].recettes += data.montant || 0;
      });

      depensesSnap.forEach(doc => {
        const data = doc.data();
        const date = new Date(data.date?.toDate?.() || data.date);
        const mois = date.getMonth();
        stats[mois].depenses += data.montant || 0;
      });

      for (let i = 0; i < 12; i++) {
        stats[i].solde = stats[i].recettes - stats[i].depenses;
      }

      setData(Object.values(stats));
      setLoading(false);
    };

    fetchData();
  }, [user]);

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-6">📈 Statistiques financières mensuelles</h1>

      {loading ? (
        <p className="text-gray-600">Chargement...</p>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mois" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="recettes" fill="#34d399" name="Recettes" />
            <Bar dataKey="depenses" fill="#f87171" name="Dépenses" />
            <Bar dataKey="solde" fill="#facc15" name="Solde" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};

export default StatistiquesFinancieresPage;
