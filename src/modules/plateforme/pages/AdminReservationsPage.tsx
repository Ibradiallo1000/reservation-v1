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
    <div className="p-6">
      <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
        <AlertTriangle className="h-6 w-6 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-amber-800">Page dépréciée</p>
          <p className="text-sm text-amber-700 mt-1">
            Cette page affiche des détails par compagnie. Teliya ne gère pas les opérations transport.
            Les indicateurs macro sont disponibles sur le tableau de bord admin.
          </p>
        </div>
      </div>
      <h1 className="text-2xl font-bold mb-4">Statistiques des Réservations</h1>
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-4 py-2">Compagnie</th>
              <th className="border px-4 py-2">Nombre total</th>
              <th className="border px-4 py-2">Montant total</th>
              <th className="border px-4 py-2">Statuts</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s, i) => (
              <tr key={i}>
                <td className="border px-4 py-2 font-semibold">{s.company}</td>
                <td className="border px-4 py-2 text-center">{s.totalReservations}</td>
                <td className="border px-4 py-2">{formatCurrency(s.totalAmount)}</td>
                <td className="border px-4 py-2">
                  {Object.entries(s.byStatus).map(([status, count]) => (
                    <p key={status}>{status} : {count}</p>
                  ))}
                </td>
              </tr>
            ))}
            {stats.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center p-4 text-gray-500">
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
