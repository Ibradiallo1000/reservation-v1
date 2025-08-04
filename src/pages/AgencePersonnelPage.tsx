import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';

interface Agent {
  id?: string;
  uid: string;
  displayName: string;
  email: string;
  role: 'guichetier' | 'agentCourrier';
  createdAt: string;
}

const AgencePersonnelPage: React.FC = () => {
  const { user, company } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'guichetier' | 'agentCourrier'>('guichetier');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const theme = {
    primary: company?.couleurPrimaire || '#3b82f6',
    secondary: company?.couleurSecondaire || '#6366f1'
  };

  const loadAgents = async () => {
    if (!user?.companyId || !user?.agencyId) return;

    try {
      const ref = collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'users');
      const snap = await getDocs(ref);
      const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent));
      setAgents(list);
    } catch (error) {
      console.error('Erreur chargement agents:', error);
      setMessage('❌ Erreur lors du chargement des agents.');
    }
  };

  useEffect(() => {
    loadAgents();
  }, [user]);

  const handleAdd = async () => {
    if (!email || !password || !displayName || !user?.agencyId || !user?.companyId) {
      setMessage('⚠️ Tous les champs sont obligatoires.');
      return;
    }

    if (password.length < 6) {
      setMessage('⚠️ Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);

      const agentData: Omit<Agent, 'id'> = {
        uid: cred.user.uid,
        email,
        displayName,
        role,
        createdAt: Timestamp.now().toDate().toISOString()
      };

      const ref = collection(db, 'companies', user.companyId, 'agences', user.agencyId, 'users');
      await addDoc(ref, agentData);

      setMessage('✅ Agent ajouté avec succès.');
      setEmail('');
      setDisplayName('');
      setPassword('');
      loadAgents();
    } catch (error: any) {
      console.error('Erreur création agent:', error);
      if (error.code === 'auth/email-already-in-use') {
        setMessage('⚠️ Cet email est déjà utilisé.');
      } else {
        setMessage("❌ Une erreur est survenue. Vérifiez la console.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user?.companyId || !user?.agencyId) return;
    if (!window.confirm('Supprimer cet agent ?')) return;

    try {
      const docRef = doc(db, 'companies', user.companyId, 'agences', user.agencyId, 'users', id);
      await deleteDoc(docRef);
      setMessage('✅ Agent supprimé.');
      loadAgents();
    } catch (error) {
      console.error('Erreur suppression:', error);
      setMessage('❌ Erreur lors de la suppression.');
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold mb-6" style={{ color: theme.primary }}>
        Gestion du personnel
      </h1>

      {/* Formulaire d'ajout */}
      <div className="mb-8 bg-white p-6 rounded-xl shadow-md border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            value={displayName}
            onChange={e => setDisplayName(e.target.value)}
            placeholder="Nom complet"
            className="border p-3 rounded focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
            className="border p-3 rounded focus:ring-2 focus:ring-indigo-500"
          />
          <input
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Mot de passe"
            type="password"
            className="border p-3 rounded focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={role}
            onChange={e => setRole(e.target.value as 'guichetier' | 'agentCourrier')}
            className="border p-3 rounded focus:ring-2 focus:ring-indigo-500"
          >
            <option value="guichetier">Guichetier</option>
            <option value="agentCourrier">Agent de courrier</option>
          </select>
        </div>

        <button
          onClick={handleAdd}
          disabled={loading}
          className={`w-full py-3 rounded font-semibold text-white transition ${
            loading ? 'bg-gray-400 cursor-not-allowed' : 'hover:opacity-90'
          }`}
          style={{ background: `linear-gradient(to right, ${theme.primary}, ${theme.secondary})` }}
        >
          {loading ? '⏳ Ajout en cours...' : "Ajouter l’agent"}
        </button>
        {message && <p className="mt-3 text-center text-sm">{message}</p>}
      </div>

      {/* Liste des agents */}
      <h2 className="text-xl font-semibold mb-4">Agents de cette agence</h2>
      {agents.length === 0 ? (
        <p className="text-gray-500">Aucun agent enregistré.</p>
      ) : (
        <ul className="space-y-2">
          {agents.map(agent => (
            <li key={agent.id} className="border p-4 rounded flex justify-between items-center bg-white shadow-sm">
              <div>
                <p className="font-semibold text-gray-800">{agent.displayName}</p>
                <p className="text-sm text-gray-600">{agent.email} • {agent.role}</p>
              </div>
              <button
                onClick={() => handleDelete(agent.id!)}
                className="text-red-600 text-sm hover:underline"
              >
                Supprimer
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AgencePersonnelPage;
