import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface Depense {
  id?: string;
  libelle: string;
  montant: number;
  type: string;
  date: string;
  agencyId: string;
  createdAt: Timestamp;
}

const AgenceDepensesPage: React.FC = () => {
  const { user } = useAuth();
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState<number>(0);
  const [type, setType] = useState('autre');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [depenses, setDepenses] = useState<Depense[]>([]);

  const fetchDepenses = async () => {
    if (!user?.agencyId) return;
    const q = query(collection(db, 'depenses'), where('agencyId', '==', user.agencyId));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Depense[];
    setDepenses(list.sort((a, b) => b.createdAt.seconds - a.createdAt.seconds));
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.agencyId) return;
    try {
      await addDoc(collection(db, 'depenses'), {
        libelle,
        montant,
        type,
        date,
        agencyId: user.agencyId,
        createdAt: Timestamp.now(),
      });
      setLibelle('');
      setMontant(0);
      setType('autre');
      setDate(new Date().toISOString().split('T')[0]);
      fetchDepenses();
    } catch (err) {
      alert("Erreur lors de l'enregistrement.");
    }
  };

  useEffect(() => {
    fetchDepenses();
  }, [user]);

  const total = depenses.reduce((sum, d) => sum + d.montant, 0);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Dépenses de l'agence</h2>
      <form onSubmit={handleAdd} className="grid md:grid-cols-2 gap-4 mb-6">
        <input
          value={libelle}
          onChange={(e) => setLibelle(e.target.value)}
          placeholder="Libellé"
          className="border p-2 rounded"
          required
        />
        <input
          type="number"
          value={montant}
          onChange={(e) => setMontant(parseFloat(e.target.value))}
          placeholder="Montant"
          className="border p-2 rounded"
          required
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className="border p-2 rounded">
          <option value="entretien">Entretien</option>
          <option value="salaire">Salaire</option>
          <option value="charge">Charge</option>
          <option value="autre">Autre</option>
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border p-2 rounded"
        />
        <button type="submit" className="bg-green-600 text-white rounded p-2 col-span-2">Ajouter dépense</button>
      </form>

      <h3 className="text-lg font-semibold mb-2">Liste des dépenses</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border">
          <thead>
            <tr className="bg-gray-100 text-left">
              <th className="p-2 border">Date</th>
              <th className="p-2 border">Libellé</th>
              <th className="p-2 border">Type</th>
              <th className="p-2 border">Montant (FCFA)</th>
            </tr>
          </thead>
          <tbody>
            {depenses.map(dep => (
              <tr key={dep.id} className="border-t">
                <td className="p-2 border">{dep.date}</td>
                <td className="p-2 border">{dep.libelle}</td>
                <td className="p-2 border">{dep.type}</td>
                <td className="p-2 border text-right">{dep.montant.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 font-bold">
              <td colSpan={3} className="p-2 border text-right">Total</td>
              <td className="p-2 border text-right text-green-700">{total.toLocaleString()} FCFA</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default AgenceDepensesPage;
