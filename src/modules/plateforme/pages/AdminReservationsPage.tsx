/**
 * @deprecated Phase 1 – Cette page affiche des détails opérationnels par compagnie.
 * Teliya ne gère pas les opérations transport. Utiliser le tableau de bord admin
 * ou l'espace Compagnie pour les données réservations. Page conservée pour compatibilité.
 */
import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { formatCurrency } from "@/shared/utils/formatCurrency";
import { db } from '../../../firebaseConfig';
import { AlertTriangle } from 'lucide-react';

interface ReservationEntry {
  companySlug: string;
  date: string;
  status: string;
  total: number;
}

interface CompanyStats {
  company: string;
  totalReservations: number;
  totalAmount: number;
  byStatus: Record<string, number>;
}

const AdminReservationsPage: React.FC = () => {
  const [stats, setStats] = useState<CompanyStats[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const snapshot = await getDocs(collection(db, 'reservations'));
      const data: ReservationEntry[] = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          companySlug: d.trip?.company || '—',
          date: d.trip?.date || '',
          status: d.status || 'payée',
          total: d.total || 0,
        };
      });

      const grouped: Record<string, CompanyStats> = {};
      data.forEach((r) => {
        const company = r.companySlug;
        if (!grouped[company]) {
          grouped[company] = {
            company,
            totalReservations: 0,
            totalAmount: 0,
            byStatus: {},
          };
        }
        grouped[company].totalReservations++;
        grouped[company].totalAmount += r.total;
        grouped[company].byStatus[r.status] = (grouped[company].byStatus[r.status] || 0) + 1;
      });

      setStats(Object.values(grouped));
    };
    fetchData();
  }, []);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800 dark:text-amber-200">Page dépréciée</p>
          <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
            Cette page affiche des détails par compagnie. Teliya ne gère pas les opérations transport.
            Les indicateurs macro sont disponibles sur le tableau de bord admin.
          </p>
        </div>
      </div>
      <h1 className="text-xl sm:text-2xl font-bold mb-4 text-gray-900 dark:text-white">Statistiques des Réservations</h1>
      <div className="overflow-x-auto -mx-4 sm:mx-0">
        <table className="min-w-full table-auto border border-gray-200 dark:border-slate-600">
          <thead className="bg-gray-100 dark:bg-slate-700">
            <tr>
              <th className="border border-gray-200 dark:border-slate-600 px-4 py-2 text-left text-gray-900 dark:text-white">Compagnie</th>
              <th className="border border-gray-200 dark:border-slate-600 px-4 py-2 text-left text-gray-900 dark:text-white">Nombre total</th>
              <th className="border border-gray-200 dark:border-slate-600 px-4 py-2 text-left text-gray-900 dark:text-white">Montant total</th>
              <th className="border border-gray-200 dark:border-slate-600 px-4 py-2 text-left text-gray-900 dark:text-white">Statuts</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={i} className="border-b border-gray-200 dark:border-slate-600">
                <td className="border border-gray-200 dark:border-slate-600 px-4 py-2 font-semibold text-gray-900 dark:text-white">{s.company}</td>
                <td className="border border-gray-200 dark:border-slate-600 px-4 py-2 text-center text-gray-900 dark:text-slate-200">{s.totalReservations}</td>
                <td className="border border-gray-200 dark:border-slate-600 px-4 py-2 text-gray-900 dark:text-slate-200">{formatCurrency(s.totalAmount)}</td>
                <td className="border border-gray-200 dark:border-slate-600 px-4 py-2 text-gray-900 dark:text-slate-200">
                  {Object.entries(s.byStatus).map(([status, count]) => (
                    <p key={status}>{status} : {count}</p>
                  ))}
                </td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center p-4 text-gray-500 dark:text-slate-400">
                  Aucune donnée disponible.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminReservationsPage;
