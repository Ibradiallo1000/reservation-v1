import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface Utilisateur {
  id: string;
  nom: string;
  email: string;
  role: string;
}

const ChefAgencePersonnelPage: React.FC = () => {
  const { user } = useAuth(); // user doit contenir agencyId et companyId
  const [personnel, setPersonnel] = useState<Utilisateur[]>([]);

  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('guichetier');

  const fetchPersonnel = async () => {
    if (!user?.agencyId || !user?.companyId) return;
    const snap = await getDocs(
      collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'personnel')
    );
    const data: Utilisateur[] = snap.docs.map(doc => ({
      id: doc.id,
      ...(doc.data() as Omit<Utilisateur, 'id'>)
    }));
    setPersonnel(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom || !email || !role || !user?.agencyId || !user?.companyId) {
      alert('Tous les champs sont obligatoires.');
      return;
    }

    try {
      await addDoc(
        collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'personnel'),
        {
          nom,
          email,
          role,
          createdAt: new Date()
        }
      );

      alert('✅ Utilisateur ajouté avec succès.');
      setNom('');
      setEmail('');
      setRole('guichetier');
      fetchPersonnel();
    } catch (error) {
      console.error('Erreur lors de l’ajout :', error);
      alert('Erreur lors de l’ajout de l’utilisateur.');
    }
  };

  useEffect(() => {
    fetchPersonnel();
  }, [user]);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Personnel de l'agence</h2>

      <form onSubmit={handleSubmit} className="bg-gray-100 p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1">Nom complet</label>
          <input
            type="text"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block mb-1">Rôle</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="w-full border p-2 rounded"
            required
          >
            <option value="guichetier">Guichetier</option>
            <option value="agent_courrier">Agent de courrier</option>
          </select>
        </div>

        <button
          type="submit"
          className="mt-4 bg-blue-600 text-white px-4 py-2 rounded md:col-span-2"
        >
          Ajouter l'utilisateur
        </button>
      </form>

      <h3 className="text-lg font-semibold mb-2">Liste actuelle</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 shadow">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 border">Nom</th>
              <th className="px-4 py-2 border">Email</th>
              <th className="px-4 py-2 border">Rôle</th>
            </tr>
          </thead>
          <tbody>
            {personnel.length > 0 ? (
              personnel.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2 border">{p.nom}</td>
                  <td className="px-4 py-2 border">{p.email}</td>
                  <td className="px-4 py-2 border capitalize">{p.role}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={3} className="text-center p-4 text-gray-500">
                  Aucun personnel enregistré pour cette agence.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ChefAgencePersonnelPage;
