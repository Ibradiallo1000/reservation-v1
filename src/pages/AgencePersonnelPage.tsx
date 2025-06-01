import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db, auth } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';

interface Agent {
  id?: string;
  displayName: string;
  email: string;
  role: 'guichetier' | 'agentCourrier';
  createdAt: string;
  agencyId: string;
  companyId: string;
}

const AgencePersonnelPage: React.FC = () => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'guichetier' | 'agentCourrier'>('guichetier');
  const [password, setPassword] = useState('');

  const loadAgents = async () => {
    if (!user?.agencyId) return;
    const q = query(collection(db, 'users'), where('agencyId', '==', user.agencyId));
    const snap = await getDocs(q);
    const list = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Agent));
    setAgents(list);
  };

  useEffect(() => {
    loadAgents();
  }, [user]);

  const handleAdd = async () => {
    if (!email || !password || !displayName || !user?.agencyId || !user?.companyId) return;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await addDoc(collection(db, 'users'), {
      uid: cred.user.uid,
      email,
      displayName,
      role,
      agencyId: user.agencyId,
      companyId: user.companyId,
      createdAt: new Date().toISOString(),
    });
    setEmail('');
    setDisplayName('');
    setPassword('');
    loadAgents();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Supprimer cet agent ?')) return;
    await deleteDoc(doc(db, 'users', id));
    loadAgents();
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Gestion du personnel</h1>

      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Nom" className="border p-2 rounded" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" type="email" className="border p-2 rounded" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Mot de passe" type="password" className="border p-2 rounded" />
        <select value={role} onChange={e => setRole(e.target.value as 'guichetier' | 'agentCourrier')} className="border p-2 rounded">
          <option value="guichetier">Guichetier</option>
          <option value="agentCourrier">Agent de courrier</option>
        </select>
      </div>

      <button onClick={handleAdd} className="bg-blue-600 text-white px-4 py-2 rounded mb-6">Ajouter l’agent</button>

      <h2 className="text-xl font-semibold mb-4">Agents de cette agence</h2>
      {agents.length === 0 ? (
        <p className="text-gray-500">Aucun agent enregistré.</p>
      ) : (
        <ul className="space-y-2">
          {agents.map(agent => (
            <li key={agent.id} className="border p-3 rounded flex justify-between items-center bg-white shadow">
              <div>
                <p className="font-semibold">{agent.displayName}</p>
                <p className="text-sm text-gray-500">{agent.email} • {agent.role}</p>
              </div>
              <button onClick={() => handleDelete(agent.id!)} className="text-red-600 text-sm hover:underline">Supprimer</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AgencePersonnelPage;
