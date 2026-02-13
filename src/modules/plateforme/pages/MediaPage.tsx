// src/pages/MediaPage.tsx
import React, { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  addDoc,
  Timestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import UploadImageCloudinary from "@/shared/components/UploadImageCloudinary";

type ImageKind = "logo" | "banniere" | "favicon" | "slider" | "autre";

type ImageItem = {
  id?: string;
  url: string;
  type: ImageKind;
  nom: string;
  createdAt?: Date | null;
  source: "collection" | "settings";
};

type PlatformSettings = {
  logoUrl?: string;
  faviconUrl?: string;
  banniereUrl?: string;
  imagesSlider?: string[];
};

const SETTINGS_REF = doc(db, "platform", "settings");

const MediaPage: React.FC = () => {
  const theme = useCompanyTheme(undefined);
  const { setHeader, resetHeader } = usePageHeader();

  const [items, setItems] = useState<ImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  /* ---------- Header ---------- */
  useEffect(() => {
    setHeader({
      title: "Médias plateforme",
      subtitle: items.length ? `${items.length} élément(s)` : "Aucun média",
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: "#fff",
    });
    return () => resetHeader();
  }, [items.length, theme.colors.primary, theme.colors.secondary]);

  /* ---------- Chargement ---------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // ✅ COLLECTION CORRECTE
        const snap = await getDocs(collection(db, "medias"));
        const fromCollection: ImageItem[] = snap.docs.map((d) => {
          const raw = d.data() as any;
          return {
            id: d.id,
            url: String(raw.url ?? ""),
            type: (raw.type as ImageKind) || "autre",
            nom: String(raw.nom ?? "Image"),
            createdAt: raw.createdAt?.toDate?.() ?? null,
            source: "collection",
          };
        });

        const sSnap = await getDoc(SETTINGS_REF);
        const s = sSnap.exists() ? (sSnap.data() as PlatformSettings) : {};

        const fromSettings: ImageItem[] = [
          s.logoUrl && { url: s.logoUrl, type: "logo", nom: "Logo plateforme" },
          s.faviconUrl && { url: s.faviconUrl, type: "favicon", nom: "Favicon" },
          s.banniereUrl && { url: s.banniereUrl, type: "banniere", nom: "Bannière" },
          ...(s.imagesSlider || []).map((u, i) => ({
            url: u,
            type: "slider" as ImageKind,
            nom: `Slider #${i + 1}`,
          })),
        ]
          .filter(Boolean)
          .map((u: any) => ({
            ...u,
            createdAt: null,
            source: "settings",
          }));

        const map = new Map<string, ImageItem>();
        [...fromCollection, ...fromSettings].forEach((it) => {
          if (!map.has(it.url)) map.set(it.url, it);
        });

        setItems(
          Array.from(map.values()).sort(
            (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
          )
        );
      } catch (e) {
        console.error("Erreur chargement médias plateforme:", e);
        setErr("Impossible de charger les médias de la plateforme.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ---------- Actions ---------- */
  const remove = async (item: ImageItem) => {
    if (item.source !== "collection" || !item.id) {
      alert("Image gérée depuis Paramètres > Plateforme.");
      return;
    }
    if (!window.confirm(`Supprimer « ${item.nom} » ?`)) return;
    await deleteDoc(doc(db, "medias", item.id));
    setItems((prev) => prev.filter((x) => x.id !== item.id));
  };

  const addFromUpload = async (url: string) => {
    const ref = await addDoc(collection(db, "medias"), {
      url,
      type: "autre",
      nom: "Image",
      createdAt: Timestamp.now(),
    });
    setItems((prev) => [
      { id: ref.id, url, type: "autre", nom: "Image", createdAt: new Date(), source: "collection" },
      ...prev,
    ]);
  };

  /* ---------- UI ---------- */
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="bg-white p-4 rounded-xl shadow-sm border mb-6">
        <UploadImageCloudinary
          label="Ajouter une image à la bibliothèque plateforme"
          dossier="platform"
          collectionName="medias"
          onUpload={addFromUpload}
        />
      </div>

      {err && <div className="bg-red-50 text-red-700 p-4 rounded mb-4">{err}</div>}

      {loading ? (
        <p>Chargement…</p>
      ) : items.length === 0 ? (
        <div className="bg-orange-50 p-6 rounded">Aucun média de plateforme.</div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {items.map((img) => (
            <div key={`${img.source}-${img.id ?? img.url}`} className="border rounded overflow-hidden">
              <img src={img.url} alt={img.nom} className="h-40 w-full object-cover" />
              <div className="p-2 text-sm flex justify-between">
                <span>{img.nom}</span>
                {img.source === "collection" && (
                  <button onClick={() => remove(img)} className="text-red-600">
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaPage;
