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
  Info,
  Phone,
  Mail,
  MapPin,
  Clock,
  Facebook,
  Instagram,
  Twitter,
  Linkedin,
  Youtube,
  Plus,
  Link as LinkIcon,
  Globe,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type NavLink = {
  label: string;
  url: string;
  external?: boolean;
};

type PlatformSettings = {
  // ==== EXISTANT ====
  accroche: string;
  instructionRecherche: string;
  logoUrl: string;
  faviconUrl: string;
  banniereUrl: string;
  imagesSlider: string[];
  couleurPrimaire: string;
  couleurSecondaire: string;
  themeStyle: string;

  // ==== NOUVEAU (footer dynamique) ====
  platformName?: string;
  slogan?: string;
  country?: string;
  about?: string;
  contact?: {
    phone?: string;
    email?: string;
    address?: string;
    hours?: string;
  };
  social?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
  legalLinks?: NavLink[];
  extraLinks?: NavLink[];
  worldMapBg?: boolean; // motif de fond du footer
};

const SETTINGS_REF = doc(db, "platform", "settings");

const AdminParametresPlatformPage: React.FC = () => {
  const [settings, setSettings] = useState<PlatformSettings>({
    // ==== valeurs par défaut (sûres) ====
    accroche: "Voyagez avec Teliya",
    instructionRecherche: "Remplissez les champs ci-dessous pour trouver un trajet",
    logoUrl: "",
    faviconUrl: "",
    banniereUrl: "",
    imagesSlider: [],
    couleurPrimaire: "#ea580c",
    couleurSecondaire: "#16a34a",
    themeStyle: "moderne",

    // footer
    platformName: "Teliya",
    slogan: "Réserver simplement, voyager sereinement.",
    country: "Mali",
    about:
      "Plateforme développée au Mali. Nous simplifions la réservation des billets interurbains avec des compagnies partenaires vérifiées, des paiements fiables et un suivi clair.",
    contact: {},
    social: {},
    legalLinks: [
      { label: "Mentions légales", url: "/mentions-legales" },
      { label: "Politique de confidentialité", url: "/confidentialite" },
      { label: "Conditions d’utilisation", url: "/conditions" },
      { label: "Politique cookies", url: "/cookies" },
    ],
    extraLinks: [
      { label: "À propos", url: "/a-propos" },
      { label: "Aide", url: "/aide" },
      { label: "Partenaires", url: "/partenaires" },
    ],
    worldMapBg: true,
  });

  const [message, setMessage] = useState<{ text: string; type: "success" | "error" | "" }>({
    text: "",
    type: "",
  });

  const [pickerFor, setPickerFor] = useState<null | "logo" | "favicon" | "banniere" | "slider">(
    null
  );
  const [showColorPicker, setShowColorPicker] = useState<null | "primary" | "secondary">(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(SETTINGS_REF);
      if (snap.exists()) {
        const data = snap.data() as Partial<PlatformSettings>;
        setSettings((prev) => ({
          ...prev,
          ...data,
          // protège contre undefined sur objets imbriqués
          contact: { ...prev.contact, ...(data.contact || {}) },
          social: { ...prev.social, ...(data.social || {}) },
          legalLinks: data.legalLinks ?? prev.legalLinks,
          extraLinks: data.extraLinks ?? prev.extraLinks,
          worldMapBg: typeof data.worldMapBg === "boolean" ? data.worldMapBg : prev.worldMapBg,
        }));
      }
    })();
  }, []);

  const save = async () => {
    try {
      await setDoc(SETTINGS_REF, settings, { merge: true });
      setMessage({ text: "Paramètres enregistrés avec succès ✅", type: "success" });
    } catch (e) {
      console.error(e);
      setMessage({ text: "Échec de l'enregistrement ❌", type: "error" });
    }
  };

  const onPicked = (url: string) => {
    if (!pickerFor) return;
    if (pickerFor === "logo") setSettings((s) => ({ ...s, logoUrl: url }));
    if (pickerFor === "favicon") setSettings((s) => ({ ...s, faviconUrl: url }));
    if (pickerFor === "banniere") setSettings((s) => ({ ...s, banniereUrl: url }));
    if (pickerFor === "slider") setSettings((s) => ({ ...s, imagesSlider: [...s.imagesSlider, url] }));
    setPickerFor(null);
  };

  const removeSlide = (i: number) =>
    setSettings((s) => ({ ...s, imagesSlider: s.imagesSlider.filter((_, idx) => idx !== i) }));

  const updateContact = (k: keyof NonNullable<PlatformSettings["contact"]>, v: string) =>
    setSettings((s) => ({ ...s, contact: { ...(s.contact || {}), [k]: v } }));

  const updateSocial = (k: keyof NonNullable<PlatformSettings["social"]>, v: string) =>
    setSettings((s) => ({ ...s, social: { ...(s.social || {}), [k]: v } }));

  const addLink = (key: "legalLinks" | "extraLinks") =>
    setSettings((s) => ({
      ...s,
      [key]: [...(s[key] || []), { label: "", url: "", external: false }],
    }));

  const updateLink = (
    key: "legalLinks" | "extraLinks",
    index: number,
    patch: Partial<NavLink>
  ) =>
    setSettings((s) => {
      const list = [...(s[key] || [])];
      list[index] = { ...list[index], ...patch };
      return { ...s, [key]: list };
    });

  const removeLink = (key: "legalLinks" | "extraLinks", index: number) =>
    setSettings((s) => {
      const list = [...(s[key] || [])];
      list.splice(index, 1);
      return { ...s, [key]: list };
    });

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 text-gray-800">Paramètres de la plateforme</h1>

        <AnimatePresence>
          {message.text && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={`p-4 rounded-lg shadow mb-4 ${
                message.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
              }`}
            >
              {message.type === "success" ? <CheckCircle className="inline mr-2" /> : <AlertCircle className="inline mr-2" />}
              {message.text}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===================== Identité (pour footer) ===================== */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Info /> Identité & contenu du footer
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Nom de la plateforme</label>
              <input
                className="w-full px-4 py-2 border rounded-lg"
                value={settings.platformName || ""}
                onChange={(e) => setSettings((s) => ({ ...s, platformName: e.target.value }))}
                placeholder="Teliya"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Pays</label>
              <div className="relative">
                <input
                  className="w-full px-4 py-2 border rounded-lg pr-9"
                  value={settings.country || ""}
                  onChange={(e) => setSettings((s) => ({ ...s, country: e.target.value }))}
                  placeholder="Mali"
                />
                <Globe className="h-4 w-4 absolute right-3 top-3.5 text-gray-400" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm mb-1">Slogan</label>
              <input
                className="w-full px-4 py-2 border rounded-lg"
                value={settings.slogan || ""}
                onChange={(e) => setSettings((s) => ({ ...s, slogan: e.target.value }))}
                placeholder="Réserver simplement, voyager sereinement."
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm mb-1">À propos (footer)</label>
              <textarea
                className="w-full px-4 py-2 border rounded-lg"
                rows={3}
                value={settings.about || ""}
                onChange={(e) => setSettings((s) => ({ ...s, about: e.target.value }))}
                placeholder="Texte court de présentation affiché dans le pied de page…"
              />
            </div>
          </div>
        </div>

        {/* ===================== Textes principaux (déjà existants) ===================== */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4">Textes principaux</h3>
          <input
            className="w-full mb-3 px-4 py-2 border rounded-lg"
            value={settings.accroche}
            onChange={(e) => setSettings((s) => ({ ...s, accroche: e.target.value }))}
          />
          <input
            className="w-full px-4 py-2 border rounded-lg"
            value={settings.instructionRecherche}
            onChange={(e) => setSettings((s) => ({ ...s, instructionRecherche: e.target.value }))}
          />
        </div>

        {/* ===================== Contact (footer) ===================== */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Phone /> Contact (footer)
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1">Téléphone</label>
              <input
                className="w-full px-4 py-2 border rounded-lg"
                value={settings.contact?.phone || ""}
                onChange={(e) => updateContact("phone", e.target.value)}
                placeholder="+223 70 00 00 00"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">E-mail</label>
              <input
                className="w-full px-4 py-2 border rounded-lg"
                value={settings.contact?.email || ""}
                onChange={(e) => updateContact("email", e.target.value)}
                placeholder="contact@teliya.africa"
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Adresse</label>
              <div className="relative">
                <input
                  className="w-full px-4 py-2 border rounded-lg pr-9"
                  value={settings.contact?.address || ""}
                  onChange={(e) => updateContact("address", e.target.value)}
                  placeholder="Bamako, Mali"
                />
                <MapPin className="h-4 w-4 absolute right-3 top-3.5 text-gray-400" />
              </div>
            </div>
            <div>
              <label className="block text-sm mb-1">Horaires</label>
              <div className="relative">
                <input
                  className="w-full px-4 py-2 border rounded-lg pr-9"
                  value={settings.contact?.hours || ""}
                  onChange={(e) => updateContact("hours", e.target.value)}
                  placeholder="Lun–Sam : 8h–19h"
                />
                <Clock className="h-4 w-4 absolute right-3 top-3.5 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* ===================== Réseaux sociaux (footer) ===================== */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Instagram /> Réseaux sociaux (footer)
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              { k: "facebook", label: "Facebook", Icon: Facebook, ph: "https://facebook.com/…" },
              { k: "instagram", label: "Instagram", Icon: Instagram, ph: "https://instagram.com/…" },
              { k: "twitter", label: "Twitter / X", Icon: Twitter, ph: "https://twitter.com/…" },
              { k: "linkedin", label: "LinkedIn", Icon: Linkedin, ph: "https://linkedin.com/company/…" },
              { k: "youtube", label: "YouTube", Icon: Youtube, ph: "https://youtube.com/@…" },
            ].map(({ k, label, Icon, ph }) => (
              <div key={k}>
                <label className="block text-sm mb-1">{label}</label>
                <div className="relative">
                  <input
                    className="w-full px-4 py-2 border rounded-lg pl-10"
                    value={(settings.social as any)?.[k] || ""}
                    onChange={(e) => updateSocial(k as any, e.target.value)}
                    placeholder={ph}
                  />
                  <Icon className="h-4 w-4 absolute left-3 top-3.5 text-gray-400" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===================== Liens (footer) ===================== */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <LinkIcon /> Liens du footer (légaux & utiles)
          </h3>

          {/* Légaux */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Liens légaux</h4>
              <button
                onClick={() => addLink("legalLinks")}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded border hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {(settings.legalLinks || []).map((l, i) => (
                <div key={`legal-${i}`} className="grid md:grid-cols-[1fr_1fr_auto_auto] grid-cols-1 gap-2 items-center">
                  <input
                    className="px-3 py-2 border rounded-lg"
                    placeholder="Libellé (ex: Mentions légales)"
                    value={l.label}
                    onChange={(e) => updateLink("legalLinks", i, { label: e.target.value })}
                  />
                  <input
                    className="px-3 py-2 border rounded-lg"
                    placeholder="/mentions-legales ou https://…"
                    value={l.url}
                    onChange={(e) => updateLink("legalLinks", i, { url: e.target.value })}
                  />
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!l.external}
                      onChange={(e) => updateLink("legalLinks", i, { external: e.target.checked })}
                    />
                    externe
                  </label>
                  <button
                    onClick={() => removeLink("legalLinks", i)}
                    className="p-2 rounded border hover:bg-red-50 text-red-600"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Utiles */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Liens utiles</h4>
              <button
                onClick={() => addLink("extraLinks")}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded border hover:bg-gray-50"
              >
                <Plus className="h-4 w-4" /> Ajouter
              </button>
            </div>
            <div className="space-y-2">
              {(settings.extraLinks || []).map((l, i) => (
                <div key={`extra-${i}`} className="grid md:grid-cols-[1fr_1fr_auto_auto] grid-cols-1 gap-2 items-center">
                  <input
                    className="px-3 py-2 border rounded-lg"
                    placeholder="Libellé (ex: À propos)"
                    value={l.label}
                    onChange={(e) => updateLink("extraLinks", i, { label: e.target.value })}
                  />
                  <input
                    className="px-3 py-2 border rounded-lg"
                    placeholder="/a-propos ou https://…"
                    value={l.url}
                    onChange={(e) => updateLink("extraLinks", i, { url: e.target.value })}
                  />
                  <label className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={!!l.external}
                      onChange={(e) => updateLink("extraLinks", i, { external: e.target.checked })}
                    />
                    externe
                  </label>
                  <button
                    onClick={() => removeLink("extraLinks", i)}
                    className="p-2 rounded border hover:bg-red-50 text-red-600"
                    title="Supprimer"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ===================== Options d'arrière-plan du footer ===================== */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ImageIcon /> Arrière-plan du footer
          </h3>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={settings.worldMapBg !== false}
              onChange={(e) => setSettings((s) => ({ ...s, worldMapBg: e.target.checked }))}
            />
            Afficher le motif de carte du monde en fond
          </label>
        </div>

        {/* ===================== Couleurs (existant) ===================== */}
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
                  title="Changer la couleur"
                />
                {showColorPicker === c.pick && (
                  <div className="mt-2">
                    <HexColorPicker
                      color={(settings as any)[c.key]}
                      onChange={(val) => setSettings((s) => ({ ...s, [c.key]: val }))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ===================== Images (existant) ===================== */}
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
                <button onClick={() => setPickerFor("logo")} className="bg-gray-100 px-3 py-1 rounded">
                  Changer
                </button>
              </div>
            ) : (
              <button onClick={() => setPickerFor("logo")} className="px-4 py-2 border rounded-lg">
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
                <button onClick={() => setPickerFor("favicon")} className="bg-gray-100 px-3 py-1 rounded">
                  Changer
                </button>
              </div>
            ) : (
              <button onClick={() => setPickerFor("favicon")} className="px-4 py-2 border rounded-lg">
                Ajouter un favicon
              </button>
            )}
          </div>

          {/* Bannière */}
          <div className="mb-4">
            <label className="block text-sm mb-2">Bannière</label>
            {settings.banniereUrl ? (
              <div>
                <img src={settings.banniereUrl} className="h-32 w-full object-cover rounded-lg" />
                <button onClick={() => setPickerFor("banniere")} className="mt-2 bg-gray-100 px-3 py-1 rounded">
                  Changer
                </button>
              </div>
            ) : (
              <button onClick={() => setPickerFor("banniere")} className="px-4 py-2 border rounded-lg">
                Ajouter une bannière
              </button>
            )}
          </div>

          {/* Slider */}
          <div>
            <label className="block text-sm mb-2">Images du slider ({settings.imagesSlider.length})</label>
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
            <button onClick={() => setPickerFor("slider")} className="mt-2 text-blue-600 flex items-center gap-2">
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

        {/* Modal image */}
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
            source="platform"
            onSelect={onPicked}
            onClose={() => setPickerFor(null)}
          />
        )}
      </motion.div>
    </div>
  );
};

export default AdminParametresPlatformPage;
