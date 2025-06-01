// src/pages/AdminMessageriePage.tsx

import React, { useEffect, useState } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { format } from 'date-fns';

interface MessageEntry {
  id: string;
  sender: string;
  receiver: string;
  content: string;
  timestamp: Timestamp;
}

const AdminMessageriePage: React.FC = () => {
  const [messages, setMessages] = useState<MessageEntry[]>([]);
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [response, setResponse] = useState('');
  const [userList, setUserList] = useState<string[]>([]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser) fetchMessages(selectedUser);
  }, [selectedUser]);

  const fetchUsers = async () => {
    const snapshot = await getDocs(collection(db, 'messages'));
    const allMessages = snapshot.docs.map(doc => doc.data() as MessageEntry);
    const uniqueUsers = Array.from(new Set(allMessages.map(m => m.sender)));
    setUserList(uniqueUsers);
  };

  const fetchMessages = async (userId: string) => {
    const q = query(
      collection(db, 'messages'),
      where('sender', '==', userId),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MessageEntry));
    setMessages(data);
  };

  const handleSend = async () => {
    if (!response || !selectedUser) return;

    await addDoc(collection(db, 'messages'), {
      sender: 'admin',
      receiver: selectedUser,
      content: response,
      timestamp: Timestamp.now(),
    });

    setResponse('');
    fetchMessages(selectedUser);
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Messagerie</h1>
      <div className="flex gap-6">
        {/* Liste utilisateurs */}
        <div className="w-1/3 border-r pr-4">
          <h2 className="font-semibold mb-2">Utilisateurs</h2>
          <ul>
            {userList.map(user => (
              <li
                key={user}
                onClick={() => setSelectedUser(user)}
                className={`cursor-pointer p-2 rounded ${selectedUser === user ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
              >
                {user}
              </li>
            ))}
          </ul>
        </div>

        {/* Discussion */}
        <div className="w-2/3">
          <h2 className="font-semibold mb-2">Discussion avec {selectedUser || '...'}</h2>

          <div className="bg-white border rounded h-96 overflow-y-auto p-4 mb-4">
            {messages.length > 0 ? (
              messages.map(msg => (
                <div
                  key={msg.id}
                  className={`mb-3 ${msg.sender === 'admin' ? 'text-right' : 'text-left'}`}
                >
                  <div className="inline-block px-3 py-2 rounded bg-gray-100">
                    <p className="text-sm">{msg.content}</p>
                    <p className="text-xs text-gray-500">
                      {format(msg.timestamp.toDate(), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500">Aucun message trouvé.</p>
            )}
          </div>

          {/* Zone de réponse */}
          {selectedUser && (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Votre réponse..."
                className="border px-3 py-2 rounded w-full"
                value={response}
                onChange={e => setResponse(e.target.value)}
              />
              <button
                onClick={handleSend}
                className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
              >
                Envoyer
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminMessageriePage;
