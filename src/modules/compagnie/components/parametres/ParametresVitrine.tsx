// =============================================
// src/pages/ParametresVitrine.tsx
// VERSION STABLE ADMIN PLATEFORME
// =============================================

import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import ImageSelectorModal from "@/shared/ui/ImageSelectorModal";
import { HexColorPicker } from "react-colorful";
import { DocumentData } from "firebase/firestore";
import { Button } from "@/shared/ui/button";
import { SectionCard } from "@/ui";

import {
  Image as ImageIcon,
  Info,
  Palette,
  Save,
  Settings,
  TextCursorInput,
} from "lucide-react";
import type { CompanyAbout } from "@/types/companyTypes";

interface ParametresVitrineProps {
  companyId?: string;
}

type ThemeStyle =
  | "moderne"
  | "classique"
  | "sombre"
  | "contraste"
  | "minimaliste"
  | "glassmorphism";

interface CompanyData {
  accroche: string;
  instructionRecherche: string;
  logoUrl: string;
  faviconUrl: string;
  banniereUrl: string;
  couleurPrimaire: string;
  couleurSecondaire: string;
  couleurAccent: string;
  couleurTertiaire: string;
  themeStyle: ThemeStyle;
  about?: CompanyAbout;
}

const ParametresVitrine: React.FC<ParametresVitrineProps> = ({
  companyId: propCompanyId,
}) => {
  const { user } = useAuth();

  // 🔥 Support ADMIN PLATEFORME + ADMIN COMPAGNIE
  const effectiveCompanyId = propCompanyId ?? user?.companyId;

  const [companyData, setCompanyData] = useState<CompanyData>({
    accroche: "",
    instructionRecherche: "",
    logoUrl: "",
    faviconUrl: "",
    banniereUrl: "",
    couleurPrimaire: "#3B82F6",
    couleurSecondaire: "#10B981",
    couleurAccent: "#FBBF24",
    couleurTertiaire: "#F472B6",
    themeStyle: "moderne",
    about: {},
  });

  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "info" | "";
  }>({ text: "", type: "" });

  const [modalType, setModalType] =
    useState<null | "logo" | "favicon" | "banniereStatique">(null);

  const [showColorPicker, setShowColorPicker] =
    useState<keyof CompanyData | null>(null);

  /* ================= LOAD ================= */

  useEffect(() => {
    if (!effectiveCompanyId) return;

    const fetchData = async () => {
      try {
        const snap = await getDoc(
          doc(db, "companies", effectiveCompanyId)
        );
        if (snap.exists()) {
          const data = snap.data();
          setCompanyData((prev) => ({
            ...prev,
            ...data,
            about: data?.about && typeof data.about === "object" ? { ...data.about } : {},
          }));
        }
      } catch (e) {
        console.error("Erreur chargement vitrine:", e);
      }
    };

    fetchData();
  }, [effectiveCompanyId]);

  /* ================= SAVE ================= */

  const handleSave = async () => {
    if (!effectiveCompanyId) return;

    setMessage({ text: "Enregistrement...", type: "info" });

    const aboutRaw = companyData.about ?? {};
    const aboutClean: Record<string, unknown> = {};
    if (aboutRaw.description !== undefined && aboutRaw.description !== "") aboutClean.description = aboutRaw.description;
    if (aboutRaw.yearsExperience !== undefined && aboutRaw.yearsExperience !== null) aboutClean.yearsExperience = aboutRaw.yearsExperience;
    if (aboutRaw.destinationsCount !== undefined && aboutRaw.destinationsCount !== null) aboutClean.destinationsCount = aboutRaw.destinationsCount;
    if (aboutRaw.satisfactionRate !== undefined && aboutRaw.satisfactionRate !== null) aboutClean.satisfactionRate = aboutRaw.satisfactionRate;
    if (aboutRaw.support24h === true) aboutClean.support24h = true;

    const payload: Partial<DocumentData> = { ...companyData };
    payload.about = Object.keys(aboutClean).length > 0 ? aboutClean : {};

    try {
      await updateDoc(
        doc(db, "companies", effectiveCompanyId),
        payload
      );

      setMessage({
        text: "Modifications enregistrées",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      setMessage({
        text: "Erreur lors de l'enregistrement",
        type: "error",
      });
    }
  };

  /* ================= IMAGE SELECT ================= */

  const handleImageSelect = (url: string) => {
    if (!modalType) return;

    setCompanyData((prev) => ({
      ...prev,
      ...(modalType === "logo" && { logoUrl: url }),
      ...(modalType === "favicon" && { faviconUrl: url }),
      ...(modalType === "banniereStatique" && { banniereUrl: url }),
    }));

    setModalType(null);
  };

  /* ================= UI ================= */

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-6">
      <div className="max-w-7xl mx-auto space-y-6">

        <SectionCard title="Personnalisation de la vitrine" icon={Settings}>
          <p className="text-gray-500 mb-4">Configuration de la page publique</p>
        </SectionCard>

        <SectionCard title="Textes personnalisés" icon={TextCursorInput}>

          <input
            type="text"
            placeholder="Phrase d'accroche"
            value={companyData.accroche}
            onChange={(e) =>
              setCompanyData({
                ...companyData,
                accroche: e.target.value,
              })
            }
            className="w-full border rounded-lg px-4 py-2"
          />

          <input
            type="text"
            placeholder="Instruction de recherche"
            value={companyData.instructionRecherche}
            onChange={(e) =>
              setCompanyData({
                ...companyData,
                instructionRecherche: e.target.value,
              })
            }
            className="w-full border rounded-lg px-4 py-2"
          />
        </SectionCard>

        <SectionCard title="À propos de la compagnie" icon={Info}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Présentation publique</label>
              <textarea
                placeholder="Description affichée sur la page publique"
                value={companyData.about?.description ?? ""}
                onChange={(e) =>
                  setCompanyData({
                    ...companyData,
                    about: {
                      ...(companyData.about ?? {}),
                      description: e.target.value.slice(0, 1000),
                    },
                  })
                }
                maxLength={1000}
                rows={4}
                className="w-full border border-gray-200 rounded-lg px-4 py-2 resize-y"
              />
              <span className="text-xs text-gray-500">
                {(companyData.about?.description?.length ?? 0)} / 1000
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Années d&apos;expérience</label>
                <input
                  type="number"
                  min={0}
                  placeholder="Optionnel"
                  value={companyData.about?.yearsExperience ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = v === "" ? undefined : parseInt(v, 10);
                    setCompanyData({
                      ...companyData,
                      about: {
                        ...(companyData.about ?? {}),
                        yearsExperience: Number.isNaN(n) ? undefined : n,
                      },
                    });
                  }}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Nombre de destinations</label>
                <input
                  type="number"
                  min={0}
                  placeholder="Optionnel"
                  value={companyData.about?.destinationsCount ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    const n = v === "" ? undefined : parseInt(v, 10);
                    setCompanyData({
                      ...companyData,
                      about: {
                        ...(companyData.about ?? {}),
                        destinationsCount: Number.isNaN(n) ? undefined : n,
                      },
                    });
                  }}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Taux de satisfaction (%)</label>
              <input
                type="number"
                min={0}
                max={100}
                placeholder="0–100"
                value={companyData.about?.satisfactionRate ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "") {
                    setCompanyData({
                      ...companyData,
                      about: { ...(companyData.about ?? {}), satisfactionRate: undefined },
                    });
                    return;
                  }
                  const n = Math.min(100, Math.max(0, parseInt(v, 10) || 0));
                  setCompanyData({
                    ...companyData,
                    about: { ...(companyData.about ?? {}), satisfactionRate: n },
                  });
                }}
                className="w-full border border-gray-200 rounded-lg px-4 py-2 max-w-[120px]"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="block text-sm font-medium">Support 24/7</label>
              <button
                type="button"
                role="switch"
                aria-checked={companyData.about?.support24h ?? false}
                onClick={() =>
                  setCompanyData({
                    ...companyData,
                    about: {
                      ...(companyData.about ?? {}),
                      support24h: !(companyData.about?.support24h ?? false),
                    },
                  })
                }
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  companyData.about?.support24h ? "bg-gray-900" : "bg-gray-200"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    companyData.about?.support24h ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </button>
              <span className="text-sm text-gray-600">
                {companyData.about?.support24h ? "Oui" : "Non"}
              </span>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Couleurs" icon={Palette}>

          <div className="grid grid-cols-2 gap-6">
            {(
              [
                "couleurPrimaire",
                "couleurSecondaire",
                "couleurAccent",
                "couleurTertiaire",
              ] as (keyof CompanyData)[]
            ).map((key) => (
              <div key={key}>
                <div
                  className="h-10 w-10 rounded border cursor-pointer"
                  style={{
                    backgroundColor: companyData[key] as string,
                  }}
                  onClick={() => setShowColorPicker(key)}
                />
                {showColorPicker === key && (
                  <HexColorPicker
                    color={companyData[key] as string}
                    onChange={(color) =>
                      setCompanyData({
                        ...companyData,
                        [key]: color,
                      })
                    }
                  />
                )}
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Images" icon={ImageIcon}>

          <button
            onClick={() => setModalType("logo")}
            className="px-4 py-2 bg-gray-100 rounded"
          >
            Modifier logo
          </button>

          <button
            onClick={() => setModalType("favicon")}
            className="px-4 py-2 bg-gray-100 rounded"
          >
            Modifier favicon
          </button>

          <button
            onClick={() => setModalType("banniereStatique")}
            className="px-4 py-2 bg-gray-100 rounded"
          >
            Modifier bannière
          </button>
        </SectionCard>

        <div className="flex justify-end">
          <Button
            onClick={handleSave}
            variant="primary"
          >
            <Save size={18} className="inline mr-2" />
            Enregistrer
          </Button>
        </div>

        {modalType && effectiveCompanyId && (
          <ImageSelectorModal
            companyId={effectiveCompanyId}
            onSelect={handleImageSelect}
            onClose={() => setModalType(null)}
          />
        )}
      </div>
    </div>
  );
};

export default ParametresVitrine;
