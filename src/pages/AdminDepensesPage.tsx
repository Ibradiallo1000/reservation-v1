// src/pages/AdminDepensesPage.tsx

import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { CSVLink } from 'react-csv';
import { format } from 'date-fns';

interface DepenseEntry {
  id: string;
  motif: string;
  montant: number;
  categorie: string;
  date: string;
}

const AdminDepensesPage: React.FC = () => {
  const [depenses, setDepenses] = useState<DepenseEntry[]>([]);
  const [filtered, setFiltered] = useState<DepenseEntry[]>([]);
  const [formData, setFormData] = useState({ motif: '', montant: '', categorie: '', date: '' });
  const [categorieFilter, setCategorieFilter] = useState('all');

  const fetchDepenses = async () => {
    const snapshot = await getDocs(collection(db, 'depenses'));
    const data = snapshot.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        motif: d.motif,
        montant: d.montant,
        categorie: d.categorie,
        date: d.date ? format(d.date.toDate(), 'yyyy-MM-dd') : '—'
      };
    });
    setDepenses(data);
  };

  useEffect(() => {
    fetchDepenses();
  }, []);

  useEffect(() => {
    let result = depenses;
    if (categorieFilter !== 'all') {
      result = result.filter(d => d.categorie === categorieFilter);
    }
    setFiltered(result);
  }, [depenses, categorieFilter]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { motif, montant, categorie, date } = formData;
    if (!motif || !montant || !categorie || !date) return alert('Tous les champs sont obligatoires.');

    await addDoc(collection(db, 'depenses'), {
      motif,
      montant: parseFloat(montant),
      categorie,
      date: Timestamp.fromDate(new Date(date))
    });

    setFormData({ motif: '', montant: '', categorie: '', date: '' });
    fetchDepenses();
  };

  const totalMontant = filtered.reduce((sum, d) => sum + d.montant, 0);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Dépenses journalières</h1>

      {/* Formulaire */}
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow mb-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <input name="motif" value={formData.motif} onChange={handleChange} placeholder="Motif" className="border rounded px-3 py-2" required />
        <input name="montant" type="number" value={formData.montant} onChange={handleChange} placeholder="Montant" className="border rounded px-3 py-2" required />
        <select name="categorie" value={formData.categorie} onChange={handleChange} className="border rounded px-3 py-2" required>
          <option value="">Catégorie</option>
          <option value="carburant">Carburant</option>
          <option value="maintenance">Maintenance</option>
          <option value="salaire">Salaire</option>
          <option value="autre">Autre</option>
        </select>
        <input name="date" type="date" value={formData.date} onChange={handleChange} className="border rounded px-3 py-2" required />
        <button type="submit" className="col-span-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Ajouter la dépense
        </button>
      </form>

      {/* Filtres et export */}
      <div className="mb-4 flex flex-wrap gap-4 items-center">
        <select
          value={categorieFilter}
          onChange={e => setCategorieFilter(e.target.value)}
          className="border rounded px-2 py-1"
        >
          <option value="all">Toutes les catégories</option>
          <option value="carburant">Carburant</option>
          <option value="maintenance">Maintenance</option>
          <option value="salaire">Salaire</option>
          <option value="autre">Autre</option>
        </select>

        {filtered.length > 0 && (
          <CSVLink
            data={filtered.map(row => ({
              Motif: row.motif,
              Montant: row.montant,
              Catégorie: row.categorie,
              Date: row.date
            }))}
            filename={`depenses_${new Date().toISOString().slice(0, 10)}.csv`}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
          >
            Exporter CSV
          </CSVLink>
        )}
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto">
        <table className="min-w-full table-auto border">
          <thead className="bg-gray-100">
            <tr>
              <th className="border px-4 py-2">Motif</th>
              <th className="border px-4 py-2">Montant</th>
              <th className="border px-4 py-2">Catégorie</th>
              <th className="border px-4 py-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((d, i) => (
              <tr key={i}>
                <td className="border px-4 py-2">{d.motif}</td>
                <td className="border px-4 py-2">{d.montant.toLocaleString()} FCFA</td>
                <td className="border px-4 py-2 capitalize">{d.categorie}</td>
                <td className="border px-4 py-2">{d.date}</td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center p-4 text-gray-500">
                  Aucune dépense trouvée.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="mt-4 text-right font-semibold text-lg">
          Total des sorties : {totalMontant.toLocaleString()} FCFA
        </div>
      </div>
    </div>
  );
};

export default AdminDepensesPage;
