// src/pages/BibliothequeImagesPage.tsx
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
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
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  
  // Déterminer le companyId effectif :
  // - Pour admin_compagnie : utiliser user.companyId
  // - Pour admin_platforme en inspection : utiliser routeCompanyId
  const effectiveCompanyId = user?.companyId || routeCompanyId;
  
  // Mode inspection : admin plateforme regardant une autre compagnie
  const isInspectionMode = Boolean(user?.role === "admin_platforme" && routeCompanyId);

  const [images, setImages] = useState<ImgDoc[]>([]);
  const [loading, setLoading] = useState(true);

  /* =========================
     Sécurité améliorée
  ========================= */
  if (!effectiveCompanyId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border p-6 bg-yellow-50 text-yellow-800">
          <p className="font-medium">Accès non autorisé</p>
          <p className="text-sm mt-1">
            Aucune compagnie associée à votre compte ou à l'URL.
          </p>
        </div>
      </div>
    );
  }

  /* =========================
     Chargement images compagnie
     companies/{effectiveCompanyId}/imagesBibliotheque
  ========================= */
  useEffect(() => {
    setLoading(true);

    const colRef = collection(
      db,
      "companies",
      effectiveCompanyId,
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
  }, [effectiveCompanyId]);

  /* =========================
     Suppression image
     - Admin_compagnie : peut supprimer
     - Admin_platforme en inspection : lecture seule
  ========================= */
  const handleDelete = async (img: ImgDoc) => {
    // En mode inspection, pas de suppression
    if (isInspectionMode) {
      alert("Mode lecture seule : vous ne pouvez pas supprimer d'images.");
      return;
    }

    if (!window.confirm(`Supprimer l’image « ${img.nom || "image"} » ?`)) {
      return;
    }

    try {
      await deleteDoc(
        doc(
          db,
          "companies",
          effectiveCompanyId,
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
      {/* Header avec badge mode inspection */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <ImageIcon className="text-orange-600" />
        <h1 className="text-2xl font-bold">
          Bibliothèque d’images de la compagnie
        </h1>
        {isInspectionMode && (
          <span className="ml-2 px-2.5 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full">
            Mode inspection • Lecture seule
          </span>
        )}
      </div>

      {/* Upload - masqué en mode inspection */}
      {!isInspectionMode && (
        <div className="mb-6 max-w-sm">
          <UploadImageCloudinary
            label="Ajouter une image"
            dossier={`companies/${effectiveCompanyId}`}
            collectionName={`companies/${effectiveCompanyId}/imagesBibliotheque`}
            onUpload={() => {
              // rien à faire, onSnapshot s’en charge
            }}
          />
        </div>
      )}

      {/* Message lecture seule en mode inspection */}
      {isInspectionMode && images.length > 0 && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700 flex items-center gap-2">
          <span>🔍</span>
          <span>
            Vous êtes en mode consultation. Les actions de suppression sont désactivées.
          </span>
        </div>
      )}

      {/* Contenu */}
      {loading ? (
        <GridSkeleton />
      ) : images.length === 0 ? (
        <EmptyState 
          isInspectionMode={isInspectionMode} 
        />
      ) : (
        <ImageGrid 
          items={images} 
          onDelete={handleDelete}
          isReadOnly={isInspectionMode}
        />
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

const EmptyState: React.FC<{ isInspectionMode?: boolean }> = ({ 
  isInspectionMode 
}) => (
  <div className="border rounded-lg p-10 bg-white text-center text-gray-600">
    <div className="flex items-center justify-center mb-3 text-gray-400">
      <ImageIcon size={32} />
    </div>
    <div className="font-semibold">Aucune image</div>
    <div className="text-sm text-gray-500 mt-1">
      {isInspectionMode 
        ? "Cette compagnie n'a pas encore d'images dans sa bibliothèque."
        : "Ajoutez votre première image avec le bouton ci-dessus."
      }
    </div>
  </div>
);

const ImageGrid: React.FC<{
  items: ImgDoc[];
  onDelete: (img: ImgDoc) => void;
  isReadOnly?: boolean;
}> = ({ items, onDelete, isReadOnly }) => (
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

        {/* Bouton supprimer - caché en mode lecture seule */}
        {!isReadOnly && (
          <button
            onClick={() => onDelete(img)}
            className="absolute top-2 right-2 hidden group-hover:flex items-center justify-center
                       bg-red-600 text-white rounded-full p-1.5 shadow hover:bg-red-700 transition"
            title="Supprimer"
          >
            <Trash2 size={14} />
          </button>
        )}

        {/* Badge lecture seule pour mode inspection */}
        {isReadOnly && (
          <div className="absolute top-2 right-2 bg-gray-800/70 text-white text-xs px-2 py-1 rounded-full">
            Lecture seule
          </div>
        )}

        {img.nom && (
          <figcaption className="text-xs px-2 py-1.5 border-t text-gray-600 truncate bg-gray-50">
            {img.nom}
          </figcaption>
        )}
      </figure>
    ))}
  </div>
);

export default BibliothequeImagesPage;