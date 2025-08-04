import React, { useEffect, useState } from 'react';
import { collection, getDocs, deleteDoc, doc, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import UploadImageCloudinary from './UploadImageCloudinary';

interface ImageItem {
  id?: string;
  url: string;
  type: 'logo' | 'banniere' | 'favicon' | 'slider' | 'autre';
  nom: string;
  createdAt?: Date;
}

const MediaPage: React.FC = () => {
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Charger les images
  const fetchImages = async () => {
    setLoading(true);
    setError(null);

    try {
      const snap = await getDocs(collection(db, 'mediaPlatform'));
      const data = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
        createdAt: d.data().createdAt?.toDate()
      } as ImageItem));

      data.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
      setImages(data);
    } catch (err) {
      console.error("Erreur chargement médias:", err);
      setError("Erreur lors du chargement des images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImages();
  }, []);

  const supprimerImage = async (img: ImageItem) => {
    if (!img.id) return;

    const confirm = window.confirm(`Supprimer l'image "${img.nom}" ?`);
    if (!confirm) return;

    try {
      await deleteDoc(doc(db, 'mediaPlatform', img.id));
      fetchImages();
    } catch (err) {
      console.error("Erreur de suppression:", err);
      alert("Erreur lors de la suppression");
    }
  };

  const handleUpload = async (url: string, type: ImageItem['type'], nom: string) => {
    try {
      await addDoc(collection(db, 'mediaPlatform'), {
        url,
        type,
        nom,
        createdAt: Timestamp.now(),
      });
      fetchImages();
    } catch (err) {
      console.error("Erreur ajout média:", err);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">
        Bibliothèque globale de médias
      </h1>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <UploadImageCloudinary
          label="Ajouter une image"
          dossier="platform"
          collectionName="mediaPlatform"  // ✅ stocke dans mediaPlatform
          onUpload={(url: string) => handleUpload(url, 'autre', 'Nouvelle image')}
          className="w-full"
        />
      </div>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
        </div>
      ) : images.length === 0 ? (
        <div className="bg-orange-50 p-4 rounded-lg text-orange-800">
          <p>Aucune image enregistrée pour la plateforme.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <div 
              key={img.id} 
              className="border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white"
            >
              <div className="relative h-40 mb-2">
                <img
                  src={img.url}
                  alt={img.nom}
                  className="h-full w-full object-cover rounded-md"
                  loading="lazy"
                />
              </div>
              <div className="mb-1">
                <p className="text-sm font-medium text-gray-800 truncate">{img.nom}</p>
                <span className="text-xs text-gray-500">{img.type}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                {img.createdAt && (
                  <span>{new Date(img.createdAt).toLocaleDateString()}</span>
                )}
                <button
                  onClick={() => supprimerImage(img)}
                  className="text-red-600 hover:text-red-800 hover:underline"
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaPage;
