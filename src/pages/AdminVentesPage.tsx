import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { CSVLink } from 'react-csv';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';

interface VenteEntry {
  ville: string;
  total: number;
  billets: number;
  commission: number;
}

const AdminVentesPage: React.FC = () => {
  const [reservations, setReservations] = useState<any[]>([]);
  const [grouped, setGrouped] = useState<VenteEntry[]>([]);
  const [selectedVille, setSelectedVille] = useState<string>('all');
  const [selectedCompany, setSelectedCompany] = useState<string>('all');

  useEffect(() => {
    const fetchData = async () => {
      const resSnapshot = await getDocs(collection(db, 'reservations'));
      setReservations(resSnapshot.docs.map(doc => doc.data()));
    };
    fetchData();
  }, []);

  useEffect(() => {
    const group: Record<string, VenteEntry> = {};
    reservations.forEach(r => {
      const ville = r.trip?.departure || '—';
      const company = r.trip?.company || '';
      if ((selectedVille === 'all' || ville === selectedVille) &&
          (selectedCompany === 'all' || company === selectedCompany)) {
        if (!group[ville]) {
          group[ville] = { ville, total: 0, billets: 0, commission: 0 };
        }
        group[ville].total += r.total || 0;
        group[ville].billets += (r.seatsGo || 0) + (r.seatsReturn || 0);
        group[ville].commission += r.commission || 0;
      }
    });
    setGrouped(Object.values(group));
  }, [reservations, selectedVille, selectedCompany]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Historique des ventes</h1>

      {/* Filtres */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <select
          value={selectedVille}
          onChange={e => setSelectedVille(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Toutes les villes</option>
          {Array.from(new Set(reservations.map(r => r.trip?.departure)))
            .filter(Boolean)
            .map((v, idx) => (
              <option key={idx} value={v}>{v}</option>
            ))}
        </select>

        <select
          value={selectedCompany}
          onChange={e => setSelectedCompany(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Toutes les compagnies</option>
          {Array.from(new Set(reservations.map(r => r.trip?.company)))
            .filter(Boolean)
            .map((c, idx) => (
              <option key={idx} value={c}>{c}</option>
            ))}
        </select>

        {grouped.length > 0 && (
          <CSVLink
            data={grouped.map(row => ({
              Ville: row.ville,
              Billets: row.billets,
              Total: row.total,
              Commission: row.commission,
              Benefice: row.total - row.commission
            }))}
            filename={`ventes_${new Date().toISOString().slice(0, 10)}.csv`}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Exporter CSV
          </CSVLink>
        )}
      </div>

      {/* Graphique */}
      {grouped.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Graphique comparatif par ville</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={grouped}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ville" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="total" fill="#4F46E5" name="Total" />
              <Bar dataKey="commission" fill="#F59E0B" name="Commission" />
              <Bar dataKey={(entry) => entry.total - entry.commission} fill="#10B981" name="Bénéfice" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Tableau */}
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-4 py-2">Ville</th>
              <th className="border px-4 py-2">Nombre de billets</th>
              <th className="border px-4 py-2">Total encaissé</th>
              <th className="border px-4 py-2">Commission</th>
              <th className="border px-4 py-2">Bénéfice net</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((v, i) => (
              <tr key={i}>
                <td className="border px-4 py-2">{v.ville}</td>
                <td className="border px-4 py-2">{v.billets}</td>
                <td className="border px-4 py-2">{v.total.toLocaleString()} FCFA</td>
                <td className="border px-4 py-2">{v.commission.toLocaleString()} FCFA</td>
                <td className="border px-4 py-2">{(v.total - v.commission).toLocaleString()} FCFA</td>
              </tr>
            ))}
            {grouped.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center p-4 text-gray-500">
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

export default AdminVentesPage;
