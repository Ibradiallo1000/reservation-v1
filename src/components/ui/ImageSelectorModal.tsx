// src/components/ui/ImageSelectorModal.tsx
import React, { useEffect, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";

type ImageDoc = { id: string; url: string; nom?: string; type?: string };

interface Props {
  onSelect: (url: string) => void;
  onClose: () => void;
  title?: string;
}

const ImageSelectorModal: React.FC<Props> = ({ onSelect, onClose, title }) => {
  const [images, setImages] = useState<ImageDoc[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        // 👉 bibliothèque centrale de la plateforme
        const q = query(collection(db, "mediaPlatform"), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);
        setImages(
          snap.docs.map(d => {
            const raw = d.data() as any;
            return { id: d.id, url: raw.url, nom: raw.nom, type: raw.type };
          })
        );
      } catch {
        setImages([]);
      }
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{title || "Choisir une image"}</h2>
          <button onClick={onClose} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Fermer</button>
        </div>

        {images === null ? (
          <div className="py-10 text-center text-gray-500">Chargement…</div>
        ) : images.length === 0 ? (
          <div className="py-10 text-center text-gray-500">Aucune image dans la bibliothèque de la plateforme.</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-h-[60vh] overflow-auto">
            {images.map(img => (
              <button
                key={img.id}
                onClick={() => onSelect(img.url)}
                className="group border rounded-lg overflow-hidden hover:shadow-md"
                title={img.nom || "image"}
              >
                <img src={img.url} alt={img.nom || "image"} className="h-40 w-full object-cover" />
                <div className="px-2 py-1 text-xs text-gray-600 flex justify-between">
                  <span className="truncate">{img.nom || "—"}</span>
                  {img.type && <span className="opacity-60">{img.type}</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageSelectorModal;
