// Phase 1 — Lecture/écriture véhicules compagnie. Phase 1H + Operational: confirmDeparture/Arrival, setTechnicalStatus, statusHistory.
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  query,
  limit,
  orderBy,
  startAfter,
  Timestamp,
  arrayUnion,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { VehicleDoc, VehicleStatus } from "./vehicleTypes";
import { VEHICLES_COLLECTION, VEHICLE_STATUS } from "./vehicleTypes";
import { normalizePlate } from "./plateValidation";
import { normalizeModel, ensureVehicleModel } from "./vehicleModelsService";
import {
  TECHNICAL_STATUS,
  OPERATIONAL_STATUS,
  canChangeTechnicalStatus,
  canChangeOperationalStatus,
  type TechnicalStatus,
  type OperationalStatus,
  type StatusHistoryEntry,
} from "./vehicleTransitions";
import {
  getActiveAffectationByVehicle,
  createAffectation,
  updateAffectationStatus,
  getAffectation,
} from "./affectationService";
import { AFFECTATION_STATUS } from "./affectationTypes";
import type { AffectationDoc } from "./affectationTypes";

export function vehiclesRef(companyId: string) {
  return collection(db, "companies", companyId, VEHICLES_COLLECTION);
}

export function vehicleRef(companyId: string, vehicleId: string) {
  return doc(db, "companies", companyId, VEHICLES_COLLECTION, vehicleId);
}

/** Derive technicalStatus/operationalStatus from legacy status for backward compatibility. */
function normalizeVehicleDoc(data: Record<string, unknown>): Record<string, unknown> {
  const status = data.status as string | undefined;
  const hasNew = data.technicalStatus != null && data.operationalStatus != null;
  if (hasNew) return data;
  if (!status) {
    return {
      ...data,
      technicalStatus: TECHNICAL_STATUS.NORMAL,
      operationalStatus: OPERATIONAL_STATUS.GARAGE,
    };
  }
  let technicalStatus: TechnicalStatus = TECHNICAL_STATUS.NORMAL;
  let operationalStatus: OperationalStatus = OPERATIONAL_STATUS.GARAGE;
  switch (status) {
    case VEHICLE_STATUS.EN_MAINTENANCE:
      technicalStatus = TECHNICAL_STATUS.MAINTENANCE;
      break;
    case VEHICLE_STATUS.ACCIDENTE:
      technicalStatus = TECHNICAL_STATUS.ACCIDENTE;
      break;
    case VEHICLE_STATUS.HORS_SERVICE:
      technicalStatus = TECHNICAL_STATUS.HORS_SERVICE;
      break;
    case VEHICLE_STATUS.EN_TRANSIT:
      operationalStatus = OPERATIONAL_STATUS.EN_TRANSIT;
      break;
    case VEHICLE_STATUS.EN_SERVICE:
      operationalStatus = OPERATIONAL_STATUS.AFFECTE;
      break;
    default:
      break;
  }
  return { ...data, technicalStatus, operationalStatus };
}

export type ListVehiclesOrderBy = "plate" | "technicalStatus" | "updatedAt";

export async function listVehicles(companyId: string, max = 500): Promise<(VehicleDoc & { id: string })[]> {
  const ref = vehiclesRef(companyId);
  const q = query(ref, orderBy("plateNumber"), limit(Math.min(max * 3, 1500)));
  const snap = await getDocs(q);
  const list = snap.docs
    .filter((d) => (d.data() as any).isArchived !== true)
    .slice(0, max)
    .map((d) => {
      const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
      return { id: d.id, ...normalized } as VehicleDoc & { id: string };
    });
  return list;
}

/** Phase 1 Stabilization: list vehicles with pagination (20 per page), orderBy plaque | technicalStatus | updatedAt. Excludes archived (isArchived !== true). */
export async function listVehiclesPaginated(
  companyId: string,
  options: { pageSize?: number; startAfterDoc?: DocumentSnapshot | null; orderByField?: ListVehiclesOrderBy }
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const pageSize = options.pageSize ?? 20;
  const ref = vehiclesRef(companyId);
  const field = options.orderByField === "updatedAt" ? "updatedAt" : options.orderByField === "technicalStatus" ? "technicalStatus" : "plateNumber";
  const dir = options.orderByField === "updatedAt" ? "desc" : "asc";
  let q = query(ref, orderBy(field, dir), limit((pageSize + 1) * 3));
  if (options.startAfterDoc) {
    q = query(ref, orderBy(field, dir), startAfter(options.startAfterDoc), limit((pageSize + 1) * 3));
  }
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => (d.data() as any).isArchived !== true);
  const hasMore = docs.length > pageSize;
  const list = docs.slice(0, pageSize).map((d) => {
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
    return { id: d.id, ...normalized } as VehicleDoc & { id: string };
  });
  const lastId = list.length > 0 ? list[list.length - 1].id : null;
  const lastDoc = lastId ? snap.docs.find((d) => d.id === lastId) ?? null : null;
  return { vehicles: list, lastDoc: hasMore ? lastDoc : null, hasMore };
}

export async function getVehicle(companyId: string, vehicleId: string): Promise<(VehicleDoc & { id: string }) | null> {
  const d = await getDoc(vehicleRef(companyId, vehicleId));
  if (!d.exists()) return null;
  const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
  return { id: d.id, ...normalized } as VehicleDoc & { id: string };
}

export async function updateVehicleStatus(
  companyId: string,
  vehicleId: string,
  status: VehicleStatus
): Promise<void> {
  await updateDoc(vehicleRef(companyId, vehicleId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

export async function updateVehicleCity(
  companyId: string,
  vehicleId: string,
  currentCity: string,
  destinationCity?: string
): Promise<void> {
  const payload: Record<string, unknown> = {
    currentCity,
    updatedAt: serverTimestamp(),
  };
  if (destinationCity !== undefined) payload.destinationCity = destinationCity || null;
  await updateDoc(vehicleRef(companyId, vehicleId), payload);
}

export async function declareTransit(
  companyId: string,
  vehicleId: string,
  destinationCity: string
): Promise<void> {
  await updateDoc(vehicleRef(companyId, vehicleId), {
    status: "EN_TRANSIT",
    destinationCity: destinationCity || null,
    updatedAt: serverTimestamp(),
  });
}

export async function declareMaintenance(companyId: string, vehicleId: string): Promise<void> {
  await updateDoc(vehicleRef(companyId, vehicleId), {
    status: "EN_MAINTENANCE",
    destinationCity: null,
    updatedAt: serverTimestamp(),
  });
}

export async function declareAccident(companyId: string, vehicleId: string): Promise<void> {
  await updateDoc(vehicleRef(companyId, vehicleId), {
    status: "ACCIDENTE",
    destinationCity: null,
    updatedAt: serverTimestamp(),
  });
}

/** Phase 1 Stabilization: assign vehicle (Chef Agence). Create affectation doc only; do NOT change operationalStatus yet. */
export async function assignVehicle(
  companyId: string,
  agencyId: string,
  vehicleId: string,
  agencyCity: string,
  payload: Omit<AffectationDoc, "vehicleId" | "vehiclePlate" | "vehicleModel" | "status" | "assignedBy" | "assignedAt"> & { assignedBy: string },
  userId: string,
  role: string
): Promise<string> {
  const v = await getVehicle(companyId, vehicleId);
  if (!v) throw new Error("Véhicule introuvable");
  const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  const tech = (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
  const cityMatch = (v.currentCity ?? "").trim().toLowerCase() === (agencyCity ?? "").trim().toLowerCase();
  if (op !== OPERATIONAL_STATUS.GARAGE || tech !== TECHNICAL_STATUS.NORMAL || !cityMatch) {
    throw new Error("Véhicule non assignable : doit être GARAGE, NORMAL et dans la ville de l'agence.");
  }
  const active = await getActiveAffectationByVehicle(companyId, vehicleId);
  if (active) throw new Error("Ce véhicule est déjà affecté.");
  const now = Timestamp.now();
  const affectationData: AffectationDoc = {
    vehicleId,
    vehiclePlate: v.plateNumber ?? "",
    vehicleModel: v.model ?? "",
    tripId: payload.tripId,
    departureCity: payload.departureCity,
    arrivalCity: payload.arrivalCity,
    departureTime: payload.departureTime,
    driverName: payload.driverName,
    driverPhone: payload.driverPhone,
    convoyeurName: payload.convoyeurName,
    convoyeurPhone: payload.convoyeurPhone,
    status: AFFECTATION_STATUS.AFFECTE,
    assignedBy: userId,
    assignedAt: now,
  };
  return createAffectation(companyId, agencyId, affectationData);
}

/** Phase 1 Stabilization: cancel affectation. If status was AFFECTE, set vehicle back to GARAGE and log statusHistory. */
export async function cancelAffectation(
  companyId: string,
  agencyId: string,
  affectationId: string,
  userId: string,
  role: string
): Promise<void> {
  const aff = await getAffectation(companyId, agencyId, affectationId);
  if (!aff) throw new Error("Affectation introuvable.");
  if (aff.status !== AFFECTATION_STATUS.AFFECTE) {
    throw new Error("Seule une affectation au statut AFFECTE peut être annulée.");
  }
  const v = await getVehicle(companyId, aff.vehicleId);
  if (v && (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.AFFECTE) {
    const now = Timestamp.now();
    const entry: StatusHistoryEntry = {
      field: "operationalStatus",
      from: OPERATIONAL_STATUS.AFFECTE,
      to: OPERATIONAL_STATUS.GARAGE,
      changedBy: userId,
      role,
      timestamp: now,
    };
    await updateDoc(vehicleRef(companyId, aff.vehicleId), {
      operationalStatus: OPERATIONAL_STATUS.GARAGE,
      status: VEHICLE_STATUS.GARAGE,
      statusHistory: arrayUnion(entry),
      updatedAt: serverTimestamp(),
    });
  }
  await updateAffectationStatus(companyId, agencyId, affectationId, AFFECTATION_STATUS.CANCELLED);
}

/** Phase 1 Operational: confirm departure (Chef Agence). AFFECTE → EN_TRANSIT. Logs statusHistory. */
export async function confirmDeparture(
  companyId: string,
  vehicleId: string,
  destinationCity: string,
  userId: string,
  role: string
): Promise<void> {
  const v = await getVehicle(companyId, vehicleId);
  if (!v) throw new Error("Véhicule introuvable");
  const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  const tech = (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
  if (op !== OPERATIONAL_STATUS.GARAGE || tech !== TECHNICAL_STATUS.NORMAL) {
    throw new Error("Transition non autorisée : véhicule doit être en GARAGE et NORMAL.");
  }
  if (!canChangeOperationalStatus(op, OPERATIONAL_STATUS.EN_TRANSIT)) {
    throw new Error("Transition opérationnelle non autorisée.");
  }
  const entry: StatusHistoryEntry = {
    field: "operationalStatus",
    from: op,
    to: OPERATIONAL_STATUS.EN_TRANSIT,
    changedBy: userId,
    role,
    timestamp: Timestamp.now(),
  };
  await updateDoc(vehicleRef(companyId, vehicleId), {
    operationalStatus: OPERATIONAL_STATUS.EN_TRANSIT,
    status: VEHICLE_STATUS.EN_TRANSIT,
    destinationCity: destinationCity || null,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}

/** Phase 1 Operational: confirm arrival (Chef Agence destination). EN_TRANSIT → GARAGE, currentCity = destinationCity. Logs statusHistory. */
export async function confirmArrival(
  companyId: string,
  vehicleId: string,
  userId: string,
  role: string
): Promise<void> {
  const v = await getVehicle(companyId, vehicleId);
  if (!v) throw new Error("Véhicule introuvable");
  const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  const dest = v.destinationCity ?? null;
  if (op !== OPERATIONAL_STATUS.EN_TRANSIT) {
    throw new Error("Transition non autorisée : véhicule doit être EN_TRANSIT.");
  }
  if (!canChangeOperationalStatus(op, OPERATIONAL_STATUS.GARAGE)) {
    throw new Error("Transition opérationnelle non autorisée.");
  }
  const newCity = (dest && typeof dest === "string" ? dest : String(dest ?? "")).trim() || v.currentCity;
  const entry: StatusHistoryEntry = {
    field: "operationalStatus",
    from: op,
    to: OPERATIONAL_STATUS.GARAGE,
    changedBy: userId,
    role,
    timestamp: Timestamp.now(),
  };
  await updateDoc(vehicleRef(companyId, vehicleId), {
    operationalStatus: OPERATIONAL_STATUS.GARAGE,
    status: VEHICLE_STATUS.GARAGE,
    currentCity: newCity,
    destinationCity: null,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}

/** Phase 1 Affectation: confirm departure (Chef Agence). Affectation AFFECTE → vehicle EN_TRANSIT, affectation DEPART_CONFIRME. */
export async function confirmDepartureAffectation(
  companyId: string,
  agencyId: string,
  affectationId: string,
  userId: string,
  role: string
): Promise<void> {
  const aff = await getAffectation(companyId, agencyId, affectationId);
  if (!aff) throw new Error("Affectation introuvable.");
  if (aff.status !== AFFECTATION_STATUS.AFFECTE) {
    throw new Error("Seule une affectation au statut AFFECTE peut être confirmée au départ.");
  }
  const v = await getVehicle(companyId, aff.vehicleId);
  if (!v) throw new Error("Véhicule introuvable.");
  const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  if (op !== OPERATIONAL_STATUS.AFFECTE && op !== OPERATIONAL_STATUS.GARAGE) {
    throw new Error("Véhicule doit être GARAGE ou AFFECTE pour confirmer le départ.");
  }
  if (!canChangeOperationalStatus(op, OPERATIONAL_STATUS.EN_TRANSIT)) {
    throw new Error("Transition opérationnelle non autorisée.");
  }
  const now = Timestamp.now();
  const entry: StatusHistoryEntry = {
    field: "operationalStatus",
    from: op,
    to: OPERATIONAL_STATUS.EN_TRANSIT,
    changedBy: userId,
    role,
    timestamp: now,
  };
  await updateDoc(vehicleRef(companyId, aff.vehicleId), {
    operationalStatus: OPERATIONAL_STATUS.EN_TRANSIT,
    status: VEHICLE_STATUS.EN_TRANSIT,
    destinationCity: aff.arrivalCity || null,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
  await updateAffectationStatus(companyId, agencyId, affectationId, AFFECTATION_STATUS.DEPART_CONFIRME, {
    departureConfirmedAt: now,
  });
}

/** Phase 1 Affectation: confirm arrival (Chef Agence destination). Affectation DEPART_CONFIRME → vehicle GARAGE, affectation ARRIVE. */
export async function confirmArrivalAffectation(
  companyId: string,
  agencyId: string,
  affectationId: string,
  agencyCity: string,
  userId: string,
  role: string
): Promise<void> {
  const aff = await getAffectation(companyId, agencyId, affectationId);
  if (!aff) throw new Error("Affectation introuvable.");
  if (aff.status !== AFFECTATION_STATUS.DEPART_CONFIRME) {
    throw new Error("Seule une affectation au statut DEPART_CONFIRME peut être confirmée à l'arrivée.");
  }
  const v = await getVehicle(companyId, aff.vehicleId);
  if (!v) throw new Error("Véhicule introuvable.");
  const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  const dest = (v.destinationCity ?? "").trim().toLowerCase();
  const cityMatch = dest === (agencyCity ?? "").trim().toLowerCase();
  if (op !== OPERATIONAL_STATUS.EN_TRANSIT || !cityMatch) {
    throw new Error("Véhicule doit être EN_TRANSIT et la destination doit être la ville de cette agence.");
  }
  if (!canChangeOperationalStatus(op, OPERATIONAL_STATUS.GARAGE)) {
    throw new Error("Transition opérationnelle non autorisée.");
  }
  const now = Timestamp.now();
  const entry: StatusHistoryEntry = {
    field: "operationalStatus",
    from: op,
    to: OPERATIONAL_STATUS.GARAGE,
    changedBy: userId,
    role,
    timestamp: now,
  };
  await updateDoc(vehicleRef(companyId, aff.vehicleId), {
    operationalStatus: OPERATIONAL_STATUS.GARAGE,
    status: VEHICLE_STATUS.GARAGE,
    currentCity: agencyCity.trim(),
    destinationCity: null,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
  await updateAffectationStatus(companyId, agencyId, affectationId, AFFECTATION_STATUS.ARRIVE, {
    arrivalConfirmedAt: now,
  });
}

/** Phase 1 Operational: set technical status (Chef Garage). Validates transition and logs statusHistory. */
export async function setTechnicalStatus(
  companyId: string,
  vehicleId: string,
  technicalStatus: TechnicalStatus,
  userId: string,
  role: string
): Promise<void> {
  const v = await getVehicle(companyId, vehicleId);
  if (!v) throw new Error("Véhicule introuvable");
  const current = (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
  if (!canChangeTechnicalStatus(current, technicalStatus)) {
    throw new Error(`Transition technique non autorisée : ${current} → ${technicalStatus}`);
  }
  const entry: StatusHistoryEntry = {
    field: "technicalStatus",
    from: current,
    to: technicalStatus,
    changedBy: userId,
    role,
    timestamp: Timestamp.now(),
  };
  const legacyStatus =
    technicalStatus === TECHNICAL_STATUS.MAINTENANCE
      ? VEHICLE_STATUS.EN_MAINTENANCE
      : technicalStatus === TECHNICAL_STATUS.ACCIDENTE
        ? VEHICLE_STATUS.ACCIDENTE
        : technicalStatus === TECHNICAL_STATUS.HORS_SERVICE
          ? VEHICLE_STATUS.HORS_SERVICE
          : VEHICLE_STATUS.GARAGE;
  await updateDoc(vehicleRef(companyId, vehicleId), {
    technicalStatus,
    status: legacyStatus,
    ...(technicalStatus !== TECHNICAL_STATUS.NORMAL ? { destinationCity: null } : {}),
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}

export async function createVehicle(
  companyId: string,
  data: Omit<VehicleDoc, "createdAt" | "updatedAt">
): Promise<string> {
  const ref = doc(vehiclesRef(companyId));
  const now = Timestamp.now();
  const legacyStatus = data.status ?? VEHICLE_STATUS.GARAGE;
  let technicalStatus: TechnicalStatus = TECHNICAL_STATUS.NORMAL;
  let operationalStatus: OperationalStatus = OPERATIONAL_STATUS.GARAGE;
  if (legacyStatus === VEHICLE_STATUS.EN_MAINTENANCE) technicalStatus = TECHNICAL_STATUS.MAINTENANCE;
  else if (legacyStatus === VEHICLE_STATUS.ACCIDENTE) technicalStatus = TECHNICAL_STATUS.ACCIDENTE;
  else if (legacyStatus === VEHICLE_STATUS.HORS_SERVICE) technicalStatus = TECHNICAL_STATUS.HORS_SERVICE;
  else if (legacyStatus === VEHICLE_STATUS.EN_TRANSIT) operationalStatus = OPERATIONAL_STATUS.EN_TRANSIT;
  else if (legacyStatus === VEHICLE_STATUS.EN_SERVICE) operationalStatus = OPERATIONAL_STATUS.AFFECTE;
  const plateStored = (data.plateNumber ?? "").trim();
  const modelLabel = await ensureVehicleModel(companyId, data.model ?? "");
  const payload = {
    ...data,
    country: data.country ?? "ML",
    plateNumber: plateStored || normalizePlate(data.plateNumber ?? ""),
    model: modelLabel,
    status: legacyStatus,
    technicalStatus,
    operationalStatus,
    statusHistory: [],
    isArchived: false,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, payload);
  return ref.id;
}

/** Phase 1 Stabilization: update vehicle (Chef Garage). Allowed: model, technicalStatus, insuranceExpiryDate, inspectionExpiryDate, vignetteExpiryDate, notes. If EN_TRANSIT, cannot change operationalStatus or currentCity. Appends statusHistory when technicalStatus changes. */
export async function updateVehicle(
  companyId: string,
  vehicleId: string,
  payload: {
    model?: string;
    technicalStatus?: TechnicalStatus;
    insuranceExpiryDate?: Timestamp | null;
    inspectionExpiryDate?: Timestamp | null;
    vignetteExpiryDate?: Timestamp | null;
    notes?: string | null;
  },
  userId: string,
  role: string
): Promise<void> {
  const v = await getVehicle(companyId, vehicleId);
  if (!v) throw new Error("Véhicule introuvable.");
  const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (payload.model !== undefined) {
    updates.model = await ensureVehicleModel(companyId, payload.model);
  }
  if (payload.technicalStatus !== undefined) {
    const current = (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
    if (!canChangeTechnicalStatus(current, payload.technicalStatus)) {
      throw new Error(`Transition technique non autorisée : ${current} → ${payload.technicalStatus}`);
    }
    const entry: StatusHistoryEntry = {
      field: "technicalStatus",
      from: current,
      to: payload.technicalStatus,
      changedBy: userId,
      role,
      timestamp: Timestamp.now(),
    };
    updates.technicalStatus = payload.technicalStatus;
    updates.statusHistory = arrayUnion(entry);
    const legacyStatus =
      payload.technicalStatus === TECHNICAL_STATUS.MAINTENANCE
        ? VEHICLE_STATUS.EN_MAINTENANCE
        : payload.technicalStatus === TECHNICAL_STATUS.ACCIDENTE
          ? VEHICLE_STATUS.ACCIDENTE
          : payload.technicalStatus === TECHNICAL_STATUS.HORS_SERVICE
            ? VEHICLE_STATUS.HORS_SERVICE
            : VEHICLE_STATUS.GARAGE;
    updates.status = legacyStatus;
    if (payload.technicalStatus !== TECHNICAL_STATUS.NORMAL) updates.destinationCity = null;
  }
  if (payload.insuranceExpiryDate !== undefined) updates.insuranceExpiryDate = payload.insuranceExpiryDate ?? null;
  if (payload.inspectionExpiryDate !== undefined) updates.inspectionExpiryDate = payload.inspectionExpiryDate ?? null;
  if (payload.vignetteExpiryDate !== undefined) updates.vignetteExpiryDate = payload.vignetteExpiryDate ?? null;
  if (payload.notes !== undefined) updates.notes = payload.notes ?? null;
  await updateDoc(vehicleRef(companyId, vehicleId), updates);
}

/** Phase 1 Soft Delete: archive vehicle (no document deletion). Only if operationalStatus === GARAGE and no active affectation. Sets isArchived=true, archivedAt, archivedBy, appends statusHistory. */
export async function archiveVehicle(
  companyId: string,
  vehicleId: string,
  userId: string,
  role: string
): Promise<void> {
  const v = await getVehicle(companyId, vehicleId);
  if (!v) throw new Error("Véhicule introuvable.");
  if ((v as any).isArchived === true) {
    throw new Error("Ce véhicule est déjà archivé.");
  }
  const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  if (op !== OPERATIONAL_STATUS.GARAGE) {
    throw new Error("Impossible d'archiver : le véhicule n'est pas au garage.");
  }
  const active = await getActiveAffectationByVehicle(companyId, vehicleId);
  if (active) throw new Error("Impossible d'archiver : ce véhicule a une affectation active.");
  const now = Timestamp.now();
  const entry: StatusHistoryEntry = {
    field: "archived",
    from: false,
    to: true,
    changedBy: userId,
    role,
    timestamp: now,
  };
  await updateDoc(vehicleRef(companyId, vehicleId), {
    isArchived: true,
    archivedAt: serverTimestamp(),
    archivedBy: userId,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}
