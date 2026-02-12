import React, { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
import { Star, CheckCircle } from 'lucide-react';

interface Props {
  companyId: string;
  primaryColor: string;
}

const AvisClientForm: React.FC<Props> = ({ companyId, primaryColor }) => {
  const [nom, setNom] = useState('');
  const [note, setNote] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!nom.trim() || note < 1 || !commentaire.trim()) return;
    if (!companyId) return;

    try {
      setLoading(true);

      await addDoc(
        collection(db, 'companies', companyId, 'avis'),
        {
          nom,
          note,
          commentaire,
          visible: false,
          createdAt: serverTimestamp(),
        }
      );

      setSuccess(true);

    } catch (err) {
      console.error("Erreur envoi avis:", err);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div
        className="p-6 rounded-2xl text-center space-y-3"
        style={{
          background: 'rgba(16,185,129,0.12)',
          border: '1px solid rgba(16,185,129,0.4)',
        }}
      >
        <CheckCircle
          size={42}
          style={{ color: '#10b981' }}
          className="mx-auto"
        />

        <h4 className="text-lg font-semibold text-white">
          Merci pour votre avis !
        </h4>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Votre nom
        </label>

        <input
          type="text"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-900 border border-gray-300"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-2">
          Votre note
        </label>

        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              onClick={() => setNote(n)}
              className="h-7 w-7 cursor-pointer"
              style={{
                color: n <= note ? primaryColor : '#64748b',
                fill: n <= note ? primaryColor : 'none'
              }}
            />
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-white mb-1">
          Votre avis
        </label>

        <textarea
          value={commentaire}
          onChange={(e) => setCommentaire(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-lg bg-gray-100 text-gray-900 border border-gray-300"
          required
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full text-white font-semibold py-2.5 rounded-lg"
        style={{
          background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}CC)`
        }}
      >
        {loading ? 'Envoi en cours...' : 'Envoyer mon avis'}
      </button>
    </form>
  );
};

export default AvisClientForm;
