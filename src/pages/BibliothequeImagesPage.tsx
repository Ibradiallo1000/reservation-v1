// src/pages/BibliothequeImagesPage.tsx
import React, { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import UploadImageCloudinary from "@/pages/UploadImageCloudinary";
import { Image as ImageIcon, Trash2 } from "lucide-react";

/* =========================
   Types
========================= */
type ImgDoc = {
  id: string;
  url: string;
  nom?: string;
  createdAt?: any;
};

/* =========================
   Page
========================= */
const BibliothequeImagesPage: React.FC = () => {
  const { user } = useAuth();

  const [images, setImages] = useState<ImgDoc[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     Sécurité
  ========================= */
  if (!user?.companyId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border p-6 bg-yellow-50 text-yellow-800">
          Accès réservé à l’administrateur de la compagnie.
        </div>
      </div>
    );
  }

  /* =========================
     Chargement images compagnie
     companies/{companyId}/imagesBibliotheque
  ========================= */
  useEffect(() => {
    setLoading(true);

    const colRef = collection(
      db,
      "companies",
      user.companyId,
      "imagesBibliotheque"
    );

    const qy = query(colRef, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      qy,
      (snap) => {
        setImages(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
        );
        setLoading(false);
      },
      (err) => {
        console.error("Erreur chargement images compagnie:", err);
        setImages([]);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [user.companyId]);

  /* =========================
     Suppression image
  ========================= */
  const handleDelete = async (img: ImgDoc) => {
    if (!window.confirm(`Supprimer l’image « ${img.nom || "image"} » ?`)) {
      return;
    }

    try {
      await deleteDoc(
        doc(
          db,
          "companies",
          user.companyId!,
          "imagesBibliotheque",
          img.id
        )
      );
    } catch (e) {
      console.error("Erreur suppression image:", e);
      alert("Erreur lors de la suppression");
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <ImageIcon className="text-orange-600" />
        <h1 className="text-2xl font-bold">
          Bibliothèque d’images de la compagnie
        </h1>
      </div>

      {/* Upload */}
      <div className="mb-6 max-w-sm">
        <UploadImageCloudinary
          label="Ajouter une image"
          dossier={`companies/${user.companyId}`}
          collectionName={`companies/${user.companyId}/imagesBibliotheque`}
          onUpload={() => {
            // rien à faire, onSnapshot s’en charge
          }}
        />
      </div>

      {/* Contenu */}
      {loading ? (
        <GridSkeleton />
      ) : images.length === 0 ? (
        <EmptyState />
      ) : (
        <ImageGrid items={images} onDelete={handleDelete} />
      )}
    </div>
  );
};

/* =========================
   UI helpers
========================= */

const GridSkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <div
        key={i}
        className="h-32 w-full rounded-lg bg-gray-100 animate-pulse"
      />
    ))}
  </div>
);

const EmptyState = () => (
  <div className="border rounded-lg p-10 bg-white text-center text-gray-600">
    <div className="flex items-center justify-center mb-3 text-gray-400">
      <ImageIcon />
    </div>
    <div className="font-semibold">Aucune image</div>
    <div className="text-sm text-gray-500 mt-1">
      Ajoutez votre première image avec le bouton ci-dessus.
    </div>
  </div>
);

const ImageGrid: React.FC<{
  items: ImgDoc[];
  onDelete: (img: ImgDoc) => void;
}> = ({ items, onDelete }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
    {items.map((img) => (
      <figure
        key={img.id}
        className="relative rounded-lg overflow-hidden border bg-white hover:shadow-md transition group"
      >
        <img
          src={img.url}
          alt={img.nom || "image"}
          className="h-32 w-full object-cover"
          loading="lazy"
        />

        {/* Bouton supprimer */}
        <button
          onClick={() => onDelete(img)}
          className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center
                     bg-red-600 text-white rounded-full p-1 shadow"
          title="Supprimer"
        >
          <Trash2 size={14} />
        </button>

        {img.nom && (
          <figcaption className="text-xs px-2 py-1 border-t text-gray-600 truncate">
            {img.nom}
          </figcaption>
        )}
      </figure>
    ))}
  </div>
);

export default BibliothequeImagesPage;
