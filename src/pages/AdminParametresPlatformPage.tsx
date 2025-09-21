// src/pages/AdminParametresPlatformPage.tsx
import React, { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import ImageSelectorModal from "@/components/ui/ImageSelectorModal";
import { HexColorPicker } from "react-colorful";
import {
  Save,
  Trash2,
  Upload,
  Palette,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type PlatformSettings = {
  accroche: string;
  instructionRecherche: string;
  logoUrl: string;
  faviconUrl: string;
  banniereUrl: string;
  imagesSlider: string[];
  couleurPrimaire: string;
  couleurSecondaire: string;
  themeStyle: string;
};

const SETTINGS_REF = doc(db, "platform", "settings");

const AdminParametresPlatformPage: React.FC = () => {
  const [settings, setSettings] = useState<PlatformSettings>({
    accroche: "Voyagez avec Teliya",
    instructionRecherche:
      "Remplissez les champs ci-dessous pour trouver un trajet",
    logoUrl: "",
    faviconUrl: "",
    banniereUrl: "",
    imagesSlider: [],
    couleurPrimaire: "#ea580c",
    couleurSecondaire: "#16a34a",
    themeStyle: "moderne",
  });

  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error" | "";
  }>({ text: "", type: "" });
  const [pickerFor, setPickerFor] = useState<
    null | "logo" | "favicon" | "banniere" | "slider"
  >(null);
  const [showColorPicker, setShowColorPicker] = useState<
    null | "primary" | "secondary"
  >(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(SETTINGS_REF);
      if (snap.exists())
        setSettings((prev) => ({
          ...prev,
          ...(snap.data() as Partial<PlatformSettings>),
        }));
    })();
  }, []);

  const save = async () => {
    try {
      await setDoc(SETTINGS_REF, settings, { merge: true });
      setMessage({
        text: "Paramètres enregistrés avec succès ✅",
        type: "success",
      });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Échec de l'enregistrement ❌", type: "error" });
    }
  };

  const onPicked = (url: string) => {
    if (!pickerFor) return;
    if (pickerFor === "logo") setSettings((s) => ({ ...s, logoUrl: url }));
    if (pickerFor === "favicon") setSettings((s) => ({ ...s, faviconUrl: url }));
    if (pickerFor === "banniere")
      setSettings((s) => ({ ...s, banniereUrl: url }));
    if (pickerFor === "slider")
      setSettings((s) => ({ ...s, imagesSlider: [...s.imagesSlider, url] }));
    setPickerFor(null);
  };

  const removeSlide = (i: number) =>
    setSettings((s) => ({
      ...s,
      imagesSlider: s.imagesSlider.filter((_, idx) => idx !== i),
    }));

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
              className={`p-4 rounded-lg shadow mb-4 ${
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

        {/* Textes */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Textes principaux</h3>
          <input
            className="w-full mb-3 px-4 py-2 border rounded-lg"
            value={settings.accroche}
            onChange={(e) =>
              setSettings((s) => ({ ...s, accroche: e.target.value }))
            }
          />
          <input
            className="w-full px-4 py-2 border rounded-lg"
            value={settings.instructionRecherche}
            onChange={(e) =>
              setSettings((s) => ({
                ...s,
                instructionRecherche: e.target.value,
              }))
            }
          />
        </div>

        {/* Couleurs */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Palette /> Couleurs
          </h3>
          <div className="flex gap-6">
            {[
              { key: "couleurPrimaire", name: "Primaire", pick: "primary" as const },
              { key: "couleurSecondaire", name: "Secondaire", pick: "secondary" as const },
            ].map((c) => (
              <div key={c.key}>
                <label className="block text-sm mb-2">{c.name}</label>
                <div
                  className="h-12 w-12 rounded-full border cursor-pointer"
                  style={{ backgroundColor: (settings as any)[c.key] }}
                  onClick={() => setShowColorPicker(c.pick)}
                />
                {showColorPicker === c.pick && (
                  <div className="mt-2">
                    <HexColorPicker
                      color={(settings as any)[c.key]}
                      onChange={(val) =>
                        setSettings((s) => ({ ...s, [c.key]: val }))
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
                <img src={settings.logoUrl} className="h-16 w-16 object-contain" />
                <button
                  onClick={() => setPickerFor("logo")}
                  className="bg-gray-100 px-3 py-1 rounded"
                >
                  Changer
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPickerFor("logo")}
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
                <img src={settings.faviconUrl} className="h-10 w-10 object-contain" />
                <button
                  onClick={() => setPickerFor("favicon")}
                  className="bg-gray-100 px-3 py-1 rounded"
                >
                  Changer
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPickerFor("favicon")}
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
                  className="h-32 w-full object-cover rounded-lg"
                />
                <button
                  onClick={() => setPickerFor("banniere")}
                  className="mt-2 bg-gray-100 px-3 py-1 rounded"
                >
                  Changer
                </button>
              </div>
            ) : (
              <button
                onClick={() => setPickerFor("banniere")}
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
              {settings.imagesSlider.map((url, i) => (
                <div key={i} className="relative group">
                  <img src={url} className="h-24 w-full object-cover rounded-lg" />
                  <button
                    onClick={() => removeSlide(i)}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPickerFor("slider")}
              className="mt-2 text-blue-600 flex items-center gap-2"
            >
              <Upload size={16} /> Ajouter des images
            </button>
          </div>
        </div>

        <button
          onClick={save}
          className="bg-orange-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-orange-700 flex items-center gap-2"
        >
          <Save size={20} /> Sauvegarder
        </button>

        {/* Modal plateforme */}
        {pickerFor && (
          <ImageSelectorModal
            title={
              pickerFor === "logo"
                ? "Choisir un logo"
                : pickerFor === "favicon"
                ? "Choisir un favicon"
                : pickerFor === "banniere"
                ? "Choisir une bannière"
                : "Choisir des images pour le slider"
            }
            source="platform"        // ✅ très important : on force la source plateforme
            onSelect={onPicked}
            onClose={() => setPickerFor(null)}
          />
        )}
      </motion.div>
    </div>
  );
};

export default AdminParametresPlatformPage;
