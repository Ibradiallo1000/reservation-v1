// src/pages/AdminAjouterCompagnie.tsx
import React, { useMemo, useState } from "react";
import { db, auth } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

/** === Utils === */
const countries = [
  { name: "Mali", code: "+223" },
  { name: "Sénégal", code: "+221" },
  { name: "Côte d'Ivoire", code: "+225" },
  { name: "Burkina Faso", code: "+226" },
  { name: "Togo", code: "+228" },
];

const slugify = (str: string) =>
  (str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s || "").trim());
const normalizePhone = (dial: string, local: string) =>
  `${dial}${(local || "").replace(/\D/g, "")}`;

const normalizeRole = (r?: unknown) => {
  const lc = String(r || "").trim().toLowerCase();
  if (lc === "admin plateforme" || lc === "admin_platforme") return "admin_platforme";
  return lc;
};

type Props = { onSuccess?: () => void };

const AdminAjouterCompagnie: React.FC<Props> = ({ onSuccess }) => {
  const navigate = useNavigate();

  /** Identité/visuel */
  const [nom, setNom] = useState("");
  const [pays, setPays] = useState(countries[0].name);
  const [code, setCode] = useState(countries[0].code);
  const [ville, setVille] = useState("");
  const [telephone, setTelephone] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [couleurPrimaire, setCouleurPrimaire] = useState("#f59e0b");
  const [couleurSecondaire, setCouleurSecondaire] = useState("#ef4444");

  /** Contact admin */
  const [adminNom, setAdminNom] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  /** Chef d’agence principale (optionnel) */
  const [useSameManager, setUseSameManager] = useState(true);
  const [managerNom, setManagerNom] = useState("");
  const [managerEmail, setManagerEmail] = useState("");

  /** Plan & options (nouveaux champs) */
  const [plan, setPlan] = useState<"free" | "standard" | "premium">("free");
  const [maxAgences, setMaxAgences] = useState<number>(1);
  const [maxUsers, setMaxUsers] = useState<number>(3);
  const [guichetEnabled, setGuichetEnabled] = useState<boolean>(true);
  const [onlineBookingEnabled, setOnlineBookingEnabled] = useState<boolean>(false);
  const [publicPageEnabled, setPublicPageEnabled] = useState<boolean>(true);
  const [commissionOnlinePct, setCommissionOnlinePct] = useState<number>(2); // % affiché
  const [feeGuichet, setFeeGuichet] = useState<number>(100); // FCFA/vente guichet
  const [minimumMonthly, setMinimumMonthly] = useState<number>(25000); // FCFA/mois

  const [loading, setLoading] = useState(false);
  const slug = useMemo(() => slugify(nom), [nom]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!nom.trim()) return alert("Le nom de la compagnie est requis.");
    if (!adminNom.trim()) return alert("Le nom de l’admin de la compagnie est requis.");
    if (!isEmail(adminEmail)) return alert("Email admin compagnie invalide.");
    if (!telephone.trim()) return alert("Téléphone requis.");
    if (!useSameManager && managerEmail && !isEmail(managerEmail)) {
      return alert("Email chef d’agence invalide.");
    }
    if (!slug) return alert("Le nom de la compagnie doit produire un slug valide.");

    // Permission
    const current = auth.currentUser;
    if (!current) return alert("Tu dois être connecté.");
    const token = await current.getIdTokenResult(true);
    if (normalizeRole(token.claims?.role) !== "admin_platforme") {
      return alert("Accès refusé : nécessite le rôle admin_platforme.");
    }

    setLoading(true);
    try {
      // Slug unique
      const q = query(collection(db, "companies"), where("slug", "==", slug), limit(1));
      const existsSnap = await getDocs(q);
      if (!existsSnap.empty) {
        alert("Une compagnie avec ce nom/slug existe déjà.");
        setLoading(false);
        return;
      }

      const fullPhone = normalizePhone(code, telephone);

      // Attention: commissionOnline est stocké en décimal (ex: 0.02 pour 2 %)
      const commissionOnline = Math.max(0, Number((commissionOnlinePct / 100).toFixed(4)));

      const companyDoc = {
        nom,
        slug,
        pays,
        ville: ville || null,
        telephone: fullPhone,
        latitude: latitude ?? null,
        longitude: longitude ?? null,

        // Branding
        publicVisible: true,
        couleurPrimaire,
        couleurSecondaire,
        couleurAccent: "#f6f3f0",
        couleurTertiaire: "#000000",
        police: "sans-serif",
        themeStyle: "moderne",

        // Plan & options
        plan, // "free" | "standard" | "premium"
        maxAgences,
        maxUsers,
        guichetEnabled,
        onlineBookingEnabled,
        publicPageEnabled,
        commissionOnline, // ex: 0.02
        feeGuichet,       // FCFA par vente guichet
        minimumMonthly,   // FCFA / mois

        // Textes
        description: "",
        instructionRecherche: "Trouver votre prochain trajet",
        accroche: "Réservez votre trajet en un clic",

        // Médias
        logoUrl: "",
        banniereUrl: "",
        faviconUrl: "",
        imagesSlider: [] as string[],

        // Liens/sections site vitrine
        showContactForm: true,
        showLegalLinks: true,
        showSocialMedia: true,
        showTestimonials: true,

        // Contact
        responsable: adminNom,
        email: adminEmail,

        // Légales
        politiqueConfidentialite: "",
        conditionsUtilisation: "",

        status: "actif",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // 1) Company
      const companyRef = await addDoc(collection(db, "companies"), companyDoc);
      await setDoc(companyRef, { id: companyRef.id }, { merge: true });
      const companyId = companyRef.id;

      // 2) Agence principale
      const mainAgency = {
        id: "",
        nomAgence: "Agence principale",
        ville: ville || null,
        pays,
        statut: "active",
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        isHeadOffice: true,
      };
      const agencyRef = await addDoc(collection(companyRef, "agences"), mainAgency);
      await setDoc(agencyRef, { id: agencyRef.id }, { merge: true });
      const agencyId = agencyRef.id;

      // 3) Contacts
      const contactsRef = doc(collection(companyRef, "contacts"), "main");
      await setDoc(
        contactsRef,
        {
          admin: { name: adminNom, email: adminEmail },
          agencyManager: useSameManager
            ? { name: adminNom, email: adminEmail }
            : managerEmail
            ? { name: managerNom, email: managerEmail }
            : null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      alert(
        [
          "✅ Compagnie créée.",
          `- companyId: ${companyId}`,
          `- agencyId: ${agencyId}`,
          "",
          "ℹ️ Étape suivante (Spark) : crée/repère le compte de l’admin compagnie, puis lance :",
          `node setUserClaims.cjs ${adminEmail} admin_compagnie ${companyId}`,
          useSameManager
            ? "(le même compte aura les bons contacts)"
            : managerEmail
            ? `et pour le chef d’agence : node setUserClaims.cjs ${managerEmail} chefAgence ${companyId} ${agencyId}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );

      onSuccess?.();
      navigate("/admin/compagnies");
    } catch (err: any) {
      console.error(err);
      alert("❌ Erreur: " + (err?.message || "création impossible"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Ajouter une compagnie</h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        {/* Identité */}
        <input
          required
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          placeholder="Nom de la compagnie"
          className="border p-2 rounded"
        />

        <div className="flex gap-2">
          <select
            value={pays}
            onChange={(e) => {
              const selected = countries.find((c) => c.name === e.target.value);
              if (selected) {
                setPays(selected.name);
                setCode(selected.code);
              }
            }}
            className="border p-2 rounded w-1/2"
          >
            {countries.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={ville}
            onChange={(e) => setVille(e.target.value)}
            placeholder="Ville (optionnel)"
            className="border p-2 rounded w-1/2"
          />
        </div>

        <div className="flex gap-2">
          <input
            required
            value={telephone}
            onChange={(e) => setTelephone(e.target.value)}
            placeholder="Téléphone"
            className="border p-2 rounded w-1/2"
          />
          <input readOnly value={code} className="border p-2 rounded w-1/2 bg-gray-50" />
        </div>

        <div className="flex gap-2">
          <input
            type="number"
            step="any"
            value={latitude ?? ""}
            onChange={(e) => setLatitude(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Latitude (optionnel)"
            className="border p-2 rounded w-1/2"
          />
          <input
            type="number"
            step="any"
            value={longitude ?? ""}
            onChange={(e) => setLongitude(e.target.value ? parseFloat(e.target.value) : null)}
            placeholder="Longitude (optionnel)"
            className="border p-2 rounded w-1/2"
          />
        </div>

        <div className="flex gap-2">
          <input
            type="color"
            value={couleurPrimaire}
            onChange={(e) => setCouleurPrimaire(e.target.value)}
            className="border p-1 rounded w-1/2"
            title="Couleur primaire"
          />
          <input
            type="color"
            value={couleurSecondaire}
            onChange={(e) => setCouleurSecondaire(e.target.value)}
            className="border p-1 rounded w-1/2"
            title="Couleur secondaire"
          />
        </div>

        {/* Admin compagnie */}
        <div className="mt-2 border-t pt-4">
          <h3 className="font-semibold mb-2">Administrateur de la compagnie (contact)</h3>
          <input
            required
            value={adminNom}
            onChange={(e) => setAdminNom(e.target.value)}
            placeholder="Nom complet (admin compagnie)"
            className="border p-2 rounded mb-2 w-full"
          />
          <input
            required
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            placeholder="Email (admin compagnie)"
            className="border p-2 rounded w-full"
          />
        </div>

        {/* Chef d’agence principale */}
        <div className="mt-2 border-t pt-4">
          <div className="flex items-center gap-2">
            <input
              id="sameManager"
              type="checkbox"
              checked={useSameManager}
              onChange={(e) => setUseSameManager(e.target.checked)}
            />
            <label htmlFor="sameManager">
              Utiliser le même compte comme Chef d’agence principale
            </label>
          </div>

          {!useSameManager && (
            <div className="mt-3 grid grid-cols-1 gap-2">
              <input
                value={managerNom}
                onChange={(e) => setManagerNom(e.target.value)}
                placeholder="Nom complet (chef d’agence)"
                className="border p-2 rounded"
              />
              <input
                type="email"
                value={managerEmail}
                onChange={(e) => setManagerEmail(e.target.value)}
                placeholder="Email (chef d’agence)"
                className="border p-2 rounded"
              />
            </div>
          )}
        </div>

        {/* Plan & options */}
        <div className="mt-2 border-t pt-4">
          <h3 className="font-semibold mb-3">Plan & options</h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="text-sm">
              Plan
              <select
                value={plan}
                onChange={(e) => setPlan(e.target.value as any)}
                className="mt-1 w-full border p-2 rounded"
              >
                <option value="free">Free</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </label>

            <label className="text-sm">
              Max agences
              <input
                type="number"
                min={0}
                value={maxAgences}
                onChange={(e) => setMaxAgences(Math.max(0, Number(e.target.value || 0)))}
                className="mt-1 w-full border p-2 rounded"
              />
            </label>

            <label className="text-sm">
              Max utilisateurs
              <input
                type="number"
                min={0}
                value={maxUsers}
                onChange={(e) => setMaxUsers(Math.max(0, Number(e.target.value || 0)))}
                className="mt-1 w-full border p-2 rounded"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={guichetEnabled}
                onChange={(e) => setGuichetEnabled(e.target.checked)}
              />
              Guichet activé
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={onlineBookingEnabled}
                onChange={(e) => setOnlineBookingEnabled(e.target.checked)}
              />
              Réservation en ligne
            </label>

            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={publicPageEnabled}
                onChange={(e) => setPublicPageEnabled(e.target.checked)}
              />
              Page publique
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            <label className="text-sm">
              Commission en ligne (%)
              <input
                type="number"
                step="0.1"
                min={0}
                value={commissionOnlinePct}
                onChange={(e) => setCommissionOnlinePct(Math.max(0, Number(e.target.value || 0)))}
                className="mt-1 w-full border p-2 rounded"
                placeholder="ex: 2 pour 2%"
              />
            </label>

            <label className="text-sm">
              Frais guichet (FCFA)
              <input
                type="number"
                min={0}
                value={feeGuichet}
                onChange={(e) => setFeeGuichet(Math.max(0, Number(e.target.value || 0)))}
                className="mt-1 w-full border p-2 rounded"
              />
            </label>

            <label className="text-sm">
              Minimum mensuel (FCFA)
              <input
                type="number"
                min={0}
                value={minimumMonthly}
                onChange={(e) => setMinimumMonthly(Math.max(0, Number(e.target.value || 0)))}
                className="mt-1 w-full border p-2 rounded"
              />
            </label>
          </div>
        </div>

        <div className="text-sm text-gray-500">
          Slug généré : <span className="font-mono">{slug || "(vide)"}</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`p-2 rounded text-white transition ${
            loading ? "bg-orange-300 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700"
          }`}
        >
          {loading ? "Création en cours..." : "Créer la compagnie"}
        </button>
      </form>
    </div>
  );
};

export default AdminAjouterCompagnie;
