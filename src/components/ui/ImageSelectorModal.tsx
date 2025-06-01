// ✅ src/components/ImageSelectorModal.tsx

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface ImageSelectorModalProps {
  companyId: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

const ImageSelectorModal: React.FC<ImageSelectorModalProps> = ({ companyId, onSelect, onClose }) => {
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const q = query(collection(db, 'imagesBibliotheque'), where('companyId', '==', companyId));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setImages(data);
      } catch (error) {
        console.error("Erreur lors de la récupération des images :", error);
      }
      setLoading(false);
    };

    fetchImages();
  }, [companyId]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold">Choisir une image</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-red-500 text-sm">✖ Fermer</button>
        </div>

        {loading ? (
          <p>Chargement...</p>
        ) : images.length === 0 ? (
          <p className="text-gray-500">Aucune image trouvée pour cette compagnie.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {images.map((img) => (
              <div
                key={img.id}
                className="border rounded overflow-hidden shadow hover:shadow-lg cursor-pointer"
                onClick={() => onSelect(img.url)}
              >
                <img src={img.url} alt={img.nom} className="w-full h-32 object-cover" />
                <div className="p-2 text-sm text-center truncate">{img.nom}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageSelectorModal;
