// src/pages/ParametresPersonnel.tsx

import React, { useEffect, useState } from 'react';
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface Utilisateur {
  id: string;
  nom: string;
  email: string;
  role: string;
  agencyId: string;
}

interface Agence {
  id: string;
  nomAgence: string;
}

const ParametresPersonnel: React.FC = () => {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [agences, setAgences] = useState<Agence[]>([]);

  // Champs du formulaire
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [role, setRole] = useState('guichetier');
  const [agencyId, setAgencyId] = useState('');

  const fetchUtilisateurs = async () => {
    const q = query(collection(db, 'users'));
    const snapshot = await getDocs(q);
    const data: Utilisateur[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as Utilisateur[];
    setUtilisateurs(data);
  };

  const fetchAgences = async () => {
    const snapshot = await getDocs(collection(db, 'agences'));
    const data: Agence[] = snapshot.docs.map((doc) => ({
      id: doc.id,
      nomAgence: doc.data().nomAgence,
    }));
    setAgences(data);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nom || !email || !motDePasse || !agencyId || !role) {
      alert('Tous les champs sont obligatoires.');
      return;
    }

    try {
      await addDoc(collection(db, 'users'), {
        nom,
        email,
        motDePasse,
        role,
        agencyId,
        createdAt: new Date(),
      });

      alert('Utilisateur ajouté avec succès.');
      setNom('');
      setEmail('');
      setMotDePasse('');
      setRole('guichetier');
      setAgencyId('');
      fetchUtilisateurs();
    } catch (error) {
      console.error('Erreur ajout utilisateur :', error);
      alert("Erreur lors de l'ajout.");
    }
  };

  useEffect(() => {
    fetchAgences();
    fetchUtilisateurs();
  }, []);

  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Gestion du personnel</h2>

      {/* Formulaire ajout */}
      <form onSubmit={handleSubmit} className="bg-gray-100 p-4 rounded mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
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
          <label className="block mb-1">Mot de passe temporaire</label>
          <input
            type="text"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
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
            <option value="chef_agence">Chef d’agence</option>
          </select>
        </div>

        <div className="md:col-span-2">
          <label className="block mb-1">Agence</label>
          <select
            value={agencyId}
            onChange={(e) => setAgencyId(e.target.value)}
            className="w-full border p-2 rounded"
            required
          >
            <option value="">-- Sélectionner une agence --</option>
            {agences.map((agence) => (
              <option key={agence.id} value={agence.id}>
                {agence.nomAgence}
              </option>
            ))}
          </select>
        </div>

        <button
          type="submit"
          className="mt-4 bg-green-600 text-white px-4 py-2 rounded md:col-span-2"
        >
          Ajouter l'utilisateur
        </button>
      </form>

      {/* Tableau du personnel */}
      <h3 className="text-lg font-semibold mb-2">Liste du personnel</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full bg-white border border-gray-200 shadow">
          <thead>
            <tr className="bg-gray-100">
              <th className="px-4 py-2 border">Nom</th>
              <th className="px-4 py-2 border">Email</th>
              <th className="px-4 py-2 border">Rôle</th>
              <th className="px-4 py-2 border">Agence</th>
            </tr>
          </thead>
          <tbody>
            {utilisateurs.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-2 border">{user.nom}</td>
                <td className="px-4 py-2 border">{user.email}</td>
                <td className="px-4 py-2 border">{user.role}</td>
                <td className="px-4 py-2 border">{user.agencyId}</td>
              </tr>
            ))}
            {utilisateurs.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center p-4 text-gray-500">
                  Aucun personnel enregistré.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ParametresPersonnel;
