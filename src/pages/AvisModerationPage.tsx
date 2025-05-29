// ✅ Fichier : AvisModerationPage.tsx — Permet à une compagnie de modérer les avis

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, updateDoc, deleteDoc, doc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';

interface Avis {
  id: string;
  nom: string;
  note: number;
  commentaire: string;
  visible: boolean;
}

const AvisModerationPage: React.FC = () => {
  const { user } = useAuth();
  const [avisList, setAvisList] = useState<Avis[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAvis = async () => {
    if (!user?.companyId) return;
    const q = query(collection(db, 'avis'), where('companyId', '==', user.companyId));
    const snap = await getDocs(q);
    const data = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as Avis[];
    setAvisList(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAvis();
  }, [user]);

  const toggleVisibility = async (id: string, visible: boolean) => {
    await updateDoc(doc(db, 'avis', id), { visible: !visible });
    fetchAvis();
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'avis', id));
    fetchAvis();
  };

  if (loading) return <p>Chargement des avis...</p>;

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Modération des avis clients</h2>
      {avisList.length === 0 ? (
        <p>Aucun avis pour l’instant.</p>
      ) : (
        <ul className="space-y-4">
          {avisList.map((avis) => (
            <li key={avis.id} className="border p-4 rounded shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold">{avis.nom} — ⭐ {avis.note}</h4>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleVisibility(avis.id, avis.visible)}
                    className={`text-sm px-3 py-1 rounded ${avis.visible ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
                  >
                    {avis.visible ? 'Masquer' : 'Afficher'}
                  </button>
                  <button
                    onClick={() => handleDelete(avis.id)}
                    className="text-sm bg-gray-100 hover:bg-gray-200 px-3 py-1 rounded"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-600 italic">{avis.commentaire}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AvisModerationPage;
