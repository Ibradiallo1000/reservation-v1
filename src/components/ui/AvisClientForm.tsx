// ✅ Fichier : AvisClientForm.tsx — Formulaire d'avis client avec couleur dynamique

import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { Star } from 'lucide-react';

// ✅ Props attendues pour personnaliser le formulaire
interface Props {
  companyId: string;                             // ID de la compagnie cible
  onSuccess?: () => void;                       // Callback en cas de succès (optionnel)
  primaryColor: string;                         // Couleur principale pour personnalisation visuelle
}

const AvisClientForm: React.FC<Props> = ({ companyId, onSuccess, primaryColor }) => {
  // ✅ États internes pour les champs du formulaire
  const [nom, setNom] = useState('');
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ Soumission du formulaire avec enregistrement Firestore
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
        visible: false,
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

      {/* Champ : nom du client */}
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

      {/* Champ : note sous forme d’étoiles */}
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

      {/* Champ : commentaire libre */}
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

      {/* Bouton de soumission */}
      <button
        type="submit"
        disabled={loading}
        className="text-white px-4 py-2 rounded hover:opacity-90 transition"
        style={{ backgroundColor: primaryColor }}
      >
        {loading ? 'Envoi en cours...' : 'Envoyer mon avis'}
      </button>
    </form>
  );
};

export default AvisClientForm;
