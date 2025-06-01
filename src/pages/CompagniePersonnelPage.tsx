// src/pages/CompagniePersonnelPage.tsx

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

const CompagniePersonnelPage: React.FC = () => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);

  const fetchAgents = async () => {
    if (!user?.companyId) return;
    const q = query(collection(db, 'users'), where('companyId', '==', user.companyId));
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setAgents(list);
  };

  useEffect(() => {
    fetchAgents();
  }, [user]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Gestion du personnel</h1>

      <div className="bg-white rounded-xl shadow p-4">
        <h2 className="font-semibold text-lg mb-3">Liste des agents</h2>
        {agents.length === 0 ? (
          <p className="text-gray-500">Aucun agent trouvé.</p>
        ) : (
          <table className="w-full table-auto border">
            <thead>
              <tr className="bg-gray-100">
                <th className="border px-4 py-2">Nom</th>
                <th className="border px-4 py-2">Rôle</th>
                <th className="border px-4 py-2">Email</th>
                <th className="border px-4 py-2">Téléphone</th>
                <th className="border px-4 py-2">Agence</th>
              </tr>
            </thead>
            <tbody>
              {agents.map((agent) => (
                <tr key={agent.id}>
                  <td className="border px-4 py-2">{agent.displayName || '-'}</td>
                  <td className="border px-4 py-2">{agent.role}</td>
                  <td className="border px-4 py-2">{agent.email}</td>
                  <td className="border px-4 py-2">{agent.telephone || '-'}</td>
                  <td className="border px-4 py-2">{agent.agence?.nom || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default CompagniePersonnelPage;
