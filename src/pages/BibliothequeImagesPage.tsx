// ✅ src/pages/BibliothequeImagesPage.tsx

import React, { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import UploadImageCloudinary from './UploadImageCloudinary';

interface ImageItem {
  id?: string;
  companyId: string;
  type: string;
  url: string;
  nom: string;
}

const BibliothequeImagesPage: React.FC = () => {
  const { user } = useAuth();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchImages = async () => {
    if (!user?.companyId) return;
    setLoading(true);
    const q = query(collection(db, 'imagesBibliotheque'), where('companyId', '==', user.companyId));
    const snap = await getDocs(q);
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ImageItem));
    setImages(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchImages();
  }, [user?.companyId]);

  const supprimerImage = async (id: string) => {
    const confirm = window.confirm("Supprimer cette image ?");
    if (!confirm) return;
    await deleteDoc(doc(db, 'imagesBibliotheque', id));
    fetchImages();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Bibliothèque d'images</h1>

      <UploadImageCloudinary
        label="Ajouter une image"
        dossier={`compagnies/${user?.companyId}`}
        onUpload={() => fetchImages()}
      />

      <hr className="my-6" />

      <h2 className="text-xl font-semibold mb-4">Images enregistrées</h2>

      {loading ? (
        <p>Chargement...</p>
      ) : images.length === 0 ? (
        <p className="text-gray-500">Aucune image enregistrée pour cette compagnie.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {images.map((img) => (
            <div key={img.id} className="border rounded p-2 shadow-sm">
              <img src={img.url} alt={img.nom} className="w-full h-40 object-cover rounded mb-2" />
              <p className="text-sm font-semibold truncate">{img.nom}</p>
              <p className="text-xs text-gray-500">{img.type}</p>
              <button
                onClick={() => supprimerImage(img.id!)}
                className="text-red-500 text-xs mt-2 hover:underline"
              >
                Supprimer
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BibliothequeImagesPage;
