import React, { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

    try {
      console.log('Tentative de connexion avec :', email);

      const userCredential = await signInWithEmailAndPassword(auth, email, motDePasse);
      const uid = userCredential.user.uid;

      console.log('✅ Authentification Firebase réussie, UID :', uid);

      const userDoc = await getDoc(doc(db, 'users', uid));

      if (!userDoc.exists()) {
        console.error('❌ Aucune donnée utilisateur trouvée dans Firestore pour UID :', uid);
        setMessage("Aucune information utilisateur trouvée.");
        return;
      }

      const userData = userDoc.data();
      console.log('✅ Données Firestore récupérées :', userData);

      const role = userData.role;
      localStorage.setItem('user', JSON.stringify({ uid, email, role, ...userData }));

      switch (role) {
        case 'admin_platforme':
          navigate('/dashboard');
          break;
        case 'admin_compagnie':
          navigate('/compagnie/dashboard');
          break;
        case 'chefAgence':
          navigate('/agence/dashboard');
          break;
        default:
          console.error('❌ Rôle inconnu ou non autorisé :', role);
          setMessage("Rôle utilisateur inconnu ou non autorisé.");
      }

    } catch (error: any) {
      console.error('❌ Erreur de connexion :', error);
      setMessage("Erreur de connexion : " + error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-6 rounded shadow w-full max-w-sm space-y-4">
        <h2 className="text-xl font-bold">Rapport</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded p-2"
        />
        <input
          type="password"
          placeholder="Mot de passe"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          className="w-full border rounded p-2"
        />
        <button type="submit" className="w-full bg-blue-600 text-white p-2 rounded">
          Se connecter
        </button>
        {message && <p className="text-red-600 text-sm text-center">{message}</p>}
      </form>
    </div>
  );
};

export default LoginPage;
