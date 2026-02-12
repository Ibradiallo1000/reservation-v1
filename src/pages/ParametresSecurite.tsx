// =============================================
// src/pages/ParametresSecurite.tsx
// =============================================

import React, { useState } from 'react';
import { updatePassword } from 'firebase/auth';
import { auth } from '@/firebaseConfig';

interface ParametresSecuriteProps {
  companyId: string; // 🔥 nécessaire pour compatibilité Tabs
}

const ParametresSecurite: React.FC<ParametresSecuriteProps> = ({ companyId }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | '' }>({
    text: '',
    type: '',
  });
  const [loading, setLoading] = useState(false);

  const handleChangePassword = async () => {
    setMessage({ text: '', type: '' });

    if (!newPassword || !confirmPassword) {
      setMessage({ text: 'Veuillez remplir les deux champs.', type: 'error' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ text: 'Le mot de passe doit contenir au moins 6 caractères.', type: 'error' });
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage({ text: 'Les mots de passe ne correspondent pas.', type: 'error' });
      return;
    }

    try {
      setLoading(true);

      if (!auth.currentUser) {
        setMessage({ text: 'Utilisateur non authentifié.', type: 'error' });
        return;
      }

      await updatePassword(auth.currentUser, newPassword);

      setMessage({ text: 'Mot de passe mis à jour avec succès !', type: 'success' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      console.error(error);

      if (error.code === 'auth/requires-recent-login') {
        setMessage({
          text: 'Veuillez vous reconnecter avant de modifier le mot de passe.',
          type: 'error',
        });
      } else {
        setMessage({
          text: 'Erreur lors de la mise à jour du mot de passe.',
          type: 'error',
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-6 max-w-xl">
      <h2 className="text-xl font-bold mb-6">Sécurité</h2>

      <div className="space-y-4">
        <input
          type="password"
          placeholder="Nouveau mot de passe"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full border rounded-lg px-4 py-2"
        />

        <input
          type="password"
          placeholder="Confirmer le mot de passe"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="w-full border rounded-lg px-4 py-2"
        />

        <button
          onClick={handleChangePassword}
          disabled={loading}
          className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-lg disabled:opacity-60"
        >
          {loading ? 'Modification...' : 'Modifier le mot de passe'}
        </button>

        {message.text && (
          <p
            className={`text-sm mt-2 ${
              message.type === 'success' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
};

export default ParametresSecurite;
