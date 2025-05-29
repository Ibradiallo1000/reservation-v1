// src/pages/ListePersonnelPlateforme.tsx

import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface UserData {
  id: string;
  email: string;
  role: string;
  displayName?: string;
}

const ListePersonnelPlateforme: React.FC = () => {
  const [utilisateurs, setUtilisateurs] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUtilisateurs = async () => {
    const usersSnap = await getDocs(collection(db, 'users'));
    const data = usersSnap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        email: d.email || '',
        role: d.role || 'inconnu',
        displayName: d.displayName || '',
      };
    });
    setUtilisateurs(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUtilisateurs();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Personnel de la plateforme</h1>
      <p className="mb-6 text-gray-600">Liste des utilisateurs avec leur rôle et adresse e-mail.</p>

      {loading ? (
        <p>Chargement en cours...</p>
      ) : (
        <table className="w-full table-auto border-collapse">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-4 py-2">Nom</th>
              <th className="border px-4 py-2">Email</th>
              <th className="border px-4 py-2">Rôle</th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map(user => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="border px-4 py-2">{user.displayName || '—'}</td>
                <td className="border px-4 py-2">{user.email}</td>
                <td className="border px-4 py-2 font-medium text-indigo-700">{user.role}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default ListePersonnelPlateforme;
