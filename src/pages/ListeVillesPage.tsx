// src/pages/ListeVillesPage.tsx

import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Ville {
  id: string;
  nom: string;
}

const ListeVillesPage: React.FC = () => {
  const [villes, setVilles] = useState<Ville[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchVilles = async () => {
      try {
        const snap = await getDocs(collection(db, 'villes'));
        const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Ville[];
        const sorted = data.sort((a, b) => a.nom.localeCompare(b.nom));
        setVilles(sorted);
      } catch (err) {
        console.error('Erreur chargement des villes :', err);
      } finally {
        setLoading(false);
      }
    };
    fetchVilles();
  }, []);

  const filteredVilles = villes.filter(v => v.nom.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">📍 Liste des villes enregistrées</h1>
      <input
        type="text"
        placeholder="Rechercher une ville..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="mb-4 p-2 border w-full md:w-1/2 rounded"
      />

      {loading ? (
        <p className="text-gray-500">Chargement...</p>
      ) : (
        <table className="w-full table-auto border">
          <thead>
            <tr className="bg-gray-200 text-left">
              <th className="p-2 border">#</th>
              <th className="p-2 border">Nom de la ville</th>
            </tr>
          </thead>
          <tbody>
            {filteredVilles.map((ville, index) => (
              <tr key={ville.id} className="border-t hover:bg-gray-50">
                <td className="p-2 border">{index + 1}</td>
                <td className="p-2 border font-medium">{ville.nom}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!loading && filteredVilles.length === 0 && (
        <p className="text-center text-gray-500 mt-4">Aucune ville trouvée.</p>
      )}
    </div>
  );
};

export default ListeVillesPage;
