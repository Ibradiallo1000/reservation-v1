// src/pages/MediaPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, deleteDoc, doc, addDoc, Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import useCompanyTheme from "@/hooks/useCompanyTheme";
import UploadImageCloudinary from "./UploadImageCloudinary";

type ImageKind = "logo" | "banniere" | "favicon" | "slider" | "autre";

type ImageItem = {
  id?: string;                 // présent pour les docs de mediaPlatform
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
  // thème visuel (pour le header)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, theme.colors.primary, theme.colors.secondary]);

  /* ---------- Charger la collection + settings ---------- */
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // 1) docs de la collection mediaPlatform (plateforme uniquement)
        const snap = await getDocs(collection(db, "mediaPlatform"));
        const fromCollection: ImageItem[] = snap.docs.map((d) => {
          const raw = d.data() as any;
          return {
            id: d.id,
            url: String(raw.url ?? ""),
            type: (raw.type as ImageKind) || "autre",
            nom: String(raw.nom ?? "Image"),
            createdAt: raw.createdAt?.toDate?.() ?? null,
            source: "collection" as const,
          };
        });

        // 2) URLs enregistrées dans platform/settings
        const sSnap = await getDoc(SETTINGS_REF);
        const s = (sSnap.exists() ? (sSnap.data() as PlatformSettings) : {}) || {};
        const urlsFromSettings: { url: string; type: ImageKind; nom: string }[] = [];
        if (s.logoUrl) urlsFromSettings.push({ url: s.logoUrl, type: "logo", nom: "Logo plateforme" });
        if (s.faviconUrl) urlsFromSettings.push({ url: s.faviconUrl, type: "favicon", nom: "Favicon" });
        if (s.banniereUrl) urlsFromSettings.push({ url: s.banniereUrl, type: "banniere", nom: "Bannière" });
        (s.imagesSlider || []).forEach((u, i) =>
          urlsFromSettings.push({ url: u, type: "slider", nom: `Slider #${i + 1}` })
        );

        const fromSettings: ImageItem[] = urlsFromSettings.map((u) => ({
          url: u.url,
          type: u.type,
          nom: u.nom,
          createdAt: null,
          source: "settings" as const,
        }));

        // 3) fusion + dédup par URL, tri par date (collection d’abord)
        const map = new Map<string, ImageItem>();
        [...fromCollection, ...fromSettings].forEach((it) => {
          if (!map.has(it.url)) map.set(it.url, it);
        });
        const merged = Array.from(map.values()).sort(
          (a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0)
        );

        setItems(merged);
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
      // On ne supprime que les éléments présents dans la collection.
      // Ceux provenant de settings sont gérés via la page Paramètres.
      alert("Cette image provient des paramètres. Modifiez-la depuis Paramètres > Plateforme.");
      return;
    }
    if (!window.confirm(`Supprimer « ${item.nom} » ?`)) return;
    try {
      await deleteDoc(doc(db, "mediaPlatform", item.id));
      // recharger
      const remaining = items.filter((x) => x.id !== item.id);
      setItems(remaining);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de la suppression.");
    }
  };

  const addFromUpload = async (url: string) => {
    try {
      const ref = await addDoc(collection(db, "mediaPlatform"), {
        url,
        type: "autre",
        nom: "Image",
        createdAt: Timestamp.now(),
      });
      setItems((prev) => [
        { id: ref.id, url, type: "autre", nom: "Image", createdAt: new Date(), source: "collection" },
        ...prev,
      ]);
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'ajout du média.");
    }
  };

  /* ---------- Rendu ---------- */
  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
        <UploadImageCloudinary
          label="Ajouter une image à la bibliothèque plateforme"
          dossier="platform"
          collectionName="mediaPlatform"
          onUpload={addFromUpload}
          className="w-full"
        />
      </div>

      {err && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-4">{err}</div>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-40 w-full rounded bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-orange-50 border border-orange-200 text-orange-800 rounded-lg p-6">
          Aucun média de plateforme.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {items.map((img) => (
            <div
              key={`${img.source}-${img.id ?? img.url}`}
              className="bg-white border border-gray-100 rounded-xl shadow-sm hover:shadow-md transition overflow-hidden"
            >
              <div className="relative h-40">
                <img src={img.url} alt={img.nom} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{img.nom}</p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {img.type}
                    {img.source === "settings" ? " • (paramètres)" : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{img.createdAt ? img.createdAt.toLocaleDateString("fr-FR") : "—"}</span>
                  {img.source === "collection" ? (
                    <button onClick={() => remove(img)} className="font-medium hover:underline text-red-600">
                      Supprimer
                    </button>
                  ) : (
                    <span className="opacity-60">géré dans Paramètres</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MediaPage;
