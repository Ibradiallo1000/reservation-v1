// =============================================
// src/pages/ParametresVitrine.tsx
// VERSION STABLE ADMIN PLATEFORME
// =============================================

import React, { useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import ImageSelectorModal from "@/components/ui/ImageSelectorModal";
import { HexColorPicker } from "react-colorful";
import { DocumentData } from "firebase/firestore";

import {
  CheckCircle,
  AlertCircle,
  Save,
  Image as ImageIcon,
  Palette,
  Moon,
  Sun,
  Type,
  Settings,
  TextCursorInput,
} from "lucide-react";

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
          setCompanyData((prev) => ({
            ...prev,
            ...snap.data(),
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

    try {
      await updateDoc(
        doc(db, "companies", effectiveCompanyId),
        companyData as Partial<DocumentData>
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
      <div className="max-w-5xl mx-auto space-y-8">

        {/* HEADER */}
        <div
          className="bg-white rounded-xl shadow-md p-6 border-l-4 flex items-center gap-4"
          style={{ borderLeftColor: companyData.couleurPrimaire }}
        >
          <Settings className="h-8 w-8 text-gray-700" />
          <div>
            <h1 className="text-2xl font-bold">
              Personnalisation de la vitrine
            </h1>
            <p className="text-gray-500">
              Configuration de la page publique
            </p>
          </div>
        </div>

        {/* TEXTES */}
        <div className="bg-white rounded-xl p-6 border space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <TextCursorInput />
            Textes personnalisés
          </h3>

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
        </div>

        {/* COULEURS */}
        <div className="bg-white rounded-xl p-6 border">
          <h3 className="font-semibold flex items-center gap-2 mb-4">
            <Palette />
            Couleurs
          </h3>

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
        </div>

        {/* IMAGES (SANS SLIDER) */}
        <div className="bg-white rounded-xl p-6 border space-y-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ImageIcon />
            Images
          </h3>

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
        </div>

        {/* SAVE */}
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            className="px-6 py-3 rounded text-white"
            style={{ backgroundColor: companyData.couleurPrimaire }}
          >
            <Save size={18} className="inline mr-2" />
            Enregistrer
          </button>
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
