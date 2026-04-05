// src/pages/CompagnieAgencesPage.tsx
// Version corrigée — création via Cloud Function + modal suppression inclus
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  serverTimestamp,
  query,
  addDoc,
} from "firebase/firestore";
import { db, functions, dbReady } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useNavigate, useParams } from "react-router-dom";
import { httpsCallable } from "firebase/functions";
import { Button } from "@/shared/ui/button";
import { canCompanyPerformAction } from "@/shared/subscription/restrictions";
import type { SubscriptionStatus } from "@/shared/subscription/types";
import { createInvitationDoc } from "@/shared/invitations/createInvitationDoc";
import { listRoutes } from "@/modules/compagnie/routes/routesService";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import type { RouteStopDocWithId } from "@/modules/compagnie/routes/routesTypes";

// Leaflet assets
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

type Statut = "active" | "inactive";
type StaffAction = "detach" | "transfer" | "disable" | "delete";

interface Agence {
  id?: string;
  nomAgence: string;
  ville: string;
  pays: string;
  quartier?: string;
  /** principale | escale. Escale = point d'escale (agent escale_agent). */
  type?: string;
  /** Route liée (pour type=escale). */
  routeId?: string | null;
  /** Ordre de l'escale sur la route (pour type=escale). */
  stopOrder?: number | null;
  /** Document stop Firestore (routes/.../stops/{stopId}), double écriture avec stopOrder. */
  stopId?: string | null;
  statut: Statut;
  emailGerant: string;
  nomGerant: string;
  telephone: string;
  invitationId?: string;
  latitude?: number | null;
  longitude?: number | null;
}

// --- Types pour les payloads / réponses des Cloud Functions
interface CreateAgencyRequest {
  companyId: string;
  agence: {
    nomAgence: string;
    ville?: string;
    pays?: string;
    quartier?: string;
    type?: string;
    latitude?: number | null;
    longitude?: number | null;
    statut?: Statut;
  };
  manager: {
    name: string;
    email: string;
    phone?: string;
    role?: string;
  };
}

interface CreateAgencyResponse {
  success?: boolean;
  agencyId?: string;
  uid?: string;
  resetLink?: string;
  message?: string;
}

interface DeleteAgencyRequest {
  companyId: string;
  agencyId: string;
  action: StaffAction;
  transferToAgencyId?: string | null;
}

interface DeleteAgencyResponse {
  success?: boolean;
  message?: string;
}

// Helpers
const formatNom = (s: string) =>
  s.replace(/\s+/g, " ").trim().toLowerCase().replace(/\b\p{L}/gu, (c) => c.toUpperCase());

const onlyDigits = (s: string) => s.replace(/\D/g, "");
const isValidEmailFormat = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

/** Mali: +223, numéro national 8 chiffres (ex. 70 12 34 56, 22 XX XX XX). */
const isValidPhone = (s: string, pays?: string) => {
  const digits = onlyDigits(s);
  const normPays = (pays ?? "").trim().toLowerCase();
  const isMali = normPays.includes("mali");
  if (isMali) return digits.length === 8; // Mali: exactement 8 chiffres
  return digits.length >= 8 && digits.length <= 15;
};

const norm = (s: string) =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const slugify = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const normalizeEmail = (s: string) => s.trim().toLowerCase();

const actionCodeSettings = {
  url: `${window.location.origin}/finishSignIn`,
  handleCodeInApp: true,
};

/* =========================
   DeleteAgencyModal
========================= */
const DeleteAgencyModal: React.FC<{
  open: boolean;
  onClose: () => void;
  onConfirm: (action: StaffAction, transferToAgencyId: string | null) => void;
  agences: Agence[];
  agencyIdToDelete: string | null;
  loading?: boolean;
}> = ({ open, onClose, onConfirm, agences, agencyIdToDelete, loading }) => {
  const [action, setAction] = useState<StaffAction>("detach");
  const [target, setTarget] = useState<string>("");

  useEffect(() => {
    if (open) {
      setAction("detach");
      setTarget("");
    }
  }, [open]);

  if (!open) return null;

  const otherAgencies = agences.filter((a) => a.id && a.id !== agencyIdToDelete);
  const canConfirm = action !== "transfer" || (action === "transfer" && target && target.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-800 dark:border dark:border-slate-700 shadow-lg">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-slate-600">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Supprimer l’agence</h3>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Choisissez quoi faire avec le personnel rattaché à cette agence.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <label className="flex items-start space-x-3">
            <input
              type="radio"
              name="staffAction"
              className="mt-1"
              checked={action === "detach"}
              onChange={() => setAction("detach")}
            />
            <div>
              <div className="font-medium">Détacher le personnel</div>
              <div className="text-sm text-gray-500">
                Les comptes restent actifs mais ne seront rattachés à aucune agence (agencyId = null).
              </div>
            </div>
          </label>

          <label className="flex items-start space-x-3">
            <input
              type="radio"
              name="staffAction"
              className="mt-1"
              checked={action === "transfer"}
              onChange={() => setAction("transfer")}
            />
            <div className="w-full">
              <div className="font-medium">Transférer vers une autre agence</div>
              <div className="text-sm text-gray-500 mb-2">
                Déplace tous les membres vers l’agence sélectionnée.
              </div>
              <select
                className="w-full border rounded px-3 py-2"
                disabled={action !== "transfer"}
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">— Sélectionner l’agence cible —</option>
                {otherAgencies.map((ag) => (
                  <option key={ag.id} value={ag.id}>
                    {ag.nomAgence} • {ag.ville}, {ag.pays}
                  </option>
                ))}
              </select>
            </div>
          </label>

          <label className="flex items-start space-x-3">
            <input
              type="radio"
              name="staffAction"
              className="mt-1"
              checked={action === "disable"}
              onChange={() => setAction("disable")}
            />
            <div>
              <div className="font-medium">Désactiver les comptes</div>
              <div className="text-sm text-gray-500">
                Les comptes seront désactivés (Auth.disabled = true) et détachés.
              </div>
            </div>
          </label>

          <label className="flex items-start space-x-3">
            <input
              type="radio"
              name="staffAction"
              className="mt-1"
              checked={action === "delete"}
              onChange={() => setAction("delete")}
            />
            <div>
              <div className="font-medium text-red-700">Supprimer les comptes (dangereux)</div>
              <div className="text-sm text-red-600">
                Efface définitivement les utilisateurs (Auth + Firestore). À n’utiliser qu’en dernier recours.
              </div>
            </div>
          </label>
        </div>

        <div className="px-5 py-4 border-t flex justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            disabled={loading}
          >
            Annuler
          </button>
          <Button
            onClick={() => onConfirm(action, action === "transfer" ? target || null : null)}
            disabled={!canConfirm || loading}
            variant={action === "delete" ? "danger" : "primary"}
          >
            {loading ? "Traitement..." : "Confirmer"}
          </Button>
        </div>
      </div>
    </div>
  );
};

/* =========================
   Main page component
========================= */
const CompagnieAgencesPage: React.FC = () => {
  const { user, company } = useAuth();
  const theme = useCompanyTheme(company);
  const navigate = useNavigate();

  const [agences, setAgences] = useState<Agence[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(6);

  const [formData, setFormData] = useState({
    nomAgence: "",
    ville: "",
    pays: "",
    quartier: "",
    type: "principale",
    routeId: "",
    stopOrder: "",
    emailGerant: "",
    nomGerant: "",
    telephone: "",
    latitude: "",
    longitude: "",
  });
  const [routesList, setRoutesList] = useState<{ id: string; origin?: string; destination?: string; departureCity?: string; arrivalCity?: string }[]>([]);
  const [routeStops, setRouteStops] = useState<RouteStopDocWithId[]>([]);
  const [routeStopsLoading, setRouteStopsLoading] = useState(false);
  const [escaleCityWarning, setEscaleCityWarning] = useState(false);

  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [geocodingLoading, setGeocodingLoading] = useState(false);

  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [agencyIdToDelete, setAgencyIdToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const couleurPrincipale = theme.colors?.primary || user?.companyColor || "#2563eb";
  const { companyId: companyIdFromUrl } = useParams();

  // 🔥 priorité URL → sinon auth
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const MapClickHandler = ({ onPositionChange }: { onPositionChange: (lat: number, lng: number) => void }) => {
    useMapEvents({
      click(e) {
        onPositionChange(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  };

  // fetchAgences now waits for dbReady (ensures emulators / firestore initialisation is done)
  const fetchAgences = async () => {
    if (!companyId) {
      console.warn("companyId manquant — impossible de charger les agences");
      setAgences([]);
      return;
    }
    setLoading(true);
    try {
      await dbReady; // attend l'initialisation (emulateurs si activés)
      const agencesRef = collection(db, "companies", companyId, "agences");
      // optionnel: tri si tu veux
      const snap = await getDocs(query(agencesRef));
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Agence[];
      setAgences(list);
      setCurrentPage(1);
    } catch (error: any) {
      console.error("Erreur Firestore (agences):", error?.code, error?.message, error);
      alert("Une erreur est survenue lors du chargement des agences : " + (error?.message || String(error)));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) {
      setAgences([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        await dbReady;
        if (!mounted) return;
        await fetchAgences();
      } catch (e) {
        console.warn("dbReady error", e);
      }
    })();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    listRoutes(companyId, { activeOnly: true })
      .then((list) => setRoutesList(list))
      .catch(() => setRoutesList([]));
  }, [companyId]);

  useEffect(() => {
    if (formData.type !== "escale" || !formData.routeId || !companyId) {
      setRouteStops([]);
      return;
    }
    setRouteStopsLoading(true);
    getRouteStops(companyId, formData.routeId)
      .then((stops) => setRouteStops(stops))
      .catch(() => setRouteStops([]))
      .finally(() => setRouteStopsLoading(false));
  }, [companyId, formData.type, formData.routeId]);

  const selectedStop = useMemo(() => {
    if (formData.type !== "escale" || !formData.stopOrder || routeStops.length === 0) return null;
    const order = parseInt(formData.stopOrder, 10);
    if (Number.isNaN(order)) return null;
    return routeStops.find((s) => s.order === order) ?? null;
  }, [formData.type, formData.stopOrder, routeStops]);

  useEffect(() => {
    if (!selectedStop || formData.type !== "escale") {
      setEscaleCityWarning(false);
      return;
    }
    const agencyCity = (formData.ville ?? "").trim().toLowerCase();
    const stopCity = (selectedStop.city ?? "").trim().toLowerCase();
    setEscaleCityWarning(agencyCity !== "" && stopCity !== "" && agencyCity !== stopCity);
  }, [selectedStop, formData.ville, formData.type]);

  // Pagination calculations
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentAgences = useMemo(
    () => agences.slice(indexOfFirstItem, indexOfLastItem),
    [agences, indexOfFirstItem, indexOfLastItem]
  );
  const totalPages = Math.ceil(agences.length / itemsPerPage);

  // Form handlers
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type } = e.target;

    if (name === "emailGerant") setEmailError("");

    if (name === "nomGerant") {
      setFormData((prev) => ({ ...prev, [name]: value }));
      return;
    }
    if (name === "telephone") {
      const digits = onlyDigits(value).slice(0, 15);
      setFormData((prev) => ({ ...prev, [name]: digits }));
      return;
    }
    if ((name === "latitude" || name === "longitude") && value !== "") {
      const clean = value.replace(",", ".");
      setFormData((prev) => ({ ...prev, [name]: clean }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: type === "email" ? value.trim() : value }));
  };

  const handlePositionChange = (lat: number, lng: number) => {
    setFormData((prev) => ({
      ...prev,
      latitude: String(lat),
      longitude: String(lng),
    }));
  };

  /** Centrer la carte sur la ville et le pays (géocodage Nominatim) et placer le marqueur. */
  const handleCenterOnCity = async () => {
    const ville = (formData.type === "escale" && selectedStop ? selectedStop.city : formData.ville).trim();
    const pays = formData.pays.trim();
    if (!ville || !pays) {
      alert("Veuillez saisir la ville et le pays avant de centrer la carte.");
      return;
    }
    setGeocodingLoading(true);
    try {
      const q = encodeURIComponent(`${ville}, ${pays}`);
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`,
        { headers: { "Accept-Language": "fr" } }
      );
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const { lat, lon } = data[0];
        const latNum = parseFloat(lat);
        const lonNum = parseFloat(lon);
        if (Number.isFinite(latNum) && Number.isFinite(lonNum)) {
          setFormData((prev) => ({
            ...prev,
            latitude: String(latNum),
            longitude: String(lonNum),
          }));
        } else {
          alert("Coordonnées invalides retournées pour cette ville.");
        }
      } else {
        alert("Ville ou pays introuvable. Zoomez sur la carte et cliquez pour placer le point.");
      }
    } catch (e) {
      console.error("Geocoding error:", e);
      alert("Impossible de localiser la ville. Placez le point manuellement sur la carte.");
    } finally {
      setGeocodingLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nomAgence: "",
      ville: "",
      pays: "",
      quartier: "",
      type: "principale",
      routeId: "",
      stopOrder: "",
      emailGerant: "",
      nomGerant: "",
      telephone: "",
      latitude: "",
      longitude: "",
    });
    setRouteStops([]);
    setEscaleCityWarning(false);
    setEditingId(null);
    setShowForm(false);
    setEmailError("");
  };

  const handleCreateAgency = async () => {
  if (!companyId) {
    alert("Aucune compagnie associée");
    return;
  }

  // Subscription restriction check
  const companyData = company as Record<string, unknown> | null;
  const subStatus = (companyData?.subscriptionStatus as SubscriptionStatus) ?? "active";
  const actionCheck = canCompanyPerformAction(subStatus, "CREATE_AGENCY");
  if (!actionCheck.allowed) {
    alert(actionCheck.reason || "Action non autorisée par votre abonnement.");
    return;
  }
  if (actionCheck.warning) {
    const proceed = confirm(actionCheck.warning + "\n\nSouhaitez-vous continuer ?");
    if (!proceed) return;
  }

  if (!formData.nomAgence.trim()) {
    alert("Nom de l'agence requis");
    return;
  }

  if (formData.type === "escale") {
    if (!formData.routeId?.trim()) {
      alert("Veuillez sélectionner une route pour l'escale.");
      return;
    }
    const order = parseInt(formData.stopOrder, 10);
    if (Number.isNaN(order) || formData.stopOrder === "") {
      alert("Veuillez sélectionner l'escale (stop) sur la route.");
      return;
    }
    if (routeStops.length > 0 && !routeStops.some((s) => s.order === order)) {
      alert("L'ordre sélectionné n'existe pas sur cette route. Veuillez choisir un stop dans la liste.");
      return;
    }
  }

  if (!isValidEmailFormat(formData.emailGerant)) {
    setEmailError("Email invalide");
    return;
  }

  if (!isValidPhone(formData.telephone, formData.pays)) {
    const isMali = (formData.pays ?? "").trim().toLowerCase().includes("mali");
    alert(isMali
      ? "Téléphone invalide. Pour le Mali, saisir 8 chiffres (ex. 70 12 34 56)."
      : "Téléphone invalide (8 à 15 chiffres).");
    return;
  }

  if (!formData.latitude?.trim() || !formData.longitude?.trim()) {
    alert("Veuillez sélectionner la position de l'agence sur la carte (cliquez sur le point).");
    return;
  }

  setCreating(true);

  try {
    // 1️⃣ créer l’agence
    const agenceRef = await addDoc(
      collection(db, "companies", companyId, "agences"),
      {
        companyId,
        nomAgence: formData.nomAgence.trim(),
        nomAgenceNorm: norm(formData.nomAgence),
        ville: (formData.type === "escale" && selectedStop ? selectedStop.city : formData.ville).trim(),
        villeNorm: norm(formData.type === "escale" && selectedStop ? selectedStop.city : formData.ville),
        city: (formData.type === "escale" && selectedStop ? selectedStop.city : formData.ville).trim(), // for network trip planning: source = stop pour escale
        pays: formData.pays.trim(),
        paysNorm: norm(formData.pays),
        quartier: formData.quartier || "",
        type: formData.type || "principale",
        routeId: formData.type === "escale" && formData.routeId ? formData.routeId : null,
        stopOrder: formData.type === "escale" && formData.stopOrder ? parseInt(formData.stopOrder, 10) : null,
        stopId: formData.type === "escale" && selectedStop ? selectedStop.id : null,
        statut: "active",
        emailGerant: normalizeEmail(formData.emailGerant),
        nomGerant: formatNom(formData.nomGerant || ""),
        telephone: onlyDigits(formData.telephone),
        latitude: formData.latitude ? parseFloat(formData.latitude) : null,
        longitude: formData.longitude ? parseFloat(formData.longitude) : null,
        createdAt: serverTimestamp(),
      }
    );

    // 2️⃣ créer l’invitation
    const firstUserRole = formData.type === "escale" ? "escale_manager" : "chefAgence";
    const inviteResult = await createInvitationDoc({
      email: normalizeEmail(formData.emailGerant),
      role: firstUserRole,
      companyId,
      agencyId: agenceRef.id,
      fullName: formatNom(formData.nomGerant || ""),
      phone: onlyDigits(formData.telephone),
    });

    // 3️⃣ lier invitation → agence
    await updateDoc(agenceRef, {
      invitationId: inviteResult.inviteId,
      invitationToken: inviteResult.token,
    });

    alert(
      `✅ Agence créée.\n\nLien d’activation :\n${inviteResult.activationUrl}`
    );

    resetForm();
    fetchAgences();
  } catch (err: any) {
    console.error(err);
    alert("Erreur lors de la création de l'agence");
  } finally {
    setCreating(false);
  }
};


  // Submit (create/update)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      // update existing agency (client-side update)
      if (!companyId || !editingId) return;
      if (formData.type === "escale") {
        if (!formData.routeId?.trim()) {
          alert("Veuillez sélectionner une route pour l'escale.");
          return;
        }
        const order = parseInt(formData.stopOrder, 10);
        if (Number.isNaN(order) || formData.stopOrder === "") {
          alert("Veuillez sélectionner l'escale (stop) sur la route.");
          return;
        }
        if (routeStops.length > 0 && !routeStops.some((s) => s.order === order)) {
          alert("L'ordre sélectionné n'existe pas sur cette route. Veuillez choisir un stop dans la liste.");
          return;
        }
      }
      try {
        const agenceRef = doc(db, "companies", companyId, "agences", editingId);
        const villeValue = formData.type === "escale" && selectedStop ? selectedStop.city : formData.ville;
        await updateDoc(agenceRef, {
          companyId,
          nomAgence: formData.nomAgence,
          nomAgenceNorm: norm(formData.nomAgence),
          ville: villeValue,
          villeNorm: norm(villeValue),
          city: (villeValue ?? "").trim(),
          pays: formData.pays,
          paysNorm: norm(formData.pays),
          slug: slugify(formData.nomAgence),
          quartier: formData.quartier || "",
          type: formData.type || "principale",
          routeId: formData.type === "escale" && formData.routeId ? formData.routeId : null,
          stopOrder: formData.type === "escale" && formData.stopOrder ? parseInt(formData.stopOrder, 10) : null,
          stopId: formData.type === "escale" && selectedStop ? selectedStop.id : null,
          nomGerant: formData.nomGerant,
          emailGerant: normalizeEmail(formData.emailGerant),
          telephone: onlyDigits(formData.telephone),
          latitude: formData.latitude ? parseFloat(formData.latitude) : null,
          longitude: formData.longitude ? parseFloat(formData.longitude) : null,
          updatedAt: serverTimestamp(),
        });
        alert("✅ Agence mise à jour avec succès");
        resetForm();
        fetchAgences();
      } catch (err: any) {
        console.error("Erreur update agence:", err);
        alert("Erreur: " + (err?.message || err));
      }
      return;
    }

    // creation path -> use cloud function cascade
    await handleCreateAgency();
  };

  const handleEdit = (agence: Agence) => {
    setFormData({
      nomAgence: agence.nomAgence,
      ville: agence.ville,
      pays: agence.pays,
      quartier: agence.quartier || "",
      type: agence.type || "principale",
      routeId: agence.routeId ?? "",
      stopOrder: agence.stopOrder != null ? String(agence.stopOrder) : "",
      emailGerant: agence.emailGerant,
      nomGerant: formatNom(agence.nomGerant || ""),
      telephone: onlyDigits(agence.telephone || ""),
      latitude: agence.latitude != null ? String(agence.latitude) : "",
      longitude: agence.longitude != null ? String(agence.longitude) : "",
    });
    setEditingId(agence.id!);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const openDeleteModal = (agencyId: string) => {
    setAgencyIdToDelete(agencyId);
    setDeleteModalOpen(true);
  };

  // confirmDelete now receives action and transferToAgencyId
  const confirmDelete = async (action: StaffAction, transferToAgencyId: string | null) => {
    if (!agencyIdToDelete || !companyId) {
      setDeleteModalOpen(false);
      return;
    }

    setDeleteLoading(true);
    try {
      await dbReady;
      const payload: DeleteAgencyRequest = {
        companyId,
        agencyId: agencyIdToDelete,
        action,
        transferToAgencyId: transferToAgencyId || undefined,
      };

      const cf = httpsCallable<DeleteAgencyRequest, DeleteAgencyResponse>(functions, "companyDeleteAgencyCascade");
      const res = await cf(payload);
      const data = res.data;

      if (data?.success) {
        alert("Suppression traitée avec succès.");
        setDeleteModalOpen(false);
        setAgencyIdToDelete(null);
        await fetchAgences();
      } else {
        console.warn("companyDeleteAgencyCascade returned:", data);
        alert(data?.message || "Erreur lors de la suppression de l'agence.");
      }
    } catch (err: any) {
      console.error("Erreur delete agency (function):", err);
      const code = err?.code || err?.status || "";
      const msg = String(err?.message ?? err ?? "");
      const isCorsOrNetwork =
        code === "internal" ||
        msg.includes("Failed to fetch") ||
        msg.includes("CORS") ||
        msg.includes("NetworkError");
      if (code === "permission-denied" || code === "unauthenticated") {
        alert("Permission refusée — vous n'êtes pas autorisé à supprimer une agence.");
      } else if (isCorsOrNetwork) {
        alert(
          "Impossible de contacter le serveur (CORS ou réseau).\n\n" +
            "En local, la suppression d'agence via cette page est bloquée. Solutions :\n" +
            "• Utiliser l'application déployée en production, ou\n" +
            "• Passer au plan Blaze et déployer les Cloud Functions (companyDeleteAgencyCascadeHttp avec CORS), ou\n" +
            "• Supprimer l'agence manuellement dans la console Firebase (Firestore)."
        );
      } else {
        const details = err?.details ? `\nDétails: ${JSON.stringify(err.details)}` : "";
        alert("Erreur lors de la suppression : " + msg + details);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleToggleStatut = async (agence: Agence) => {
    if (!companyId || !agence.id) return;
    const newStatut: Statut = agence.statut === "active" ? "inactive" : "active";
    try {
      await updateDoc(doc(db, "companies", companyId, "agences", agence.id), {
        statut: newStatut,
        updatedAt: serverTimestamp(),
      });
      fetchAgences();
    } catch (error) {
      console.error("Erreur lors du changement de statut:", error);
      alert("Une erreur est survenue lors du changement de statut");
    }
  };

  const goToDashboard = (agencyId: string) => {
    navigate(`/compagnie/agence/${agencyId}/dashboard`);
  };

  // Render
  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Agences"
        subtitle={agences.length ? `${agences.length} agence${agences.length > 1 ? "s" : ""}` : undefined}
        right={
          <Button
            onClick={() => setShowForm(!showForm)}
            variant="primary"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {showForm ? "Masquer le formulaire" : "Ajouter une nouvelle agence"}
          </Button>
        }
      />
      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-sm mb-8 border border-gray-200 dark:border-slate-700"
        >
          <fieldset disabled={creating} className={creating ? "opacity-60" : ""}>
            <h3 className="text-lg font-semibold mb-4" style={{ color: couleurPrincipale }}>
              {editingId ? "Modifier une agence" : "Ajouter une nouvelle agence"}
            </h3>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom de l'agence *</label>
                  <input
                    name="nomAgence"
                    value={formData.nomAgence}
                    onChange={handleInputChange}
                    className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Ville *</label>
                  <input
                    name="ville"
                    value={formData.type === "escale" && selectedStop ? selectedStop.city : formData.ville}
                    onChange={handleInputChange}
                    disabled={formData.type === "escale" && !!selectedStop}
                    className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 dark:disabled:bg-gray-700 disabled:cursor-not-allowed"
                    required
                  />
                  {formData.type === "escale" && selectedStop && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ville définie par l&apos;escale sélectionnée sur la route.</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Pays *</label>
                  <input
                    name="pays"
                    value={formData.pays}
                    onChange={handleInputChange}
                    className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Quartier</label>
                  <input
                    name="quartier"
                    value={formData.quartier}
                    onChange={handleInputChange}
                    className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Type d'agence</label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value, routeId: e.target.value !== "escale" ? "" : prev.routeId, stopOrder: e.target.value !== "escale" ? "" : prev.stopOrder }))}
                    className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="principale">Principale</option>
                    <option value="escale">Escale</option>
                  </select>
                </div>
                {formData.type === "escale" && (
                  <>
                    <div>
                      <label className="block text-sm font-medium mb-1">Route (escale)</label>
                      <select
                        name="routeId"
                        value={formData.routeId}
                        onChange={(e) => setFormData((prev) => ({ ...prev, routeId: e.target.value, stopOrder: "" }))}
                        className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— Choisir une route —</option>
                        {routesList.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.origin ?? r.departureCity} → {r.destination ?? r.arrivalCity}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Escale (stop) sur la route</label>
                      <select
                        name="stopOrder"
                        value={formData.stopOrder}
                        onChange={(e) => {
                          const val = e.target.value;
                          const stop = routeStops.find((s) => s.order === parseInt(val, 10));
                          setFormData((prev) => ({
                            ...prev,
                            stopOrder: val,
                            ...(stop?.city ? { ville: stop.city } : {}),
                          }));
                        }}
                        disabled={routeStopsLoading || routeStops.length === 0}
                        className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">
                          {routeStopsLoading ? "Chargement…" : !formData.routeId ? "Choisir une route d'abord" : routeStops.length === 0 ? "Aucun stop sur cette route" : "— Choisir l'escale —"}
                        </option>
                        {routeStops.map((s) => (
                          <option key={s.id} value={s.order}>
                            {s.order} {s.city}
                          </option>
                        ))}
                      </select>
                    </div>
                    {escaleCityWarning && (
                      <p className="text-amber-600 dark:text-amber-400 text-sm col-span-full">
                        La ville de l&apos;agence ne correspond pas au stop sélectionné.
                      </p>
                    )}
                  </>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Nom et prénom du gérant *</label>
                  <input
                    name="nomGerant"
                    value={formData.nomGerant}
                    onChange={handleInputChange}
                    onBlur={(e) => {
                      const v = (e.target.value || "").trim();
                      if (v) setFormData((prev) => ({ ...prev, nomGerant: formatNom(v) }));
                    }}
                    className="form-input w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Ex. Amadou Keita (première lettre en majuscule)"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Email du gérant *</label>
                  <input
                    name="emailGerant"
                    type="email"
                    value={formData.emailGerant}
                    onChange={handleInputChange}
                    className={`form-input w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                      formData.emailGerant && !isValidEmailFormat(formData.emailGerant)
                        ? "border-red-500 focus:ring-red-400"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                    required
                  />
                  {emailError && <p className="text-red-600 text-sm mt-1">{emailError}</p>}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Téléphone *</label>
                  <input
                    name="telephone"
                    inputMode="numeric"
                    value={formData.telephone}
                    onChange={handleInputChange}
                    minLength={8}
                    maxLength={15}
                    className={`form-input w-full border rounded-md px-3 py-2 focus:outline-none focus:ring-2 ${
                      formData.telephone && !isValidPhone(formData.telephone, formData.pays)
                        ? "border-red-500 focus:ring-red-400"
                        : "border-gray-300 focus:ring-blue-500"
                    }`}
                    required
                    placeholder={(formData.pays || "").toLowerCase().includes("mali") ? "+223 70 12 34 56 (8 chiffres)" : "Ex. 78953098"}
                  />
                  {(formData.pays || "").toLowerCase().includes("mali") && formData.telephone.length > 0 && formData.telephone.length !== 8 && (
                    <p className="text-amber-600 dark:text-amber-400 text-xs mt-1">Mali : 8 chiffres (ex. 70 12 34 56)</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-medium mb-1">
                📍 Position géographique *
                {formData.latitude && formData.longitude && (
                  <span className="text-gray-500 ml-2">
                    ({formData.latitude}, {formData.longitude})
                  </span>
                )}
              </label>
              <p className="text-sm text-gray-500 mb-2">
                Saisissez la ville et le pays, puis cliquez sur « Centrer sur la ville » pour aller à l’emplacement, ou zoomez et cliquez sur la carte pour placer le point.
              </p>
              <div className="flex flex-wrap gap-2 mb-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCenterOnCity}
                  disabled={geocodingLoading || !formData.ville?.trim() || !formData.pays?.trim()}
                >
                  {geocodingLoading ? "Recherche…" : "Centrer sur la ville"}
                </Button>
              </div>
              <div className="h-64 rounded-lg border border-gray-300 overflow-hidden">
                <MapContainer
                  center={[
                    formData.latitude ? parseFloat(formData.latitude) : 12.6392,
                    formData.longitude ? parseFloat(formData.longitude) : -8.0029,
                  ]}
                  zoom={formData.latitude ? 15 : 12}
                  className="h-full w-full"
                  scrollWheelZoom
                >
                  <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <MapClickHandler onPositionChange={handlePositionChange} />
                  {formData.latitude && formData.longitude && (
                    <Marker position={[parseFloat(formData.latitude), parseFloat(formData.longitude)]} />
                  )}
                </MapContainer>
              </div>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Annuler
              </button>
              <Button
                type="submit"
                disabled={creating}
                variant="primary"
              >
                {editingId ? "Mettre à jour l'agence" : creating ? "Création…" : "Ajouter l'agence"}
              </Button>
            </div>
          </fieldset>
        </form>
      )}

      <div className="flex justify-between items-center mb-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
          {loading ? "Chargement…" : `Liste des agences (${agences.length})`}
        </h3>
        <div className="flex items-center">
          <label className="mr-2 text-sm text-gray-700 dark:text-slate-300">Agences par page:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => {
              setItemsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="border border-gray-300 dark:border-slate-600 rounded p-1 text-sm bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
          >
            <option value={6}>6</option>
            <option value={12}>12</option>
            <option value={24}>24</option>
          </select>
        </div>
      </div>

      {agences.length === 0 && !loading ? (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 dark:text-slate-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="mt-2 text-lg font-medium text-gray-900 dark:text-white">Aucune agence enregistrée</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">Commencez par ajouter votre première agence.</p>
          <div className="mt-6">
            <Button
              onClick={() => setShowForm(true)}
              variant="primary"
            >
              <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Ajouter une agence
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {currentAgences.map((ag) => (
              <div
                key={ag.id}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-sm overflow-hidden border border-gray-200 dark:border-slate-700 hover:shadow-sm transition-shadow"
              >
                <div className="p-5">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">{ag.nomAgence}</h3>
                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        {ag.ville}, {ag.pays}
                      </p>
                    </div>
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        ag.statut === "active" ? "bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300" : "bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300"
                      }`}
                    >
                      {ag.statut === "active" ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="mt-4 border-t border-gray-200 dark:border-slate-600 pt-4">
                    <div className="flex items-center text-sm text-gray-500 mb-2">
                      <svg
                        className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                        />
                      </svg>
                      {ag.emailGerant}
                    </div>
                    {((ag as any).invitationToken || ag.invitationId) && (
                      <div className="mb-2">
                        <a
                          href={`/accept-invitation/${(ag as any).invitationToken || (ag as any).invitationId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 underline hover:text-blue-800"
                        >
                          👉 Accepter l’invitation du gérant
                        </a>
                       </div>
                     )}

                    <div className="flex items-center text-sm text-gray-500">
                      <svg
                        className="flex-shrink-0 mr-1.5 h-5 w-5 text-gray-400"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      {ag.telephone}
                    </div>
                  </div>

                  <div className="mt-5 flex justify-between space-x-2">
                    <button
                      onClick={() => goToDashboard(ag.id!)}
                      className="flex-1 inline-flex justify-center items-center px-3 py-2 border border-gray-300 dark:border-slate-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600"
                    >
                      <svg
                        className="-ml-1 mr-2 h-5 w-5 text-gray-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2z"
                        />
                      </svg>
                      Dashboard
                    </button>
                    <Button
                      onClick={() => {
                        setShowForm(true);
                        handleEdit(ag);
                      }}
                      variant="primary"
                      size="sm"
                    >
                      <svg className="-ml-1 mr-2 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                      Modifier
                    </Button>
                  </div>

                  <div className="mt-3 flex space-x-2">
                    <button
                      onClick={() => handleToggleStatut(ag)}
                      className={`flex-1 px-3 py-2 border rounded-md text-sm font-medium ${
                        ag.statut === "active"
                          ? "border-yellow-300 text-yellow-700 bg-yellow-100 hover:bg-yellow-200"
                          : "border-green-300 text-green-700 bg-green-100 hover:bg-green-200"
                      }`}
                    >
                      {ag.statut === "active" ? "Désactiver" : "Activer"}
                    </button>
                    <button
                      onClick={() => openDeleteModal(ag.id!)}
                      className="flex-1 px-3 py-2 border border-red-300 rounded-md text-sm font-medium text-red-700 bg-red-100 hover:bg-red-200"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {agences.length > itemsPerPage && (
            <div className="flex justify-between items-center mt-6">
              <div className="text-sm text-gray-500">
                Affichage {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, agences.length)} sur {agences.length} agences
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className={`px-4 py-2 rounded-md ${
                    currentPage === 1
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Précédent
                </button>
                <span className="px-4 py-2 text-gray-700">
                  Page {currentPage} sur {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className={`px-4 py-2 rounded-md ${
                    currentPage === totalPages
                      ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                      : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Modal de suppression */}
      <DeleteAgencyModal
        open={deleteModalOpen}
        onClose={() => !deleteLoading && setDeleteModalOpen(false)}
        onConfirm={(action, transferToAgencyId) => confirmDelete(action, transferToAgencyId)}
        agences={agences}
        agencyIdToDelete={agencyIdToDelete}
        loading={deleteLoading}
      />
    </StandardLayoutWrapper>
  );
};

export default CompagnieAgencesPage;
