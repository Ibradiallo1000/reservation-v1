// Exemple : Register.tsx
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { collection, doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

const Register: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', role: 'compagnie' });
  const [error, setError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { name, email, password, confirm, role } = form;

    if (!name || !email || !password || !confirm) return setError('Veuillez remplir tous les champs.');
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: name });

      // Stocker le role de l'utilisateur dans Firestore
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        name,
        email,
        role,
        createdAt: new Date()
      });

      alert('Compte créé avec succès !');
      navigate('/login');
    } catch (err: any) {
      console.error(err);
      setError(err.message);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Inputs name, email, password, confirm... */}
      <select name="role" value={form.role} onChange={handleChange} className="w-full border rounded px-3 py-2 mb-3">
        <option value="compagnie">Compte Compagnie</option>
        <option value="admin">Administrateur principal</option>
      </select>
      {/* ... bouton submit, messages d'erreur etc. */}
    </form>
  );
};

export default Register;
