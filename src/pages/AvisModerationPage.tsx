// ✅ Fichier : AvisModerationPage.tsx
import React, { useEffect, useState } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  getDocs,
  updateDoc,
  deleteDoc,
  doc
} from 'firebase/firestore';
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
  const [lastDoc, setLastDoc] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);

  const ITEMS_PER_PAGE = 10;

  // 🔑 Charger par lot
  const fetchAvis = async (loadMore = false) => {
    if (!user?.companyId) return;

    setLoading(true);

    let q = query(
      collection(db, 'avis'),
      where('companyId', '==', user.companyId),
      where('visible', '==', false), // 👉 On filtre les non-validés seulement
      orderBy('nom'),
      limit(ITEMS_PER_PAGE)
    );

    if (loadMore && lastDoc) {
      q = query(
        collection(db, 'avis'),
        where('companyId', '==', user.companyId),
        where('visible', '==', false),
        orderBy('nom'),
        startAfter(lastDoc),
        limit(ITEMS_PER_PAGE)
      );
    }

    const snap = await getDocs(q);
    const newData = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as Avis[];

    if (loadMore) {
      setAvisList((prev) => [...prev, ...newData]);
    } else {
      setAvisList(newData);
    }

    setLastDoc(snap.docs[snap.docs.length - 1] || null);
    setHasMore(snap.size === ITEMS_PER_PAGE);
    setLoading(false);
  };

  useEffect(() => {
    fetchAvis();
  }, [user]);

  const toggleVisibility = async (id: string, visible: boolean) => {
    await updateDoc(doc(db, 'avis', id), { visible: !visible });
    fetchAvis(); // Recharge la liste
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, 'avis', id));
    fetchAvis();
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h2 className="text-2xl font-bold mb-4">Modération des avis clients</h2>

      {loading && avisList.length === 0 && (
        <p>Chargement des avis...</p>
      )}

      {avisList.length === 0 && !loading && (
        <p>Aucun avis en attente pour l’instant ✅</p>
      )}

      <ul className="space-y-4">
        {avisList.map((avis) => (
          <li
            key={avis.id}
            className="border p-4 rounded shadow-sm bg-white flex flex-col gap-2"
          >
            <div className="flex justify-between items-center">
              <h4 className="font-semibold">{avis.nom} — ⭐ {avis.note}</h4>
              <div className="flex gap-2">
                <button
                  onClick={() => toggleVisibility(avis.id, avis.visible)}
                  className={`text-sm px-3 py-1 rounded ${avis.visible
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                    }`}
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

      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            onClick={() => fetchAvis(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Charger plus
          </button>
        </div>
      )}
    </div>
  );
};

export default AvisModerationPage;
