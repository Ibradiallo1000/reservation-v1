// ✅ src/pages/CompagnieVentesJournalieresPage.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';

interface Vente {
  id: string;
  nomClient: string;
  telephone: string;
  date: string;
  heure: string;
  montant: number;
  depart: string;
  arrivee: string;
  canal: string;
  agencyId: string;
}

interface Agence {
  id: string;
  ville: string;
}

const CompagnieVentesJournalieresPage: React.FC = () => {
  const { user } = useAuth();
  const [agences, setAgences] = useState<Agence[]>([]);
  const [agencyId, setAgencyId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [ventes, setVentes] = useState<Vente[]>([]);
  const [loading, setLoading] = useState(false);

  const loadAgences = async () => {
    if (!user?.companyId) return;
    const q = query(collection(db, 'agences'), where('companyId', '==', user.companyId));
    const snap = await getDocs(q);
    const list = snap.docs.map(doc => ({ id: doc.id, ville: doc.data().ville }));
    setAgences(list);
  };

  const fetchVentes = async () => {
    if (!selectedDate || !user?.companyId) return;
    setLoading(true);

    const q = query(
      collection(db, 'reservations'),
      where('compagnieId', '==', user.companyId),
      where('statut', '==', 'payé')
    );
    const snap = await getDocs(q);
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Vente[];

    const filtered = list.filter(v => v.date === selectedDate && (!agencyId || v.agencyId === agencyId));
    setVentes(filtered);
    setLoading(false);
  };

  useEffect(() => {
    loadAgences();
  }, []);

  useEffect(() => {
    fetchVentes();
  }, [selectedDate, agencyId]);

  const totalMontant = ventes.reduce((sum, v) => sum + (v.montant || 0), 0);

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-6">📅 Ventes journalières par agence</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="border p-2 rounded" />
        <select value={agencyId} onChange={e => setAgencyId(e.target.value)} className="border p-2 rounded">
          <option value="">Toutes les agences</option>
          {agences.map(a => <option key={a.id} value={a.id}>{a.ville}</option>)}
        </select>
        <button onClick={() => window.print()} className="bg-blue-600 text-white px-4 py-2 rounded">Imprimer</button>
      </div>

      {loading ? <p className="text-gray-600">Chargement...</p> : (
        <>
          <div className="text-right mb-2 font-semibold text-green-700">Total encaissé : {totalMontant.toLocaleString()} FCFA</div>
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100">
              <tr>
                <th className="border p-2">#</th>
                <th className="border p-2">Client</th>
                <th className="border p-2">Téléphone</th>
                <th className="border p-2">Trajet</th>
                <th className="border p-2">Heure</th>
                <th className="border p-2">Montant</th>
                <th className="border p-2">Canal</th>
              </tr>
            </thead>
            <tbody>
              {ventes.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-gray-500 p-4">Aucune vente trouvée.</td></tr>
              ) : (
                ventes.map((v, i) => (
                  <tr key={v.id}>
                    <td className="border p-2 text-center">{i + 1}</td>
                    <td className="border p-2">{v.nomClient}</td>
                    <td className="border p-2">{v.telephone}</td>
                    <td className="border p-2">{v.depart} → {v.arrivee}</td>
                    <td className="border p-2 text-center">{v.heure}</td>
                    <td className="border p-2 text-right">{v.montant.toLocaleString()}</td>
                    <td className="border p-2 text-center">{v.canal === 'guichet' ? 'Guichet' : 'En ligne'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
};

export default CompagnieVentesJournalieresPage;
