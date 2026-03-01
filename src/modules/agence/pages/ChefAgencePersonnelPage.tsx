import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton } from '@/ui';
import { Users } from 'lucide-react';

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
    <StandardLayoutWrapper>
      <PageHeader title="Personnel de l'agence" icon={Users} />

      <SectionCard title="Ajouter un membre">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

        <ActionButton
          type="submit"
          className="mt-4 md:col-span-2"
        >
          Ajouter l'utilisateur
        </ActionButton>
      </form>
      </SectionCard>

      <SectionCard title="Liste actuelle" noPad>
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 dark:border-gray-700">
            <thead>
              <tr className="bg-gray-100 dark:bg-gray-800">
                <th className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-left">Nom</th>
                <th className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-left">Email</th>
                <th className="px-4 py-2 border border-gray-200 dark:border-gray-700 text-left">Rôle</th>
              </tr>
            </thead>
            <tbody>
              {personnel.length > 0 ? (
                personnel.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 border border-gray-200 dark:border-gray-700">{p.nom}</td>
                    <td className="px-4 py-2 border border-gray-200 dark:border-gray-700">{p.email}</td>
                    <td className="px-4 py-2 border border-gray-200 dark:border-gray-700 capitalize">{p.role}</td>
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
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default ChefAgencePersonnelPage;
