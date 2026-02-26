// src/pages/AdminAgentsPage.tsx
import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../../firebaseConfig';
import { Button } from "@/shared/ui/button";

interface AgentEntry {
  id: string;
  nom: string;
  email: string;
  telephone: string;
  ville: string;
}

const AdminAgentsPage: React.FC = () => {
  const [agents, setAgents] = useState<AgentEntry[]>([]);
  const [formData, setFormData] = useState<Omit<AgentEntry, 'id'>>({
    nom: '',
    email: '',
    telephone: '',
    ville: '',
  });
  const [message, setMessage] = useState('');

  const fetchAgents = async () => {
    const snapshot = await getDocs(collection(db, 'agents'));
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AgentEntry));
    setAgents(data);
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'agents'), formData);
      setMessage('✅ Agent ajouté avec succès.');
      setFormData({ nom: '', email: '', telephone: '', ville: '' });
      fetchAgents();
    } catch (error) {
      console.error(error);
      setMessage("❌ Erreur lors de l'ajout.");
    }
  };

  const handleDelete = async (id: string) => {
    const confirm = window.confirm('❗ Supprimer cet agent ?');
    if (!confirm) return;
    await deleteDoc(doc(db, 'agents', id));
    fetchAgents();
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Gestion des agents</h1>

      <form onSubmit={handleSubmit} className="space-y-3 mb-6">
        <input
          type="text"
          placeholder="Nom complet"
          value={formData.nom}
          onChange={e => setFormData({ ...formData, nom: e.target.value })}
          className="block w-full border px-3 py-2 rounded"
          required
        />
        <input
          type="email"
          placeholder="Email"
          value={formData.email}
          onChange={e => setFormData({ ...formData, email: e.target.value })}
          className="block w-full border px-3 py-2 rounded"
        />
        <input
          type="text"
          placeholder="Téléphone"
          value={formData.telephone}
          onChange={e => setFormData({ ...formData, telephone: e.target.value })}
          className="block w-full border px-3 py-2 rounded"
        />
        <input
          type="text"
          placeholder="Ville"
          value={formData.ville}
          onChange={e => setFormData({ ...formData, ville: e.target.value })}
          className="block w-full border px-3 py-2 rounded"
        />
        <Button type="submit" variant="primary">
          Ajouter Agent
        </Button>
      </form>

      {message && <p className="text-blue-600 mb-4">{message}</p>}

      <h2 className="text-lg font-semibold mb-2">Agents enregistrés</h2>
      <ul className="space-y-2">
        {agents.map(agent => (
          <li key={agent.id} className="border p-3 rounded flex justify-between items-center">
            <div>
              <p className="font-semibold">{agent.nom}</p>
              <p className="text-sm text-gray-600">
                {agent.email} — {agent.telephone} — {agent.ville}
              </p>
            </div>
            <Button
              onClick={() => handleDelete(agent.id)}
              variant="danger"
              size="sm"
            >
              Supprimer
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default AdminAgentsPage;
