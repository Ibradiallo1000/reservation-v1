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
  where,
  limit,
  orderBy,
  startAfter,
  Timestamp,
  arrayUnion,
  type DocumentSnapshot,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { VehicleDoc, VehicleStatus } from "./vehicleTypes";
import { VEHICLES_COLLECTION, VEHICLE_STATUS, CANONICAL_VEHICLE_STATUS } from "./vehicleTypes";
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
import {
  findTripInstanceBySlot,
  updateTripInstanceStatus,
  assignVehicleToTripInstance,
  getOrCreateTripInstanceForSlot,
} from "../tripInstances/tripInstanceService";
import { TRIP_INSTANCE_STATUS } from "../tripInstances/tripInstanceTypes";
import type { AffectationDoc } from "./affectationTypes";

export function vehiclesRef(companyId: string) {
  return collection(db, "companies", companyId, VEHICLES_COLLECTION);
}

export function vehicleRef(companyId: string, vehicleId: string) {
  return doc(db, "companies", companyId, VEHICLES_COLLECTION, vehicleId);
}

function canonicalStatusFromStates(technicalStatus: TechnicalStatus, operationalStatus: OperationalStatus) {
  if (technicalStatus === TECHNICAL_STATUS.MAINTENANCE) return CANONICAL_VEHICLE_STATUS.MAINTENANCE;
  if (technicalStatus === TECHNICAL_STATUS.ACCIDENTE) return CANONICAL_VEHICLE_STATUS.ACCIDENT;
  if (technicalStatus === TECHNICAL_STATUS.HORS_SERVICE) return CANONICAL_VEHICLE_STATUS.OUT_OF_SERVICE;
  if (operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT) return CANONICAL_VEHICLE_STATUS.ON_TRIP;
  return CANONICAL_VEHICLE_STATUS.AVAILABLE;
}

function normalizeBusNumber(raw: string): string {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  const asNumber = Number(digits);
  if (!Number.isFinite(asNumber) || asNumber < 1 || asNumber > 999) return "";
  return String(asNumber).padStart(3, "0");
}

async function assertBusNumberAvailable(
  companyId: string,
  busNumberNormalized: string,
  excludeVehicleId?: string
): Promise<void> {
  const ref = vehiclesRef(companyId);
  const [busSnap, legacyFleetSnap] = await Promise.all([
    getDocs(query(ref, where("busNumberNormalized", "==", busNumberNormalized), limit(5))),
    getDocs(query(ref, where("fleetNumberNormalized", "==", busNumberNormalized), limit(5))),
  ]);
  const conflict = [...busSnap.docs, ...legacyFleetSnap.docs].find((d) => d.id !== excludeVehicleId);
  if (conflict) {
    throw new Error(`Numero bus deja utilise: ${busNumberNormalized}.`);
  }
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
  const canonicalStatus =
    technicalStatus === TECHNICAL_STATUS.MAINTENANCE
      ? "MAINTENANCE"
      : technicalStatus === TECHNICAL_STATUS.ACCIDENTE
        ? "ACCIDENT"
        : technicalStatus === TECHNICAL_STATUS.HORS_SERVICE
          ? "OUT_OF_SERVICE"
          : operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT
            ? "ON_TRIP"
            : "AVAILABLE";
  return { ...data, technicalStatus, operationalStatus, canonicalStatus };
}

export type ListVehiclesOrderBy = "plate" | "technicalStatus" | "updatedAt";

export async function listVehicles(companyId: string, max = 500): Promise<(VehicleDoc & { id: string })[]> {
  const pageSize = Math.min(max * 3, 1500);
  const mapDocs = (docs: Array<{ id: string; data: () => unknown }>) =>
    docs
      .filter((d) => (d.data() as any).isArchived !== true)
      .slice(0, max)
      .map((d) => {
        const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
        return { id: d.id, ...normalized } as VehicleDoc & { id: string };
      });

  try {
    const ref = vehiclesRef(companyId);
    const q = query(ref, orderBy("plateNumber"), limit(pageSize));
    const snap = await getDocs(q);
    return mapDocs(snap.docs as Array<{ id: string; data: () => unknown }>);
  } catch (error: any) {
    // Production safety: if canonical collection is denied or unavailable, fallback to legacy fleetVehicles.
    if (String(error?.code ?? "") !== "permission-denied") throw error;
    const legacyRef = collection(db, "companies", companyId, "fleetVehicles");
    const legacyQ = query(legacyRef, orderBy("plateNumber"), limit(pageSize));
    const legacySnap = await getDocs(legacyQ);
    return mapDocs(legacySnap.docs as Array<{ id: string; data: () => unknown }>);
  }
}

/** Phase 1 Stabilization: list vehicles with pagination (default 50 per page), orderBy plaque | technicalStatus | updatedAt. Excludes archived (isArchived !== true). */
export async function listVehiclesPaginated(
  companyId: string,
  options: { pageSize?: number; startAfterDoc?: DocumentSnapshot | null; orderByField?: ListVehiclesOrderBy }
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const pageSize = options.pageSize ?? 50;
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

const DEFAULT_PAGE_SIZE = 50;

/** List vehicles in a city (canonical query). Requires Firestore index: vehicles (currentCity ASC, updatedAt DESC). */
export async function listVehiclesByCity(
  companyId: string,
  currentCity: string,
  options: { limitCount?: number; startAfterDoc?: DocumentSnapshot | null } = {}
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const limitCount = options.limitCount ?? DEFAULT_PAGE_SIZE;
  const ref = vehiclesRef(companyId);
  let q = query(
    ref,
    where("currentCity", "==", currentCity),
    orderBy("updatedAt", "desc"),
    limit(limitCount + 1)
  );
  if (options.startAfterDoc) {
    q = query(
      ref,
      where("currentCity", "==", currentCity),
      orderBy("updatedAt", "desc"),
      startAfter(options.startAfterDoc),
      limit(limitCount + 1)
    );
  }
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => (d.data() as any).isArchived !== true).slice(0, limitCount);
  const list = docs.map((d) => {
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
    return { id: d.id, ...normalized } as VehicleDoc & { id: string };
  });
  const hasMore = snap.docs.length > limitCount;
  const lastDoc = docs.length > 0 ? snap.docs[docs.length - 1] ?? null : null;
  return { vehicles: list, lastDoc: hasMore ? lastDoc : null, hasMore };
}

/** List vehicles assigned to an agency. Requires Firestore index: vehicles (currentAgencyId ASC, updatedAt DESC). */
export async function listVehiclesByCurrentAgency(
  companyId: string,
  currentAgencyId: string,
  options: { limitCount?: number; startAfterDoc?: DocumentSnapshot | null } = {}
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const limitCount = options.limitCount ?? DEFAULT_PAGE_SIZE;
  const ref = vehiclesRef(companyId);
  let q = query(
    ref,
    where("currentAgencyId", "==", currentAgencyId),
    orderBy("updatedAt", "desc"),
    limit(limitCount + 1)
  );
  if (options.startAfterDoc) {
    q = query(
      ref,
      where("currentAgencyId", "==", currentAgencyId),
      orderBy("updatedAt", "desc"),
      startAfter(options.startAfterDoc),
      limit(limitCount + 1)
    );
  }
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => (d.data() as any).isArchived !== true).slice(0, limitCount);
  const list = docs.map((d) => {
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
    return { id: d.id, ...normalized } as VehicleDoc & { id: string };
  });
  const hasMore = snap.docs.length > limitCount;
  const lastDoc = docs.length > 0 ? snap.docs[docs.length - 1] ?? null : null;
  return { vehicles: list, lastDoc: hasMore ? lastDoc : null, hasMore };
}

/** List vehicles available in a city (currentCity + GARAGE + NORMAL). Indexed query; no full-fleet load. Requires Firestore index: vehicles (currentCity ASC, operationalStatus ASC, technicalStatus ASC, updatedAt DESC). */
export async function listVehiclesAvailableInCity(
  companyId: string,
  currentCity: string,
  options: { limitCount?: number; startAfterDoc?: DocumentSnapshot | null } = {}
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const limitCount = options.limitCount ?? DEFAULT_PAGE_SIZE;
  const ref = vehiclesRef(companyId);
  let q = query(
    ref,
    where("currentCity", "==", currentCity),
    where("operationalStatus", "==", OPERATIONAL_STATUS.GARAGE),
    where("technicalStatus", "==", TECHNICAL_STATUS.NORMAL),
    orderBy("updatedAt", "desc"),
    limit(limitCount + 1)
  );
  if (options.startAfterDoc) {
    q = query(
      ref,
      where("currentCity", "==", currentCity),
      where("operationalStatus", "==", OPERATIONAL_STATUS.GARAGE),
      where("technicalStatus", "==", TECHNICAL_STATUS.NORMAL),
      orderBy("updatedAt", "desc"),
      startAfter(options.startAfterDoc),
      limit(limitCount + 1)
    );
  }
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => (d.data() as any).isArchived !== true).slice(0, limitCount);
  const list = docs.map((d) => {
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
    return { id: d.id, ...normalized } as VehicleDoc & { id: string };
  });
  const hasMore = snap.docs.length > limitCount;
  const lastDoc = docs.length > 0 ? docs[docs.length - 1] ?? null : null;
  return { vehicles: list, lastDoc: hasMore ? lastDoc : null, hasMore };
}

/** List vehicles in transit to a city (destinationCity + ON_TRIP / EN_TRANSIT). Uses legacy status for backward compatibility. Requires index: vehicles (destinationCity ASC, status ASC, updatedAt DESC). */
export async function listVehiclesInTransitToCity(
  companyId: string,
  destinationCity: string,
  options: { limitCount?: number; startAfterDoc?: DocumentSnapshot | null } = {}
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const limitCount = options.limitCount ?? DEFAULT_PAGE_SIZE;
  const ref = vehiclesRef(companyId);
  let q = query(
    ref,
    where("destinationCity", "==", destinationCity),
    where("status", "==", VEHICLE_STATUS.EN_TRANSIT),
    orderBy("updatedAt", "desc"),
    limit(limitCount + 1)
  );
  if (options.startAfterDoc) {
    q = query(
      ref,
      where("destinationCity", "==", destinationCity),
      where("status", "==", VEHICLE_STATUS.EN_TRANSIT),
      orderBy("updatedAt", "desc"),
      startAfter(options.startAfterDoc),
      limit(limitCount + 1)
    );
  }
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => (d.data() as any).isArchived !== true).slice(0, limitCount);
  const list = docs.map((d) => {
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>);
    return { id: d.id, ...normalized } as VehicleDoc & { id: string };
  });
  const hasMore = snap.docs.length > limitCount;
  const lastDoc = docs.length > 0 ? snap.docs[docs.length - 1] ?? null : null;
  return { vehicles: list, lastDoc: hasMore ? lastDoc : null, hasMore };
}

/** Canonical: when a trip starts, set vehicle to ON_TRIP, currentTripId, destinationCity. */
export async function setVehicleOnTripStart(
  companyId: string,
  vehicleId: string,
  tripId: string,
  arrivalCity: string
): Promise<void> {
  await updateDoc(vehicleRef(companyId, vehicleId), {
    canonicalStatus: CANONICAL_VEHICLE_STATUS.ON_TRIP,
    status: VEHICLE_STATUS.EN_TRANSIT,
    operationalStatus: OPERATIONAL_STATUS.EN_TRANSIT,
    currentTripId: tripId,
    destinationCity: arrivalCity || null,
    updatedAt: serverTimestamp(),
  });
}

/** Canonical: when a trip finishes, set vehicle to AVAILABLE, currentCity = arrivalCity, lastTripId = tripId, clear currentTripId. */
export async function setVehicleOnTripEnd(
  companyId: string,
  vehicleId: string,
  arrivalCity: string,
  tripId: string
): Promise<void> {
  await updateDoc(vehicleRef(companyId, vehicleId), {
    canonicalStatus: CANONICAL_VEHICLE_STATUS.AVAILABLE,
    status: VEHICLE_STATUS.GARAGE,
    operationalStatus: OPERATIONAL_STATUS.GARAGE,
    currentCity: arrivalCity || "",
    destinationCity: null,
    lastTripId: tripId,
    currentTripId: null,
    updatedAt: serverTimestamp(),
  });
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

/** Phase 1 Stabilization: assign vehicle (Chef Agence). Create affectation doc only; do NOT change operationalStatus yet. Optionally write vehicleId to weeklyTrip doc when weeklyTripId is provided. */
export async function assignVehicle(
  companyId: string,
  agencyId: string,
  vehicleId: string,
  agencyCity: string,
  payload: Omit<AffectationDoc, "vehicleId" | "vehiclePlate" | "vehicleModel" | "status" | "assignedBy" | "assignedAt"> & { assignedBy: string },
  userId: string,
  role: string,
  options?: { weeklyTripId?: string | null }
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
  const affectationId = await createAffectation(companyId, agencyId, affectationData);
  if (options?.weeklyTripId?.trim()) {
    const weeklyTripRef = doc(db, "companies", companyId, "agences", agencyId, "weeklyTrips", options.weeklyTripId.trim());
    await updateDoc(weeklyTripRef, { vehicleId, updatedAt: serverTimestamp() });
  }
  const depTime = payload.departureTime ?? "";
  const datePart = typeof depTime === "string" && depTime.length >= 10 ? depTime.slice(0, 10) : "";
  const timePart = typeof depTime === "string" && depTime.length >= 16 ? depTime.slice(11, 16) : "";
  if (datePart && timePart) {
    try {
      const ti = await getOrCreateTripInstanceForSlot(companyId, {
        agencyId,
        departureCity: payload.departureCity ?? "",
        arrivalCity: payload.arrivalCity ?? "",
        date: datePart,
        departureTime: timePart,
        seatCapacity: 50,
      });
      await assignVehicleToTripInstance(companyId, ti.id, vehicleId);
    } catch (_) { /* optional: trip instance may not exist or assign may fail */ }
  }
  return affectationId;
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
    canonicalStatus: CANONICAL_VEHICLE_STATUS.ON_TRIP,
    currentTripId: affectationId,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
  await updateAffectationStatus(companyId, agencyId, affectationId, AFFECTATION_STATUS.DEPART_CONFIRME, {
    departureConfirmedAt: now,
  });
  const datePart = typeof aff.departureTime === "string" && aff.departureTime.length >= 10 ? aff.departureTime.slice(0, 10) : "";
  const timePart = typeof aff.departureTime === "string" && aff.departureTime.length >= 16 ? aff.departureTime.slice(11, 16) : "";
  if (datePart && timePart) {
    try {
      const ti = await findTripInstanceBySlot(companyId, agencyId, datePart, timePart, aff.departureCity || "", aff.arrivalCity || "");
      if (ti) {
        await updateTripInstanceStatus(companyId, ti.id, TRIP_INSTANCE_STATUS.DEPARTED);
        await assignVehicleToTripInstance(companyId, ti.id, aff.vehicleId);
      }
    } catch (_) { /* optional: trip instance may not exist */ }
  }
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
    canonicalStatus: CANONICAL_VEHICLE_STATUS.AVAILABLE,
    currentTripId: null,
    lastTripId: affectationId,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
  await updateAffectationStatus(companyId, agencyId, affectationId, AFFECTATION_STATUS.ARRIVE, {
    arrivalConfirmedAt: now,
  });
  const datePart = typeof aff.departureTime === "string" && aff.departureTime.length >= 10 ? aff.departureTime.slice(0, 10) : "";
  const timePart = typeof aff.departureTime === "string" && aff.departureTime.length >= 16 ? aff.departureTime.slice(11, 16) : "";
  if (datePart && timePart) {
    try {
      const ti = await findTripInstanceBySlot(companyId, agencyId, datePart, timePart, aff.departureCity || "", aff.arrivalCity || "");
      if (ti) await updateTripInstanceStatus(companyId, ti.id, TRIP_INSTANCE_STATUS.ARRIVED);
    } catch (_) { /* optional */ }
  }
}

/** Emergency operation (HQ logistics): replace a broken in-transit vehicle by another available vehicle. */
export async function emergencyReplaceVehicleOnTrip(
  companyId: string,
  brokenVehicleId: string,
  replacementVehicleId: string,
  userId: string,
  role: string
): Promise<string> {
  if (!companyId || !brokenVehicleId || !replacementVehicleId) {
    throw new Error("Parametres invalides pour le remplacement d'urgence.");
  }
  if (brokenVehicleId === replacementVehicleId) {
    throw new Error("Le vehicule de remplacement doit etre different du vehicule en panne.");
  }

  const active = await getActiveAffectationByVehicle(companyId, brokenVehicleId);
  if (!active) {
    throw new Error("Aucune affectation active trouvee pour le vehicule en panne.");
  }
  const replacement = await getVehicle(companyId, replacementVehicleId);
  if (!replacement) throw new Error("Vehicule de remplacement introuvable.");

  const replacementOp = (replacement.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  const replacementTech = (replacement.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
  if (replacementOp !== OPERATIONAL_STATUS.GARAGE || replacementTech !== TECHNICAL_STATUS.NORMAL) {
    throw new Error("Le vehicule de remplacement doit etre GARAGE et NORMAL.");
  }
  const alreadyAssigned = await getActiveAffectationByVehicle(companyId, replacementVehicleId);
  if (alreadyAssigned) {
    throw new Error("Ce vehicule de remplacement est deja affecte.");
  }

  const now = Timestamp.now();
  const replacementAffectation: AffectationDoc = {
    vehicleId: replacementVehicleId,
    vehiclePlate: replacement.plateNumber ?? "",
    vehicleModel: replacement.model ?? "",
    tripId: active.data.tripId ?? "",
    departureCity: active.data.departureCity ?? replacement.currentCity ?? "",
    arrivalCity: active.data.arrivalCity ?? "",
    departureTime: active.data.departureTime ?? now.toDate().toISOString(),
    driverName: active.data.driverName ?? "",
    driverPhone: active.data.driverPhone ?? "",
    convoyeurName: active.data.convoyeurName ?? "",
    convoyeurPhone: active.data.convoyeurPhone ?? "",
    status: AFFECTATION_STATUS.DEPART_CONFIRME,
    assignedBy: userId,
    assignedAt: now,
    departureConfirmedAt: now,
    arrivalConfirmedAt: null,
  };

  const newAffectationId = await createAffectation(companyId, active.agencyId, replacementAffectation);

  const entry: StatusHistoryEntry = {
    field: "operationalStatus",
    from: replacementOp,
    to: OPERATIONAL_STATUS.EN_TRANSIT,
    changedBy: userId,
    role,
    timestamp: now,
  };
  await updateDoc(vehicleRef(companyId, replacementVehicleId), {
    operationalStatus: OPERATIONAL_STATUS.EN_TRANSIT,
    status: VEHICLE_STATUS.EN_TRANSIT,
    canonicalStatus: CANONICAL_VEHICLE_STATUS.ON_TRIP,
    currentTripId: newAffectationId,
    destinationCity: active.data.arrivalCity || null,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });

  return newAffectationId;
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
  const nextOperational = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
  await updateDoc(vehicleRef(companyId, vehicleId), {
    technicalStatus,
    canonicalStatus: canonicalStatusFromStates(technicalStatus, nextOperational),
    status: legacyStatus,
    ...(technicalStatus !== TECHNICAL_STATUS.NORMAL ? { destinationCity: null } : {}),
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}

export async function createVehicle(
  companyId: string,
  data: Omit<VehicleDoc, "createdAt" | "updatedAt">,
  meta?: { createdBy?: string; createdByRole?: string; sourceModule?: string }
): Promise<string> {
  if (!data.insuranceExpiryDate || !data.inspectionExpiryDate || !data.vignetteExpiryDate) {
    throw new Error("Les dates d'expiration assurance, contrôle technique et vignette sont obligatoires.");
  }
  const busNumber = normalizeBusNumber(String((data as any).busNumber ?? (data as any).fleetNumber ?? ""));
  if (!busNumber) {
    throw new Error("Le numero bus est obligatoire (001 a 999).");
  }
  await assertBusNumberAvailable(companyId, busNumber);
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
  const modelLabel = await ensureVehicleModel(companyId, data.model ?? "", {
    createdBy: meta?.createdBy,
    createdByRole: meta?.createdByRole,
  });
  const plateNormalized = normalizePlate(data.plateNumber ?? "");
  const payload = {
    ...data,
    busNumber,
    busNumberNormalized: busNumber,
    // Legacy compatibility for existing queries/data.
    fleetNumber: busNumber,
    fleetNumberNormalized: busNumber,
    country: data.country ?? "ML",
    plateNumber: plateStored || plateNormalized,
    plateNumberNormalized: plateNormalized,
    model: modelLabel,
    modelNormalized: normalizeModel(modelLabel),
    companyId,
    status: legacyStatus,
    technicalStatus,
    operationalStatus,
    createdBy: meta?.createdBy ?? null,
    createdByRole: meta?.createdByRole ?? null,
    sourceModule: meta?.sourceModule ?? "garage_dashboard",
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
    busNumber?: string;
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
  const finalInsurance =
    payload.insuranceExpiryDate !== undefined ? payload.insuranceExpiryDate : ((v as any).insuranceExpiryDate ?? null);
  const finalInspection =
    payload.inspectionExpiryDate !== undefined ? payload.inspectionExpiryDate : ((v as any).inspectionExpiryDate ?? null);
  const finalVignette =
    payload.vignetteExpiryDate !== undefined ? payload.vignetteExpiryDate : ((v as any).vignetteExpiryDate ?? null);

  if (!finalInsurance || !finalInspection || !finalVignette) {
    throw new Error("Assurance, contrôle technique et vignette doivent être renseignés pour ce véhicule.");
  }

  const updates: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    updatedBy: userId,
    updatedByRole: role,
    companyId,
  };
  const currentBusNumber = normalizeBusNumber(String((v as any).busNumber ?? (v as any).fleetNumber ?? ""));
  if (
    currentBusNumber &&
    (String((v as any).busNumber ?? "") !== currentBusNumber ||
      String((v as any).fleetNumber ?? "") !== currentBusNumber)
  ) {
    updates.busNumber = currentBusNumber;
    updates.busNumberNormalized = currentBusNumber;
    updates.fleetNumber = currentBusNumber;
    updates.fleetNumberNormalized = currentBusNumber;
  }
  if (payload.busNumber !== undefined) {
    const busNumber = normalizeBusNumber(payload.busNumber);
    if (!busNumber) {
      throw new Error("Le numero bus est obligatoire (001 a 999).");
    }
    await assertBusNumberAvailable(companyId, busNumber, vehicleId);
    updates.busNumber = busNumber;
    updates.busNumberNormalized = busNumber;
    updates.fleetNumber = busNumber;
    updates.fleetNumberNormalized = busNumber;
  }
  if (payload.model !== undefined) {
    updates.model = await ensureVehicleModel(companyId, payload.model, { createdBy: userId, createdByRole: role });
  }
  if (payload.technicalStatus !== undefined) {
    const current = (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
    if (payload.technicalStatus !== current) {
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
      const nextOperational = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
      updates.canonicalStatus = canonicalStatusFromStates(payload.technicalStatus, nextOperational);
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
  }
  updates.insuranceExpiryDate = finalInsurance;
  updates.inspectionExpiryDate = finalInspection;
  updates.vignetteExpiryDate = finalVignette;
  if (payload.notes !== undefined) updates.notes = payload.notes ?? null;
  if (!(v as any).createdAt) updates.createdAt = Timestamp.now();
  if (!(v as any).createdBy) updates.createdBy = userId;
  if (!(v as any).createdByRole) updates.createdByRole = role;
  if (!(v as any).sourceModule) updates.sourceModule = "garage_dashboard";
  if (!(v as any).plateNumberNormalized) updates.plateNumberNormalized = normalizePlate(String((v as any).plateNumber ?? ""));
  updates.modelNormalized = normalizeModel(String((updates.model ?? (v as any).model ?? "") as string));
  await updateDoc(vehicleRef(companyId, vehicleId), updates);
}

export async function suggestNextBusNumber(companyId: string): Promise<string> {
  const vehicles = await listVehicles(companyId, 2000);
  let maxNumber = 0;
  for (const v of vehicles) {
    const raw = String((v as any).busNumber ?? (v as any).fleetNumber ?? "");
    const normalized = normalizeBusNumber(raw);
    const n = Number(normalized);
    if (Number.isFinite(n) && n > maxNumber) maxNumber = n;
  }
  return String(Math.min(maxNumber + 1, 999)).padStart(3, "0");
}

export type VehiclesMetadataBackfillResult = {
  scanned: number;
  updated: number;
  skipped: number;
};

/** One-shot backfill: complete metadata/compliance fields on existing vehicles without recreating docs. */
export async function backfillVehiclesMetadata(
  companyId: string,
  userId: string,
  role: string
): Promise<VehiclesMetadataBackfillResult> {
  const vehicles = await listVehicles(companyId, 2000);
  let updated = 0;
  let skipped = 0;
  let scanned = 0;

  const now = Timestamp.now();
  let batch = writeBatch(db);
  let batchOps = 0;
  const usedBusNumbers = new Set<number>();

  for (const vehicle of vehicles) {
    const existing = normalizeBusNumber(String((vehicle as any).busNumber ?? (vehicle as any).fleetNumber ?? ""));
    if (!existing) continue;
    const n = Number(existing);
    if (Number.isFinite(n) && n >= 1 && n <= 999) usedBusNumbers.add(n);
  }

  const nextAvailableBusNumber = () => {
    for (let i = 1; i <= 999; i += 1) {
      if (!usedBusNumbers.has(i)) {
        usedBusNumbers.add(i);
        return String(i).padStart(3, "0");
      }
    }
    return "";
  };

  for (const vehicle of vehicles) {
    scanned += 1;
    const patch: Record<string, unknown> = {};

    const plate = normalizePlate(String((vehicle as any).plateNumber ?? ""));
    const model = normalizeModel(String((vehicle as any).model ?? ""));
    const missingComplianceFields: string[] = [];
    if (!(vehicle as any).insuranceExpiryDate) missingComplianceFields.push("insuranceExpiryDate");
    if (!(vehicle as any).inspectionExpiryDate) missingComplianceFields.push("inspectionExpiryDate");
    if (!(vehicle as any).vignetteExpiryDate) missingComplianceFields.push("vignetteExpiryDate");

    if (!(vehicle as any).companyId) patch.companyId = companyId;
    if (!(vehicle as any).createdAt) patch.createdAt = now;
    if (!(vehicle as any).createdBy) patch.createdBy = userId;
    if (!(vehicle as any).createdByRole) patch.createdByRole = role;
    if (!(vehicle as any).sourceModule) patch.sourceModule = "garage_dashboard";
    let busNumber = normalizeBusNumber(String((vehicle as any).busNumber ?? (vehicle as any).fleetNumber ?? ""));
    if (!busNumber) {
      busNumber = nextAvailableBusNumber();
    }
    if (busNumber) {
      if (String((vehicle as any).busNumber ?? "") !== busNumber) patch.busNumber = busNumber;
      if (String((vehicle as any).busNumberNormalized ?? "") !== busNumber) patch.busNumberNormalized = busNumber;
      // Legacy mirrors
      if (String((vehicle as any).fleetNumber ?? "") !== busNumber) patch.fleetNumber = busNumber;
      if (String((vehicle as any).fleetNumberNormalized ?? "") !== busNumber) patch.fleetNumberNormalized = busNumber;
    }
    if (!(vehicle as any).plateNumberNormalized) patch.plateNumberNormalized = plate;
    if (!(vehicle as any).modelNormalized) patch.modelNormalized = model;
    const technical = ((vehicle as any).technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
    const operational = ((vehicle as any).operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
    const expectedCanonical = canonicalStatusFromStates(technical, operational);
    if (String((vehicle as any).canonicalStatus ?? "") !== expectedCanonical) {
      patch.canonicalStatus = expectedCanonical;
    }
    patch.complianceComplete = missingComplianceFields.length === 0;
    patch.missingComplianceFields = missingComplianceFields;
    patch.updatedAt = now;
    patch.updatedBy = userId;
    patch.updatedByRole = role;

    if (Object.keys(patch).length === 0) {
      skipped += 1;
      continue;
    }

    batch.update(vehicleRef(companyId, vehicle.id), patch);
    batchOps += 1;
    updated += 1;

    if (batchOps >= 450) {
      await batch.commit();
      batch = writeBatch(db);
      batchOps = 0;
    }
  }

  if (batchOps > 0) {
    await batch.commit();
  }

  return { scanned, updated, skipped };
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
