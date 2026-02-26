// =============================================
// src/pages/ParametresReseauxPage.tsx
// =============================================

import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useParams } from "react-router-dom";
import { Save } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/shared/ui/button";
interface Props {
  companyId: string;
}

type SocialPlatform =
  | "facebook"
  | "instagram"
  | "whatsapp"
  | "tiktok"
  | "linkedin"
  | "youtube";

const defaultSocialMedia = {
  facebook: "",
  instagram: "",
  whatsapp: "",
  tiktok: "",
  linkedin: "",
  youtube: "",
};

const ParametresReseauxPage: React.FC<Props> = ({ companyId }) => {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams();

  // 🔥 IMPORTANT : priorité URL → sinon user
  const effectiveCompanyId =
    routeCompanyId ?? user?.companyId ?? null;

  const [socialMedia, setSocialMedia] =
    useState(defaultSocialMedia);
  const [showSocialMedia, setShowSocialMedia] =
    useState(true);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "info" | "";
  }>({ text: "", type: "" });

  /* =========================
     Chargement
  ========================= */
  useEffect(() => {
    if (!effectiveCompanyId) return;

    const fetchData = async () => {
      try {
        const ref = doc(db, "companies", effectiveCompanyId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data();

          setSocialMedia(
            data.socialMedia || defaultSocialMedia
          );

          setShowSocialMedia(
            data.footerConfig?.showSocialMedia ?? true
          );
        }
      } catch (error) {
        console.error(
          "Erreur chargement réseaux:",
          error
        );
      }
    };

    fetchData();
  }, [effectiveCompanyId]);

  /* =========================
     Enregistrement
  ========================= */
  const handleSave = async () => {
    if (!effectiveCompanyId) return;

    setLoading(true);
    setMessage({ text: "Enregistrement...", type: "info" });

    try {
      const ref = doc(db, "companies", effectiveCompanyId);

      await setDoc(
        ref,
        {
          socialMedia,
          footerConfig: {
            showSocialMedia,
          },
        },
        { merge: true }
      );

      setMessage({
        text: "Modifications enregistrées ✅",
        type: "success",
      });
    } catch (error) {
      console.error(
        "Erreur enregistrement réseaux:",
        error
      );

      setMessage({
        text: "Erreur lors de l'enregistrement ❌",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  if (!effectiveCompanyId) {
    return (
      <div className="p-6 text-red-600">
        Company ID introuvable.
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6 bg-white rounded-xl shadow-sm border">
      <h2 className="text-xl font-bold mb-6">
        Réseaux sociaux & affichage
      </h2>

      {/* MESSAGE */}
      <AnimatePresence>
        {message.text && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`p-4 rounded mb-4 text-sm ${
              message.type === "success"
                ? "bg-green-100 text-green-800"
                : message.type === "error"
                ? "bg-red-100 text-red-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            {message.text}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-4">
        {(
          [
            "facebook",
            "instagram",
            "whatsapp",
            "tiktok",
            "linkedin",
            "youtube",
          ] as SocialPlatform[]
        ).map((platform) => (
          <div key={platform}>
            <label className="block text-sm font-medium mb-1 capitalize">
              Lien {platform}
            </label>

            <input
              type="url"
              value={socialMedia[platform]}
              onChange={(e) =>
                setSocialMedia((prev) => ({
                  ...prev,
                  [platform]: e.target.value,
                }))
              }
              placeholder={`https://${platform}.com/...`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
          </div>
        ))}
      </div>

      <div className="mt-6">
        <label className="inline-flex items-center text-sm">
          <input
            type="checkbox"
            checked={showSocialMedia}
            onChange={(e) =>
              setShowSocialMedia(e.target.checked)
            }
            className="mr-2"
          />
          Afficher les icônes dans le pied de page
        </label>
      </div>

      <div className="flex justify-end mt-6">
        <Button
          onClick={handleSave}
          disabled={loading}
          variant="primary"
        >
          <Save size={18} />
          {loading ? "Enregistrement..." : "Enregistrer"}
        </Button>
      </div>
    </div>
  );
};

export default ParametresReseauxPage;
