// src/pages/AjouterAgenceForm.tsx

import React, { useState } from 'react';
import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface AjouterAgenceFormProps {
  onAdd: () => void;
}

const AjouterAgenceForm: React.FC<AjouterAgenceFormProps> = ({ onAdd }) => {
  const { user } = useAuth();
  const [nomAgence, setNomAgence] = useState('');
  const [pays, setPays] = useState('');
  const [ville, setVille] = useState('');
  const [quartier, setQuartier] = useState('');
  const [type, setType] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.companyId) {
      alert("Erreur : utilisateur non autorisé ou ID compagnie manquant.");
      return;
    }

    if (!nomAgence || !pays || !ville) {
      alert('Veuillez remplir au moins : nom, pays et ville.');
      return;
    }

    const nouvelleAgence = {
      nomAgence,
      pays,
      ville,
      quartier,
      type,
      companyId: user.companyId,
      status: 'active',
      createdAt: new Date(),
      estSiege: false
    };

    try {
      await addDoc(collection(db, 'agences'), nouvelleAgence);
      alert('✅ Agence ajoutée avec succès.');
      setNomAgence('');
      setPays('');
      setVille('');
      setQuartier('');
      setType('');
      onAdd();
    } catch (error) {
      console.error('❌ Erreur lors de l’ajout :', error);
      alert('Une erreur est survenue lors de l’ajout.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-100 p-4 rounded mb-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block mb-1">Nom de l’agence</label>
          <input
            type="text"
            value={nomAgence}
            onChange={(e) => setNomAgence(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block mb-1">Pays</label>
          <input
            type="text"
            value={pays}
            onChange={(e) => setPays(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block mb-1">Ville</label>
          <input
            type="text"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            className="w-full border p-2 rounded"
            required
          />
        </div>

        <div>
          <label className="block mb-1">Quartier (optionnel)</label>
          <input
            type="text"
            value={quartier}
            onChange={(e) => setQuartier(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>

        <div>
          <label className="block mb-1">Type (optionnel)</label>
          <input
            type="text"
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full border p-2 rounded"
          />
        </div>
      </div>

      <button
        type="submit"
        className="mt-4 bg-green-600 text-white px-4 py-2 rounded"
      >
        Ajouter l’agence
      </button>
    </form>
  );
};

export default AjouterAgenceForm;
