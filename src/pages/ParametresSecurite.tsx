import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { updatePassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';

const ParametresSecurite = () => {
  const { user } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      setMessage("Les mots de passe ne correspondent pas.");
      return;
    }
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        setMessage("Mot de passe mis à jour avec succès !");
      }
    } catch (error) {
      setMessage("Erreur lors de la mise à jour du mot de passe.");
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold mb-4">Sécurité</h2>
      <input
        type="password"
        placeholder="Nouveau mot de passe"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className="block mb-2 border px-2 py-1"
      />
      <input
        type="password"
        placeholder="Confirmer le mot de passe"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className="block mb-2 border px-2 py-1"
      />
      <button onClick={handleChangePassword} className="bg-orange-600 text-white px-4 py-1 rounded">
        Modifier le mot de passe
      </button>
      {message && <p className="mt-2 text-green-600">{message}</p>}
    </div>
  );
};

export default ParametresSecurite;