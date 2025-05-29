import { CSVLink } from 'react-csv';
import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format } from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface FinanceEntry {
  companyId: string;
  companySlug: string;
  total: number;
  commission: number;
}

const AdminFinancesPage: React.FC = () => {
  const [reservations, setReservations] = useState<any[]>([]);
  const [filtered, setFiltered] = useState<FinanceEntry[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      const snapshot = await getDocs(collection(db, 'reservations'));
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setReservations(data);
    };
    fetchData();
  }, []);

  useEffect(() => {
    const group: Record<string, FinanceEntry> = {};

    reservations.forEach(res => {
      const date = res.createdAt?.toDate?.() || new Date();
      const includeCompany = selectedCompany === 'all' || res.companyId === selectedCompany;
      const includeDate =
        (!startDate || new Date(startDate) <= date) &&
        (!endDate || date <= new Date(endDate));

      if (includeCompany && includeDate) {
        const companyId = res.companyId || 'inconnu';
        const companySlug = res.companySlug || '—';
        if (!group[companyId]) {
          group[companyId] = { companyId, companySlug, total: 0, commission: 0 };
        }
        group[companyId].total += res.total || 0;
        group[companyId].commission += res.commission || 0;
      }
    });

    setFiltered(Object.values(group));
  }, [reservations, selectedCompany, startDate, endDate]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Finances - Vue globale</h1>

      {/* Filtres */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <input
          type="date"
          value={startDate}
          onChange={e => setStartDate(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <input
          type="date"
          value={endDate}
          onChange={e => setEndDate(e.target.value)}
          className="border rounded px-2 py-1"
        />
        <select
          value={selectedCompany}
          onChange={e => setSelectedCompany(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Toutes les compagnies</option>
          {Array.from(new Set(reservations.map(r => r.companyId)))
            .filter(Boolean)
            .map((id, idx) => (
              <option key={idx} value={id}>
                {reservations.find(r => r.companyId === id)?.companySlug || id}
              </option>
            ))}
        </select>
      </div>

      {/* ✅ Graphique par compagnie */}
      {filtered.length > 0 && (
        <div className="w-full h-[350px] mb-6 bg-white p-4 rounded shadow">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={filtered.map(f => ({
              compagnie: f.companySlug,
              total: f.total,
              commission: f.commission,
              benefice: f.total - f.commission,
            }))}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="compagnie" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" fill="#4F46E5" name="Total" />
              <Bar dataKey="commission" fill="#F59E0B" name="Commission" />
              <Bar dataKey="benefice" fill="#10B981" name="Bénéfice net" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ✅ Bouton CSV */}
      {filtered.length > 0 && (
        <div className="mb-4">
          <CSVLink
            data={filtered.map(row => ({
              Compagnie: row.companySlug,
              Total: row.total,
              Commission: row.commission,
              Benefice: row.total - row.commission,
            }))}
            filename={`finances_${new Date().toISOString().slice(0, 10)}.csv`}
            className="inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Exporter en CSV
          </CSVLink>
        </div>
      )}

      {/* ✅ Tableau récapitulatif */}
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-4 py-2">Compagnie</th>
              <th className="border px-4 py-2">Total</th>
              <th className="border px-4 py-2">Commission</th>
              <th className="border px-4 py-2">Bénéfice net</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, i) => (
              <tr key={i}>
                <td className="border px-4 py-2">{entry.companySlug}</td>
                <td className="border px-4 py-2">{entry.total.toLocaleString()} FCFA</td>
                <td className="border px-4 py-2">{entry.commission.toLocaleString()} FCFA</td>
                <td className="border px-4 py-2">
                  {(entry.total - entry.commission).toLocaleString()} FCFA
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center p-4 text-gray-500">
                  Aucune donnée trouvée pour cette période.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminFinancesPage;
