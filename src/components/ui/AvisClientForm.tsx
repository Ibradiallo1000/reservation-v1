// ✅ Fichier : AvisClientForm.tsx — Permet aux visiteurs de laisser un avis

import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { Star } from 'lucide-react';

interface Props {
  companyId: string;
  onSuccess?: () => void;
}

const AvisClientForm: React.FC<Props> = ({ companyId, onSuccess }) => {
  const [nom, setNom] = useState('');
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim() || note < 1 || !commentaire.trim()) {
      setMessage("Veuillez remplir tous les champs et choisir une note.");
      return;
    }

    try {
      setLoading(true);
      await addDoc(collection(db, 'avis'), {
        nom,
        note,
        commentaire,
        visible: false, // Par défaut invisible
        companyId,
        createdAt: serverTimestamp(),
      });
      setMessage("Merci pour votre avis ! Il sera publié après validation.");
      setNom('');
      setNote(0);
      setCommentaire('');
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l'envoi. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {message && <p className="text-sm text-gray-600 italic">{message}</p>}

      <div>
        <label className="block text-sm font-medium text-gray-700">Votre nom</label>
        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="w-full border px-3 py-2 rounded"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Votre note</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              onClick={() => setNote(n)}
              className={`h-6 w-6 cursor-pointer ${n <= note ? 'text-yellow-400' : 'text-gray-300'}`}
              fill={n <= note ? '#facc15' : 'none'}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Votre avis</label>
        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          className="w-full border px-3 py-2 rounded"
          rows={4}
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-yellow-600 text-white px-4 py-2 rounded hover:bg-yellow-700"
      >
        {loading ? 'Envoi en cours...' : 'Envoyer mon avis'}
      </button>
    </form>
  );
};

export default AvisClientForm;
