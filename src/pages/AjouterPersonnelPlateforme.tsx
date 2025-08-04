// ✅ src/pages/AjouterPersonnelPlateforme.tsx

import React, { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, Timestamp } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const AjouterPersonnelPlateforme: React.FC = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [nom, setNom] = useState('');
  const [role, setRole] = useState('support');
  const [message, setMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    if (!email || !motDePasse || !nom || !role) {
      setMessage("❌ Tous les champs sont obligatoires.");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, motDePasse);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, 'users', uid), {
        uid,
        email,
        nom,
        role,
        createdAt: Timestamp.now(),
        isPlatformStaff: true // 👈 utile si tu veux filtrer par type plus tard
      });

      setMessage("✅ Utilisateur ajouté avec succès.");
      setEmail('');
      setMotDePasse('');
      setNom('');
      setRole('support');
    } catch (error: any) {
      console.error("Erreur :", error);
      setMessage("❌ Une erreur s'est produite : " + error.message);
    }
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Ajouter un membre de l’équipe plateforme</h1>
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow space-y-4">
        <div>
          <label className="block mb-1 font-semibold">Nom complet</label>
          <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1 font-semibold">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1 font-semibold">Mot de passe</label>
          <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} className="w-full border p-2 rounded" required />
        </div>
        <div>
          <label className="block mb-1 font-semibold">Rôle</label>
          <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full border p-2 rounded">
            <option value="support">Support</option>
            <option value="commercial">Commercial</option>
            <option value="admin_plateforme">Administrateur Plateforme</option>
          </select>
        </div>
        <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
          Ajouter l’utilisateur
        </button>
        {message && <div className="mt-2 text-center text-sm text-gray-700">{message}</div>}
      </form>
    </div>
  );
};

export default AjouterPersonnelPlateforme;
