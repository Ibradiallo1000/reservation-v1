// ✅ src/pages/AgenceRecettesPage.tsx

import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface Recette {
  id?: string;
  libelle: string;
  montant: number;
  type: string;
  commentaire?: string;
  date: string;
  createdAt: Timestamp;
}

const AgenceRecettesPage: React.FC = () => {
  const { user } = useAuth();
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState<number>(0);
  const [type, setType] = useState('dépôt');
  const [commentaire, setCommentaire] = useState('');
  const [recettes, setRecettes] = useState<Recette[]>([]);
  const [total, setTotal] = useState(0);

  const fetchRecettes = async () => {
    if (!user?.agencyId) return;
    const q = query(collection(db, 'recettes'), where('agencyId', '==', user.agencyId));
    const snap = await getDocs(q);
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Recette));
    setRecettes(list);
    const somme = list.reduce((acc, r) => acc + (r.montant || 0), 0);
    setTotal(somme);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.agencyId) return;
    await addDoc(collection(db, 'recettes'), {
      libelle,
      montant,
      type,
      commentaire,
      agencyId: user.agencyId,
      createdAt: Timestamp.now(),
      date: new Date().toISOString().split('T')[0],
    });
    setLibelle(''); setMontant(0); setType('dépôt'); setCommentaire('');
    fetchRecettes();
  };

  useEffect(() => {
    fetchRecettes();
  }, [user]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Enregistrer une recette</h2>

      <form onSubmit={handleAdd} className="grid md:grid-cols-2 gap-4 mb-6">
        <input
          value={libelle}
          onChange={e => setLibelle(e.target.value)}
          placeholder="Libellé"
          required
          className="border p-2 rounded"
        />
        <input
          type="number"
          value={montant}
          onChange={e => setMontant(parseFloat(e.target.value))}
          placeholder="Montant"
          required
          className="border p-2 rounded"
        />
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="border p-2 rounded"
        >
          <option value="dépôt">Dépôt</option>
          <option value="avance">Avance</option>
          <option value="règlement">Règlement</option>
        </select>
        <input
          value={commentaire}
          onChange={e => setCommentaire(e.target.value)}
          placeholder="Commentaire (optionnel)"
          className="border p-2 rounded"
        />
        <button type="submit" className="col-span-2 bg-green-600 text-white rounded p-2">
          Ajouter
        </button>
      </form>

      <h3 className="text-lg font-semibold mb-2">Liste des recettes ({recettes.length})</h3>
      <p className="mb-2 text-green-700 font-bold">Total encaissé : {total.toLocaleString()} FCFA</p>

      <div className="overflow-auto">
        <table className="min-w-full text-sm bg-white border">
          <thead>
            <tr className="bg-gray-200">
              <th className="border px-4 py-2">Date</th>
              <th className="border px-4 py-2">Libellé</th>
              <th className="border px-4 py-2">Type</th>
              <th className="border px-4 py-2">Montant</th>
              <th className="border px-4 py-2">Commentaire</th>
            </tr>
          </thead>
          <tbody>
            {recettes.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{r.date}</td>
                <td className="border px-4 py-2">{r.libelle}</td>
                <td className="border px-4 py-2 capitalize">{r.type}</td>
                <td className="border px-4 py-2 text-right">{r.montant.toLocaleString()} FCFA</td>
                <td className="border px-4 py-2">{r.commentaire || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AgenceRecettesPage;
