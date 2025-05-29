// ✅ FICHIER 1 — ParametresLegaux.tsx (à placer dans src/pages)
import React, { useEffect, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import { Save } from 'lucide-react';

const ParametresLegaux = () => {
  const { user } = useAuth();
  const [mentions, setMentions] = useState('');
  const [politique, setPolitique] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const fetch = async () => {
      if (!user?.companyId) return;
      const docRef = doc(db, 'companies', user.companyId);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        setMentions(data.mentionsLegales || '');
        setPolitique(data.politiqueConfidentialite || '');
      }
    };
    fetch();
  }, [user]);

  const handleSave = async () => {
    if (!user?.companyId) return;
    try {
      await updateDoc(doc(db, 'companies', user.companyId), {
        mentionsLegales: mentions,
        politiqueConfidentialite: politique
      });
      setMessage('Modifications enregistrées.');
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l'enregistrement.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-4">Mentions légales & politique</h1>

      <label className="block font-semibold mb-1">Mentions légales</label>
      <textarea
        rows={6}
        value={mentions}
        onChange={(e) => setMentions(e.target.value)}
        className="w-full border rounded p-2 mb-4"
      />

      <label className="block font-semibold mb-1">Politique de confidentialité</label>
      <textarea
        rows={6}
        value={politique}
        onChange={(e) => setPolitique(e.target.value)}
        className="w-full border rounded p-2 mb-4"
      />

      <button
        onClick={handleSave}
        className="bg-yellow-600 text-white px-4 py-2 rounded flex items-center gap-2"
      >
        <Save size={16} /> Enregistrer
      </button>

      {message && <p className="mt-4 text-green-600">{message}</p>}
    </div>
  );
};

export default ParametresLegaux;