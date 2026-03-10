// Phase 1 Stabilization — Modèles véhicules : collection vehicleModels, UPPERCASE, pas de doublons.
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, query, limit, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const COLLECTION = "vehicleModels";

function vehicleModelsRef(companyId: string) {
  return collection(db, "companies", companyId, COLLECTION);
}

/** Id Firestore sûr pour un libellé (uppercase, trim). */
function modelDocId(model: string): string {
  const s = String(model ?? "").trim().toUpperCase();
  return s.replace(/\s+/g, "_").replace(/[^A-Z0-9_]/g, "") || "UNKNOWN";
}

/** Normalise le modèle : UPPERCASE, trim. */
export function normalizeModel(raw: string): string {
  return String(raw ?? "").trim().toUpperCase();
}

function modelSearchKey(raw: string): string {
  return normalizeModel(raw).replace(/[^A-Z0-9]/g, "");
}

/** Liste les libellés de modèles (pour autocomplete), triés par ordre alphabétique. */
export async function listVehicleModels(companyId: string): Promise<string[]> {
  const ref = vehicleModelsRef(companyId);
  const snap = await getDocs(query(ref, limit(500)));
  const labels = snap.docs.map((d) => (d.data().label as string) ?? "").filter(Boolean);
  return [...new Set(labels)].sort((a, b) => a.localeCompare(b));
}

/** Vérifie si le modèle existe ; sinon le crée. Retourne le libellé normalisé. */
export async function ensureVehicleModel(
  companyId: string,
  model: string,
  options?: { createdBy?: string; createdByRole?: string }
): Promise<string> {
  const label = normalizeModel(model);
  if (!label) return label;
  const id = modelDocId(label);
  const checkRef = doc(db, "companies", companyId, COLLECTION, id);
  const snap = await getDoc(checkRef);
  const now = Timestamp.now();
  if (!snap.exists()) {
    await setDoc(checkRef, {
      label,
      labelNormalized: modelSearchKey(label),
      companyId,
      createdAt: now,
      updatedAt: now,
      createdBy: options?.createdBy ?? null,
      createdByRole: options?.createdByRole ?? null,
      sourceModule: "garage_dashboard",
    });
  } else {
    const current = snap.data() as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (!current.label) patch.label = label;
    if (!current.labelNormalized) patch.labelNormalized = modelSearchKey(label);
    if (!current.companyId) patch.companyId = companyId;
    if (!current.createdAt) patch.createdAt = now;
    if (!current.createdBy) patch.createdBy = options?.createdBy ?? null;
    if (!current.createdByRole) patch.createdByRole = options?.createdByRole ?? null;
    patch.updatedAt = now;
    if (Object.keys(patch).length > 0) {
      await updateDoc(checkRef, patch);
    }
  }
  return label;
}
