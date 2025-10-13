// src/components/ImageSelectorModal.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, orderBy, query, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";

type ImgDoc = {
  id: string;
  url: string;
  nom?: string;
  createdAt?: Date | null;
};

const toDate = (v: any): Date | null => {
  if (!v) return null;
  if (v instanceof Date) return v;
  if ((v as Timestamp)?.toDate) return (v as Timestamp).toDate();
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

interface Props {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  onPick: (img: ImgDoc) => void;
}

const ImageSelectorModal: React.FC<Props> = ({
  isOpen,
  title = "Choisir une image",
  onClose,
  onPick,
}) => {
  const { user, loading: authLoading } = useAuth();
  const companyId = user?.companyId || null;

  const [images, setImages] = useState<ImgDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const companyImagesPath = useMemo(
    () => (companyId ? `companies/${companyId}/imagesBibliotheque` : null),
    [companyId]
  );

  useEffect(() => {
    let cancelled = false;
    const fetchImages = async () => {
      if (!isOpen) return;
      if (authLoading) return;          // attendre que l’auth soit prête
      if (!companyImagesPath) {
        setImages([]);
        setErr("Aucune compagnie sélectionnée.");
        return;
      }

      setLoading(true);
      setErr("");

      try {
        const q = query(collection(db, companyImagesPath), orderBy("createdAt", "desc"));
        const snap = await getDocs(q);

        if (cancelled) return;

        const list: ImgDoc[] = snap.docs.map((d) => {
          const data: any = d.data() || {};
          return {
            id: d.id,
            url: data.url,
            nom: data.nom,
            createdAt: toDate(data.createdAt),
          };
        });

        setImages(list);
      } catch (e: any) {
        console.error("ImageSelector load error:", e);
        setErr("Impossible de charger les images. Réessayez plus tard.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchImages();
    return () => {
      cancelled = true;
    };
  }, [isOpen, authLoading, companyImagesPath]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999] bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{title}</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>

        <div className="p-4">
          {(authLoading || loading) && <div className="text-gray-600">Chargement…</div>}

          {!!err && !loading && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {err}
            </div>
          )}

          {!loading && !err && images.length === 0 && (
            <div className="text-sm text-gray-500">Aucune image disponible.</div>
          )}

          {!loading && images.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {images.map((img) => (
                <button
                  key={img.id}
                  onClick={() => onPick(img)}
                  className="group border rounded-lg overflow-hidden bg-white hover:shadow focus:outline-none focus:ring"
                  title={img.nom}
                >
                  <img src={img.url} alt={img.nom || "image"} className="w-full h-36 object-cover" />
                  <div className="px-2 py-1 text-xs text-gray-700 truncate">
                    {img.nom || "Sans nom"}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t flex justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded bg-gray-100 hover:bg-gray-200">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImageSelectorModal;
