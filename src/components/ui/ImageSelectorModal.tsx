// ✅ src/components/ui/ImageSelectorModal.tsx
import React, { useEffect, useState } from "react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebaseConfig";

interface Props {
  companyId: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}

const ImageSelectorModal: React.FC<Props> = ({ companyId, onSelect, onClose }) => {
  const [images, setImages] = useState<any[]>([]);

  useEffect(() => {
    const fetchImages = async () => {
      try {
        const q = query(
          collection(db, "imagesBibliotheque"),
          where("companyId", "==", companyId)
        );
        const snap = await getDocs(q);
        setImages(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) {
        console.error("Erreur chargement images:", err);
      }
    };
    fetchImages();
  }, [companyId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-2xl">
        <h2 className="text-lg font-bold mb-4">Choisir une image</h2>

        {images.length === 0 ? (
          <p className="text-gray-500">Aucune image trouvée pour cette compagnie</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {images.map(img => (
              <div
                key={img.id}
                className="cursor-pointer border rounded overflow-hidden hover:shadow-lg"
                onClick={() => onSelect(img.url)}
              >
                <img src={img.url} alt={img.nom || "image"} className="h-32 w-full object-cover" />
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-6">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageSelectorModal;
