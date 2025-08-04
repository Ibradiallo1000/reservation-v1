// ✅ src/pages/AdminParametresPlatformPage.tsx
import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import ImageSelectorModal from "../components/ui/ImageSelectorModal";
import { HexColorPicker } from "react-colorful";
import { motion, AnimatePresence } from "framer-motion";
import {
  Palette,
  Image as ImageIcon,
  Save,
  CheckCircle,
  AlertCircle,
  Trash2,
  Upload,
} from "lucide-react";

interface PlatformSettings {
  accroche: string;
  instructionRecherche: string;
  logoUrl: string;
  faviconUrl: string;
  banniereUrl: string;
  imagesSlider: string[];
  couleurPrimaire: string;
  couleurSecondaire: string;
  themeStyle: string;
}

const AdminParametresPlatformPage: React.FC = () => {
  const [settings, setSettings] = useState<PlatformSettings>({
    accroche: "Voyagez avec Teliya",
    instructionRecherche: "Remplissez les champs ci-dessous pour trouver un trajet",
    logoUrl: "",
    faviconUrl: "",
    banniereUrl: "",
    imagesSlider: [],
    couleurPrimaire: "#ea580c",
    couleurSecondaire: "#16a34a",
    themeStyle: "moderne",
  });

  const [message, setMessage] = useState({ text: "", type: "" });
  const [modalType, setModalType] = useState<null | "logo" | "favicon" | "banniere" | "slider">(null);
  const [showColorPicker, setShowColorPicker] = useState<null | "primary" | "secondary">(null);

  // Charger les paramètres plateforme
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const ref = doc(db, "platform", "settings");
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setSettings(prev => ({ ...prev, ...snap.data() }));
        }
      } catch (err) {
        console.error("Erreur de chargement des paramètres plateforme:", err);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
  try {
    const ref = doc(db, "platform", "settings");

    const payload: Partial<PlatformSettings> = {
      accroche: settings.accroche || "",
      instructionRecherche: settings.instructionRecherche || "",
      logoUrl: settings.logoUrl || "",
      faviconUrl: settings.faviconUrl || "",
      banniereUrl: settings.banniereUrl || "",
      imagesSlider: Array.isArray(settings.imagesSlider) ? settings.imagesSlider : [],
      couleurPrimaire: settings.couleurPrimaire || "#ea580c",
      couleurSecondaire: settings.couleurSecondaire || "#16a34a",
      themeStyle: settings.themeStyle || "moderne",
    };

    // ✅ setDoc au lieu de updateDoc
    await setDoc(ref, payload, { merge: true });
    setMessage({ text: "Paramètres enregistrés avec succès ✅", type: "success" });
  } catch (err) {
    console.error("Erreur d'enregistrement:", err);
    setMessage({ text: "Échec de la mise à jour ❌", type: "error" });
  }
};

  const handleImageSelect = (url: string) => {
    if (!modalType) return;
    if (modalType === "logo") setSettings(prev => ({ ...prev, logoUrl: url }));
    if (modalType === "favicon") setSettings(prev => ({ ...prev, faviconUrl: url }));
    if (modalType === "banniere") setSettings(prev => ({ ...prev, banniereUrl: url }));
    if (modalType === "slider") setSettings(prev => ({ ...prev, imagesSlider: [...prev.imagesSlider, url] }));
    setModalType(null);
  };

  const handleImageRemove = (index: number) => {
    setSettings(prev => ({
      ...prev,
      imagesSlider: prev.imagesSlider.filter((_, i) => i !== index),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-5xl mx-auto"
      >
        <h1 className="text-2xl font-bold mb-6 text-gray-800">
          Paramètres de la plateforme
        </h1>

        <AnimatePresence>
          {message.text && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`p-4 rounded-lg shadow-md mb-4 ${
                message.type === "success"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {message.type === "success" ? (
                <CheckCircle className="inline mr-2" />
              ) : (
                <AlertCircle className="inline mr-2" />
              )}
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Textes principaux */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Textes principaux</h3>
          <input
            type="text"
            value={settings.accroche}
            onChange={e => setSettings({ ...settings, accroche: e.target.value })}
            className="w-full mb-3 px-4 py-2 border rounded-lg"
            placeholder="Phrase d'accroche"
          />
          <input
            type="text"
            value={settings.instructionRecherche}
            onChange={e => setSettings({ ...settings, instructionRecherche: e.target.value })}
            className="w-full px-4 py-2 border rounded-lg"
            placeholder="Instruction de recherche"
          />
        </div>

        {/* Couleurs */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Palette /> Couleurs
          </h3>
          <div className="flex gap-6">
            {[
              { key: "couleurPrimaire", name: "Primaire" },
              { key: "couleurSecondaire", name: "Secondaire" },
            ].map(color => (
              <div key={color.key}>
                <label className="block text-sm mb-2">{color.name}</label>
                <div
                  className="h-12 w-12 rounded-full border cursor-pointer"
                   style={{ backgroundColor: settings[color.key as keyof PlatformSettings] as string }}
                  onClick={() =>
                    setShowColorPicker(
                      color.key === "couleurPrimaire" ? "primary" : "secondary"
                    )
                  }
                />
                {showColorPicker ===
                  (color.key === "couleurPrimaire" ? "primary" : "secondary") && (
                  <div className="mt-2">
                    <HexColorPicker
                      color={settings[color.key as keyof PlatformSettings] as string}
                      onChange={newColor =>
                        setSettings({ ...settings, [color.key]: newColor })
                      }
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Images */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ImageIcon /> Images
          </h3>

          {/* Logo */}
          <div className="mb-4">
            <label className="block text-sm mb-2">Logo</label>
            {settings.logoUrl ? (
              <div className="flex items-center gap-4">
                <img src={settings.logoUrl} alt="logo" className="h-16 w-16 object-contain" />
                <button
                  onClick={() => setModalType("logo")}
                  className="bg-gray-100 px-3 py-1 rounded"
                >
                  Changer
                </button>
              </div>
            ) : (
              <button
                onClick={() => setModalType("logo")}
                className="px-4 py-2 border rounded-lg"
              >
                Ajouter un logo
              </button>
            )}
          </div>

          {/* Favicon */}
          <div className="mb-4">
            <label className="block text-sm mb-2">Favicon</label>
            {settings.faviconUrl ? (
              <div className="flex items-center gap-4">
                <img src={settings.faviconUrl} alt="favicon" className="h-10 w-10 object-contain" />
                <button
                  onClick={() => setModalType("favicon")}
                  className="bg-gray-100 px-3 py-1 rounded"
                >
                  Changer
                </button>
              </div>
            ) : (
              <button
                onClick={() => setModalType("favicon")}
                className="px-4 py-2 border rounded-lg"
              >
                Ajouter un favicon
              </button>
            )}
          </div>

          {/* Bannière */}
          <div className="mb-4">
            <label className="block text-sm mb-2">Bannière</label>
            {settings.banniereUrl ? (
              <div>
                <img
                  src={settings.banniereUrl}
                  alt="bannière"
                  className="h-32 w-full object-cover rounded-lg"
                />
                <button
                  onClick={() => setModalType("banniere")}
                  className="mt-2 bg-gray-100 px-3 py-1 rounded"
                >
                  Changer
                </button>
              </div>
            ) : (
              <button
                onClick={() => setModalType("banniere")}
                className="px-4 py-2 border rounded-lg"
              >
                Ajouter une bannière
              </button>
            )}
          </div>

          {/* Slider */}
          <div>
            <label className="block text-sm mb-2">
              Images du slider ({settings.imagesSlider.length})
            </label>
            <div className="grid grid-cols-3 gap-3">
              {settings.imagesSlider.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Slide ${index}`}
                    className="h-24 w-full object-cover rounded-lg"
                  />
                  <button
                    onClick={() => handleImageRemove(index)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setModalType("slider")}
              className="mt-2 text-blue-600 flex items-center gap-2"
            >
              <Upload size={16} /> Ajouter des images
            </button>
          </div>
        </div>

        {/* Bouton sauvegarder */}
        <button
          onClick={handleSave}
          className="bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 flex items-center gap-2"
        >
          <Save size={20} /> Sauvegarder
        </button>

        {modalType && (
          <ImageSelectorModal
            onSelect={handleImageSelect}
            onClose={() => setModalType(null)} companyId={""}          />
        )}
      </motion.div>
    </div>
  );
};

export default AdminParametresPlatformPage;
