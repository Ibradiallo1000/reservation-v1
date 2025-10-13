// src/pages/BibliothequeImagesPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import UploadImageCloudinary from "@/pages/UploadImageCloudinary"; // <-- important : bon chemin
import { Image as ImageIcon, Cloud, Image } from "lucide-react";

type ImgDoc = {
  id: string;
  url: string;
  nom?: string;
  type?: string;
  createdAt?: any;
};

type TabKey = "company" | "platform";

const BibliothequeImagesPage: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabKey>("company");

  const [companyImages, setCompanyImages] = useState<ImgDoc[]>([]);
  const [platformImages, setPlatformImages] = useState<ImgDoc[]>([]);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [loadingPlatform, setLoadingPlatform] = useState(true);

  const canUpload = useMemo(() => !!user?.companyId, [user?.companyId]);

  // ---- MES IMAGES (companies/{companyId}/imagesBibliotheque)
  useEffect(() => {
    if (!user?.companyId) {
      setCompanyImages([]);
      setLoadingCompany(false);
      return;
    }
    setLoadingCompany(true);
    const colRef = collection(db, `companies/${user.companyId}/imagesBibliotheque`);
    const qy = query(colRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setCompanyImages(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        );
        setLoadingCompany(false);
      },
      (err) => {
        console.error("onSnapshot company images:", err);
        setCompanyImages([]);
        setLoadingCompany(false);
      }
    );
    return () => unsub();
  }, [user?.companyId]);

  // ---- IMAGES PLATEFORME (mediaPlatform)
  useEffect(() => {
    setLoadingPlatform(true);
    const colRef = collection(db, "mediaPlatform");
    const qy = query(colRef, orderBy("createdAt", "desc"));
    const unsub = onSnapshot(
      qy,
      (snap) => {
        setPlatformImages(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        );
        setLoadingPlatform(false);
      },
      (err) => {
        console.error("onSnapshot platform images:", err);
        setPlatformImages([]);
        setLoadingPlatform(false);
      }
    );
    return () => unsub();
  }, []);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Image className="text-orange-600" />
          <h1 className="text-2xl font-bold">Bibliothèque d’images</h1>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex gap-2">
        <button
          onClick={() => setTab("company")}
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${
            tab === "company"
              ? "bg-orange-600 text-white border-orange-700"
              : "bg-white text-gray-700 hover:bg-gray-50 border-gray-200"
          }`}
        >
          Mes images
        </button>
        <button
          onClick={() => setTab("platform")}
          className={`px-4 py-2 rounded-lg text-sm font-medium border ${
            tab === "platform"
              ? "bg-orange-600 text-white border-orange-700"
              : "bg-white text-gray-700 hover:bg-gray-50 border-gray-200"
          }`}
        >
          Images plateforme
        </button>
      </div>

      {/* Upload (seulement sur l’onglet "Mes images") */}
      {tab === "company" && (
        <div className="mb-6">
          {canUpload ? (
            <UploadImageCloudinary
              label="Ajouter une image"
              dossier={`companies/${user!.companyId}`}
              className="max-w-sm"
              // ⛔️ PAS de collectionName ici (écrit par défaut dans companies/{companyId}/imagesBibliotheque)
              onUpload={async () => {
                // rien à faire : la liste se met à jour via onSnapshot
              }}
            />
          ) : (
            <div className="rounded-lg border p-4 bg-yellow-50 text-yellow-800 text-sm">
              Connectez-vous en tant qu’admin de compagnie pour téléverser.
            </div>
          )}
        </div>
      )}

      {/* Grilles */}
      {tab === "company" ? (
        <div>
          {loadingCompany ? (
            <GridSkeleton />
          ) : companyImages.length === 0 ? (
            <EmptyState
              icon={<ImageIcon />}
              title="Aucune image"
              subtitle="Ajoutez votre première image avec le bouton ci-dessus."
            />
          ) : (
            <ImageGrid items={companyImages} />
          )}
        </div>
      ) : (
        <div>
          {loadingPlatform ? (
            <GridSkeleton />
          ) : platformImages.length === 0 ? (
            <EmptyState
              icon={<Cloud />}
              title="Aucune image plateforme"
              subtitle="Demandez à l’admin plateforme d’ajouter des médias."
            />
          ) : (
            <ImageGrid items={platformImages} />
          )}
        </div>
      )}
    </div>
  );
};

/* --- UI helpers --- */

const GridSkeleton: React.FC = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="h-32 w-full rounded-lg bg-gray-100 animate-pulse" />
    ))}
  </div>
);

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; subtitle: string }> = ({
  icon,
  title,
  subtitle,
}) => (
  <div className="border rounded-lg p-10 bg-white text-center text-gray-600">
    <div className="flex items-center justify-center mb-3 text-gray-400">{icon}</div>
    <div className="font-semibold">{title}</div>
    <div className="text-sm text-gray-500 mt-1">{subtitle}</div>
  </div>
);

const ImageGrid: React.FC<{ items: ImgDoc[] }> = ({ items }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
    {items.map((img) => (
      <figure
        key={img.id}
        className="rounded-lg overflow-hidden border bg-white hover:shadow-md transition"
        title={img.nom || "image"}
      >
        <img
          src={img.url}
          alt={img.nom || "image"}
          className="h-32 w-full object-cover"
          loading="lazy"
          decoding="async"
        />
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
