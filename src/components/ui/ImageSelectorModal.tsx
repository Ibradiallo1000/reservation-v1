// src/components/ui/ImageSelectorModal.tsx
import React, { useEffect, useRef, useState } from "react";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";

type ImageDoc = {
  id: string;
  url: string;
  nom?: string;
  type?: string;
};

type Source = "platform" | "company";

export interface Props {
  onSelect: (url: string) => void;
  onClose: () => void;
  /** Titre facultatif affiché en haut de la modale */
  title?: string;
  /** Source des images : platform ou company (défaut) */
  source?: Source;
  /** Requis si source === "company" (par défaut) */
  companyId?: string;
}

const ImageSelectorModal: React.FC<Props> = ({
  onSelect,
  onClose,
  title = "Choisir une image",
  // ✅ défaut = company pour éviter d’aller sur mediaPlatform
  source = "company",
  companyId,
}) => {
  const [images, setImages] = useState<ImageDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;

    async function fetchImages() {
      setLoading(true);
      setErr(null);
      try {
        let snap;

        if (source === "platform") {
          // ⚠️ Réservé à l’admin plateforme selon tes rules
          const qy = query(collection(db, "mediaPlatform")); // ajouter orderBy si champ présent
          snap = await getDocs(qy);
        } else {
          // ✅ images d'une compagnie : SOUS-COLLECTION
          if (!companyId) {
            setImages([]);
            setLoading(false);
            return;
          }
          const path = `companies/${companyId}/imagesBibliotheque`;
          const qy = query(collection(db, path), orderBy("createdAt", "desc"));
          snap = await getDocs(qy);
        }

        if (!alive) return;
        const list: ImageDoc[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return { id: d.id, url: data.url, nom: data.nom, type: data.type };
        });
        setImages(list);
      } catch (e) {
        if (!alive) return;
        console.error("Erreur chargement images:", e);
        setErr("Impossible de charger les images. Réessayez plus tard.");
      } finally {
        if (alive) setLoading(false);
      }
    }

    fetchImages();
    return () => {
      alive = false;
    };
  }, [source, companyId]);

  // Accessibilité : Échap + focus
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    setTimeout(() => dialogRef.current?.focus(), 0);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleOverlayClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center z-50"
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-selector-title"
        tabIndex={-1}
        className="bg-white rounded-xl shadow-xl p-5 w-[92vw] max-w-2xl outline-none"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="image-selector-title" className="text-lg font-bold">
            {title}
          </h2>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
          >
            Fermer
          </button>
        </div>

        {loading ? (
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 w-full rounded bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : err ? (
          <p className="text-red-600 text-sm">{err}</p>
        ) : images.length === 0 ? (
          <p className="text-gray-600 text-sm">
            {source === "platform"
              ? "Aucune image plateforme disponible."
              : "Aucune image trouvée pour cette compagnie."}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => onSelect(img.url)}
                className="group relative rounded overflow-hidden border hover:shadow-md transition focus:outline-none focus:ring-2 focus:ring-orange-500"
                title={img.nom || "Image"}
              >
                <img
                  src={img.url}
                  alt={img.nom || "image"}
                  className="h-32 w-full object-cover transition group-hover:scale-[1.02]"
                  loading="lazy"
                  decoding="async"
                />
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border hover:bg-gray-50 text-sm"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageSelectorModal;
