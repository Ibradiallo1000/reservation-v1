// ✅ MessagesCompagniePage.tsx – Affichage des messages client pour une compagnie

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface MessageClient {
  id: string;
  nom: string;
  email: string;
  message: string;
  createdAt?: any;
}

const MessagesCompagniePage: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageClient[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMessages = async () => {
      if (!user?.companyId) return;
      try {
        const q = query(
          collection(db, 'messages'),
          where('companyId', '==', user.companyId),
          orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as MessageClient[];
        setMessages(data);
      } catch (error) {
        console.error('Erreur lors du chargement des messages :', error);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [user?.companyId]);

  if (!user?.companyId) {
    return <p className="text-red-600">Erreur : compagnie non définie.</p>;
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Messages des clients</h1>
      {loading ? (
        <p>Chargement...</p>
      ) : messages.length === 0 ? (
        <p>Aucun message pour l'instant.</p>
      ) : (
        <ul className="space-y-4">
          {messages.map((msg) => (
            <li key={msg.id} className="bg-white rounded shadow p-4">
              <p className="font-semibold">{msg.nom} ({msg.email})</p>
              <p className="text-sm text-gray-500 mb-2">{msg.createdAt?.toDate().toLocaleString()}</p>
              <p>{msg.message}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default MessagesCompagniePage;
