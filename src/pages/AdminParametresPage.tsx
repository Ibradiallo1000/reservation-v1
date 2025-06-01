// src/pages/AdminParametresPage.tsx
import React, { useState } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';

const AdminParametresPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const adminRef = doc(db, 'admin', 'parametres');
      await updateDoc(adminRef, {
        email,
        motDePasse,
      });
      setMessage('Paramètres mis à jour avec succès.');
    } catch (error) {
      setMessage('Erreur lors de la mise à jour des paramètres.');
    }
  };

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setLogo(e.target.files[0]);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Paramètres Admin</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <input
          type="email"
          placeholder="Nouvel email"
          className="block w-full border px-4 py-2 rounded"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Nouveau mot de passe"
          className="block w-full border px-4 py-2 rounded"
          value={motDePasse}
          onChange={e => setMotDePasse(e.target.value)}
        />
        <input
          type="file"
          accept="image/*"
          className="block"
          onChange={handleLogoChange}
        />
        <button
          type="submit"
          className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
        >
          Sauvegarder
        </button>
      </form>
      {message && <p className="mt-4 text-green-600">{message}</p>}
    </div>
  );
};

export default AdminParametresPage;
