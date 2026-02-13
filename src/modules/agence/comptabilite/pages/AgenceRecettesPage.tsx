// ✅ src/pages/AgenceRecettesPage.tsx

import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, Timestamp } from 'firebase/firestore';
import { db } from '../../../../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, LineChart, Line,
  CartesianGrid, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';

interface Recette {
  id?: string;
  libelle: string;
  montant: number;
  type: string;
  commentaire?: string;
  date: string;
  createdAt: Timestamp;
  guichetierId: string;
  guichetierNom: string;
}

interface Agent {
  id: string;
  displayName: string;
}

const AgenceRecettesPage: React.FC = () => {
  const { user, company } = useAuth();
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState<number>(0);
  const [type, setType] = useState('dépôt');
  const [commentaire, setCommentaire] = useState('');
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [guichetierId, setGuichetierId] = useState('');
  const [filtreGuichetier, setFiltreGuichetier] = useState('');
  const [filtreDate, setFiltreDate] = useState('');
  const [filtreMois, setFiltreMois] = useState('');
  const [total, setTotal] = useState(0);

  const theme = {
    primary: company?.couleurPrimaire || '#2563eb',
    secondary: company?.couleurSecondaire || '#9333ea',
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#14b8a6'];

  // Charger les recettes
  const fetchRecettes = async () => {
    if (!user?.companyId || !user?.agencyId) return;
    const recettesRef = collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'recettes');
    const snap = await getDocs(query(recettesRef));
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recette));
    setRecettes(list);
    const somme = list.reduce((acc, r) => acc + (r.montant || 0), 0);
    setTotal(somme);
  };

  // Charger les guichetiers
  const fetchAgents = async () => {
    if (!user?.companyId || !user?.agencyId) return;
    const ref = collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'users');
    const snap = await getDocs(ref);
    const list = snap.docs.map(d => ({ id: d.id, displayName: d.data().displayName })) as Agent[];
    setAgents(list);
  };

  // Ajouter une recette
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.companyId || !user?.agencyId || !guichetierId) return;

    const selectedAgent = agents.find(a => a.id === guichetierId);

    const recettesRef = collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'recettes');
    await addDoc(recettesRef, {
      libelle,
      montant,
      type,
      commentaire,
      guichetierId,
      guichetierNom: selectedAgent?.displayName || '',
      createdAt: Timestamp.now(),
      date: new Date().toISOString().split('T')[0],
    });

    setLibelle('');
    setMontant(0);
    setType('dépôt');
    setCommentaire('');
    setGuichetierId('');
    fetchRecettes();
  };

  useEffect(() => {
    fetchRecettes();
    fetchAgents();
  }, [user]);

  // Application des filtres
  const recettesFiltrees = recettes.filter(r => {
    const matchGuichetier = filtreGuichetier ? r.guichetierId === filtreGuichetier : true;
    const matchDate = filtreDate ? r.date === filtreDate : true;
    const matchMois = filtreMois ? r.date.startsWith(filtreMois) : true;
    return matchGuichetier && matchDate && matchMois;
  });

  const totalFiltre = recettesFiltrees.reduce((acc, r) => acc + (r.montant || 0), 0);

  // Données graphiques
  const dataParGuichetier = agents.map(agent => ({
    name: agent.displayName,
    value: recettes.filter(r => r.guichetierId === agent.id).reduce((acc, r) => acc + r.montant, 0),
  })).filter(d => d.value > 0);

  const dataParType = ['dépôt', 'avance', 'règlement'].map(t => ({
    type: t,
    montant: recettesFiltrees.filter(r => r.type === t).reduce((acc, r) => acc + r.montant, 0),
  }));

  const dataParJour = Array.from(new Set(recettesFiltrees.map(r => r.date)))
    .sort()
    .map(d => ({
      date: d,
      montant: recettesFiltrees.filter(r => r.date === d).reduce((acc, r) => acc + r.montant, 0),
    }));

  // Export PDF
  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text(`Recettes - ${company?.nom || 'Compagnie'}`, 14, 14);

    autoTable(doc, {
      head: [['Date', 'Libellé', 'Type', 'Montant', 'Guichetier', 'Commentaire']],
      body: recettesFiltrees.map(r => [
        r.date,
        r.libelle,
        r.type,
        `${r.montant.toLocaleString()} FCFA`,
        r.guichetierNom,
        r.commentaire || '-',
      ]),
    });

    doc.save('recettes.pdf');
  };

  // Export Excel
  const exportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(
      recettesFiltrees.map(r => ({
        Date: r.date,
        Libellé: r.libelle,
        Type: r.type,
        Montant: r.montant,
        Guichetier: r.guichetierNom,
        Commentaire: r.commentaire || '-',
      }))
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Recettes');
    XLSX.writeFile(wb, 'recettes.xlsx');
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold" style={{ color: theme.primary }}>
          Gestion des Recettes
        </h2>
        <div className="flex gap-2">
          <button onClick={exportPDF}
            className="px-4 py-2 text-white rounded shadow"
            style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}
          >
            📄 Exporter PDF
          </button>
          <button onClick={exportExcel}
            className="px-4 py-2 text-white rounded shadow"
            style={{ background: `linear-gradient(to right, ${theme.secondary}, ${theme.primary})` }}
          >
            📊 Exporter Excel
          </button>
        </div>
      </div>

      {/* Formulaire */}
      <form onSubmit={handleAdd} className="grid md:grid-cols-2 gap-4 mb-6 bg-white p-6 rounded-lg shadow border"
        style={{ borderColor: theme.secondary }}>
        <input value={libelle} onChange={e => setLibelle(e.target.value)} placeholder="Libellé" required className="border p-2 rounded" />
        <input type="number" value={montant} onChange={e => setMontant(parseFloat(e.target.value))} placeholder="Montant" required className="border p-2 rounded" />
        <select value={type} onChange={e => setType(e.target.value)} className="border p-2 rounded">
          <option value="dépôt">Dépôt</option>
          <option value="avance">Avance</option>
          <option value="règlement">Règlement</option>
        </select>
        <select value={guichetierId} onChange={e => setGuichetierId(e.target.value)} required className="border p-2 rounded">
          <option value="">-- Sélectionner un guichetier --</option>
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.displayName}</option>
          ))}
        </select>
        <input value={commentaire} onChange={e => setCommentaire(e.target.value)} placeholder="Commentaire (optionnel)" className="border p-2 rounded col-span-2" />
        <button type="submit" className="col-span-2 px-4 py-2 text-white font-semibold rounded shadow"
          style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}>
          Ajouter
        </button>
      </form>

      {/* Filtres */}
      <div className="mb-6 flex flex-wrap gap-4 items-center">
        <select value={filtreGuichetier} onChange={e => setFiltreGuichetier(e.target.value)} className="border p-2 rounded bg-white shadow">
          <option value="">Tous les guichetiers</option>
          {agents.map(agent => (
            <option key={agent.id} value={agent.id}>{agent.displayName}</option>
          ))}
        </select>
        <input type="date" value={filtreDate} onChange={e => setFiltreDate(e.target.value)} className="border p-2 rounded bg-white shadow" />
        <input type="month" value={filtreMois} onChange={e => setFiltreMois(e.target.value)} className="border p-2 rounded bg-white shadow" />
        <p className="text-lg font-bold" style={{ color: theme.secondary }}>
          Total : {totalFiltre.toLocaleString()} FCFA
        </p>
      </div>

      {/* Graphiques */}
      <div className="grid md:grid-cols-3 gap-6 mb-6">
        {/* Par guichetier */}
        <div className="bg-white p-4 rounded-lg shadow border col-span-1">
          <h3 className="text-lg font-semibold mb-4" style={{ color: theme.primary }}>Par Guichetier</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={dataParGuichetier} dataKey="value" nameKey="name" outerRadius={100} label>
                {dataParGuichetier.map((_, index) => (
                  <Cell key={index} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip /><Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Par type */}
        <div className="bg-white p-4 rounded-lg shadow border col-span-1">
          <h3 className="text-lg font-semibold mb-4" style={{ color: theme.primary }}>Par Type</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={dataParType}>
              <XAxis dataKey="type" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="montant" fill={theme.secondary} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Par jour */}
        <div className="bg-white p-4 rounded-lg shadow border col-span-1">
          <h3 className="text-lg font-semibold mb-4" style={{ color: theme.primary }}>Évolution par Jour</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dataParJour}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="montant" stroke={theme.primary} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Tableau */}
      {recettesFiltrees.length === 0 ? (
        <p className="text-gray-500">Aucune recette enregistrée pour le moment.</p>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-full text-sm bg-white border rounded shadow">
            <thead>
              <tr style={{ backgroundColor: theme.secondary, color: '#fff' }}>
                <th className="border px-4 py-2">Date</th>
                <th className="border px-4 py-2">Libellé</th>
                <th className="border px-4 py-2">Type</th>
                <th className="border px-4 py-2">Montant</th>
                <th className="border px-4 py-2">Guichetier</th>
                <th className="border px-4 py-2">Commentaire</th>
              </tr>
            </thead>
            <tbody>
              {recettesFiltrees.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="border px-4 py-2">{r.date}</td>
                  <td className="border px-4 py-2">{r.libelle}</td>
                  <td className="border px-4 py-2 capitalize">{r.type}</td>
                  <td className="border px-4 py-2 text-right">{r.montant.toLocaleString()} FCFA</td>
                  <td className="border px-4 py-2">{r.guichetierNom}</td>
                  <td className="border px-4 py-2">{r.commentaire || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AgenceRecettesPage;
