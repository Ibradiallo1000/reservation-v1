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
  createdAt?: Date;
  usage?: string;
}

const BibliothequeImagesPage: React.FC = () => {
  const { user } = useAuth();
  const [images, setImages] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchImages = async () => {
    if (!user?.companyId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const q = query(
        collection(db, 'imagesBibliotheque'), 
        where('companyId', '==', user.companyId)
      );
      const snap = await getDocs(q);
      const data = snap.docs.map((d) => ({ 
        id: d.id, 
        ...d.data(),
        createdAt: d.data().createdAt?.toDate() 
      } as ImageItem));
      
      // Tri par date de création (la plus récente en premier)
      data.sort((a, b) => 
        (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
      );
      
      setImages(data);
    } catch (err) {
      console.error("Erreur de chargement:", err);
      setError("Erreur lors du chargement des images");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.companyId) fetchImages();
  }, [user?.companyId]);

  const supprimerImage = async (img: ImageItem) => {
    if (!img.id || img.companyId !== user?.companyId) return;
    
    const confirm = window.confirm(`Supprimer l'image "${img.nom}" ?`);
    if (!confirm) return;

    try {
      await deleteDoc(doc(db, 'imagesBibliotheque', img.id));
      fetchImages();
    } catch (err) {
      console.error("Erreur de suppression:", err);
      alert("Erreur lors de la suppression");
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">Bibliothèque d'images</h1>

      <div className="bg-white p-4 rounded-lg shadow mb-6">
        <UploadImageCloudinary
          label="Ajouter une image"
          dossier={`compagnies/${user?.companyId}`}
          onUpload={() => fetchImages()}
          className="w-full"
        />
      </div>

      <hr className="my-6 border-gray-200" />

      <h2 className="text-xl font-semibold mb-4 text-gray-700">Images enregistrées</h2>

      {error && (
        <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-4">
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : images.length === 0 ? (
        <div className="bg-blue-50 p-4 rounded-lg text-blue-800">
          <p>Aucune image enregistrée pour cette compagnie.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <div 
              key={img.id} 
              className="border border-gray-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow duration-200 bg-white"
            >
              <div className="relative pb-2/3 h-40 mb-2">
                <img
                  src={img.url}
                  alt={img.nom}
                  className="absolute h-full w-full object-cover rounded-md"
                  loading="lazy"
                />
              </div>
              <div className="mb-1">
                <p className="text-sm font-medium text-gray-800 truncate">{img.nom}</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">{img.type}</span>
                  {img.usage && (
                    <span className="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                      {img.usage}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex justify-between items-center text-xs text-gray-500">
                {img.createdAt && (
                  <span>
                    {new Date(img.createdAt).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={() => supprimerImage(img)}
                  className="text-red-600 hover:text-red-800 hover:underline"
                  aria-label="Supprimer"
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

export default BibliothequeImagesPage;