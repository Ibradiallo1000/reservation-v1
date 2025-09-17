import React, { useMemo, useState } from "react";
import { db, auth } from "../firebaseConfig";
import {
  addDoc,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";

/** === Petites utils === */
const countries = [
  { name: "Mali", code: "+223" },
  { name: "Sénégal", code: "+221" },
  { name: "Côte d'Ivoire", code: "+225" },
  { name: "Burkina Faso", code: "+226" },
  { name: "Togo", code: "+228" },
];

const slugify = (str: string) =>
  str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .trim();

const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((s || "").trim());
const normalizePhone = (dial: string, local: string) =>
  `${dial}${(local || "").replace(/\D/g, "")}`;

type Props = { onSuccess?: () => void };

const AdminAjouterCompagnie: React.FC<Props> = ({ onSuccess }) => {
  const navigate = useNavigate();

  // Compagnie
  const [nom, setNom] = useState("");
  const [pays, setPays] = useState(countries[0].name);
  const [code, setCode] = useState(countries[0].code);
  const [ville, setVille] = useState("");
  const [telephone, setTelephone] = useState("");
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [couleurPrimaire, setCouleurPrimaire] = useState("#f59e0b");
  const [couleurSecondaire, setCouleurSecondaire] = useState("#ef4444");

  // Admin Compagnie (info de contact uniquement — pas de création Auth côté client)
  const [adminNom, setAdminNom] = useState("");
  const [adminEmail, setAdminEmail] = useState("");

  // Chef agence principale (optionnel / info de contact)
  const [useSameManager, setUseSameManager] = useState(true);
  const [managerNom, setManagerNom] = useState("");
  const [managerEmail, setManagerEmail] = useState("");

  const [loading, setLoading] = useState(false);
  const slug = useMemo(() => slugify(nom), [nom]);

  /** Écrit les docs Firestore — nécessite role=admin_platforme dans les custom claims */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations UI
    if (!nom.trim()) return alert("Le nom de la compagnie est requis.");
    if (!adminNom.trim()) return alert("Le nom de l’admin de la compagnie est requis.");
    if (!isEmail(adminEmail)) return alert("Email admin compagnie invalide.");
    if (!telephone.trim()) return alert("Téléphone requis.");
    if (!useSameManager && managerEmail && !isEmail(managerEmail)) {
      return alert("Email chef d’agence invalide.");
    }

    // Vérifier le rôle de l’utilisateur courant (doit être admin_platforme)
    const current = auth.currentUser;
    if (!current) return alert("Tu dois être connecté.");
    const token = await current.getIdTokenResult();
    if (token.claims?.role !== "admin_platforme") {
      return alert("Accès refusé : nécessite le rôle admin_platforme.");
    }

    setLoading(true);
    try {
      // 1) Créer la compagnie
      const fullPhone = normalizePhone(code, telephone);

      // Valeurs par défaut utiles pour le branding / accueil
      const companyDoc = {
        nom,
        slug,
        pays,
        ville: ville || null,
        telephone: fullPhone,
        latitude: latitude ?? null,
        longitude: longitude ?? null,

        // Branding par défaut (lecture publique permise par tes règles)
        publicVisible: true,
        couleurPrimaire,
        couleurSecondaire,
        couleurAccent: "#f6f3f0",
        couleurTertiaire: "#000000",
        plan: "free",
        status: "actif",
        police: "sans-serif",
        themeStyle: "moderne",

        // Textes/basiques
        description: "",
        instructionRecherche: "Trouver votre prochain trajet",
        accroche: "Réservez votre trajet en un clic",

        // Médias (vides au départ)
        logoUrl: "",
        banniereUrl: "",
        faviconUrl: "",
        imagesSlider: [],

        // Liens/sections site vitrine
        showContactForm: true,
        showLegalLinks: true,
        showSocialMedia: true,
        showTestimonials: true,

        // Données contact “responsable”
        responsable: adminNom,
        email: adminEmail,

        // Légales (vides au départ)
        politiqueConfidentialite: "",
        conditionsUtilisation: "",

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // On crée le doc avec un id auto
      const companyRef = await addDoc(collection(db, "companies"), companyDoc);
      const companyId = companyRef.id;

      // 2) Agence principale (sous-collection)
      const mainAgency = {
        id: "", // on le met après
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

      // 3) Enregistrer des “contacts” (facultatif, pas lié à Auth)
      //    -> utile pour savoir qui est censé être admin / manager
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

      // 4) Message et suite
      alert(
        [
          "✅ Compagnie créée sans Cloud Function.",
          `- companyId: ${companyId}`,
          `- agencyId: ${agencyId}`,
          "",
          "ℹ️ Étape suivante (Spark) : crée/repère le compte de l’admin compagnie, puis lance :",
          `node setUserClaims.cjs ${adminEmail} admin_compagnie ${companyId}`,
          useSameManager
            ? "(le même compte aura déjà les bons contacts)"
            : managerEmail
            ? `et pour le chef d’agence : node setUserClaims.cjs ${managerEmail} chefAgence ${companyId} ${agencyId}`
            : "",
        ]
          .filter(Boolean)
          .join("\n")
      );

      onSuccess?.();
      navigate("/compagnies");
    } catch (err: any) {
      console.error(err);
      alert("❌ Erreur: " + (err?.message || "création impossible"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-xl font-bold mb-4">Ajouter une compagnie</h2>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
        {/* Compagnie */}
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

        {/* Admin compagnie (contact) */}
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

        {/* Chef agence principale (contact) */}
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

        <div className="text-sm text-gray-500">
          Slug généré : <span className="font-mono">{slug || "(vide)"}</span>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="bg-orange-600 text-white p-2 rounded hover:bg-orange-700 transition"
        >
          {loading ? "Création en cours..." : "Créer la compagnie"}
        </button>
      </form>
    </div>
  );
};

export default AdminAjouterCompagnie;
