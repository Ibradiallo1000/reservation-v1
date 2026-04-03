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
  documentId,
  Timestamp,
  arrayUnion,
  deleteField,
  type DocumentSnapshot,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { normalizeCity } from "@/shared/utils/normalizeCity";
import type { VehicleDoc, VehicleStatus } from "./vehicleTypes";
import { VEHICLES_COLLECTION, VEHICLE_STATUS, CANONICAL_VEHICLE_STATUS } from "./vehicleTypes";
import {
  assertValidFleetStatus,
  fleetStatusToLegacyFirestoreFields,
  inferFleetStatus,
  isValidFleetStatus,
  legacyVehicleStatusToFleetStatus,
  VEHICLE_FLEET_STATUS,
  type VehicleFleetStatus,
} from "./vehicleFleetStatus";
import { normalizePlate } from "./plateValidation";
import { normalizeModel, ensureVehicleModel } from "./vehicleModelsService";
import {
  TECHNICAL_STATUS,
  OPERATIONAL_STATUS,
  canChangeTechnicalStatus,
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
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";

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

async function markVehicleIncidentAsDisrupted(
  companyId: string,
  vehicleId: string,
  reason: "maintenance" | "accidented"
): Promise<void> {
  const vSnap = await getDoc(vehicleRef(companyId, vehicleId));
  if (!vSnap.exists()) return;
  const vData = vSnap.data() as { currentAssignmentId?: string | null; currentTripId?: string | null };
  const assignmentId = String(vData.currentAssignmentId ?? "").trim();
  const currentTripId = String(vData.currentTripId ?? "").trim();
  if (!assignmentId && !currentTripId) return;

  let disruptedTripExecutionId: string | null = null;
  if (currentTripId) {
    const byIdSnap = await getDoc(doc(db, "companies", companyId, "tripExecutions", currentTripId));
    if (byIdSnap.exists()) disruptedTripExecutionId = byIdSnap.id;
  }
  if (!disruptedTripExecutionId && assignmentId) {
    const q = query(
      collection(db, "companies", companyId, "tripExecutions"),
      where("tripAssignmentId", "==", assignmentId),
      limit(1)
    );
    const snap = await getDocs(q);
    disruptedTripExecutionId = snap.docs[0]?.id ?? null;
  }
  if (disruptedTripExecutionId) {
    await updateDoc(doc(db, "companies", companyId, "tripExecutions", disruptedTripExecutionId), {
      status: "disrupted",
      disruptedAt: serverTimestamp(),
      disruptedReason: reason === "maintenance" ? "vehicle_maintenance" : "vehicle_accidented",
      updatedAt: serverTimestamp(),
    });
  }

  const notifRef = doc(collection(db, "companies", companyId, "notifications"));
  await setDoc(notifRef, {
    type: "planning_vehicle_incident",
    entityType: "planning_assignment",
    entityId: assignmentId || currentTripId || vehicleId,
    title: "Action logistique requise",
    body:
      reason === "maintenance"
        ? `Le véhicule ${vehicleId} est en maintenance. Décider remplacement ou annulation.`
        : `Le véhicule ${vehicleId} est accidenté. Décider remplacement ou annulation.`,
    link: `/compagnie/${companyId}/logistics`,
    read: false,
    createdAt: serverTimestamp(),
  });
  await setDoc(doc(collection(db, "companies", companyId, "logisticsActions")), {
    type: "vehicle_incident",
    vehicleId,
    tripAssignmentId: assignmentId || null,
    tripExecutionId: disruptedTripExecutionId,
    status: "pending",
    decision: null,
    reason,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

function normalizeBusNumber(raw: string): string {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  const asNumber = Number(digits);
  if (!Number.isFinite(asNumber) || asNumber < 1 || asNumber > 999) return "";
  return String(asNumber).padStart(3, "0");
}

type CourierBatchDoc = {
  tripKey?: string;
  vehicleId?: string;
  shipmentIds?: string[];
  status?: string;
};

const VEHICLE_DATA_DEBUG =
  typeof import.meta !== "undefined" && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);

const LEGACY_VEHICLE_STATUS_SET = new Set<string>(Object.values(VEHICLE_STATUS));

function normalizeTripKey(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-");
}

async function logVehicleWorkflowEvent(params: {
  companyId: string;
  vehicleId: string;
  statusVehicule: "disponible" | "affecte" | "en_transit" | "en_maintenance";
  sourceAgencyId?: string | null;
  destinationAgencyId?: string | null;
  changedBy?: string | null;
  role?: string | null;
  context?: string;
}): Promise<void> {
  const ref = doc(collection(db, "companies", params.companyId, "fleetMovements"));
  await setDoc(ref, {
    vehicleId: params.vehicleId,
    statusVehicule: params.statusVehicule,
    sourceAgencyId: params.sourceAgencyId ?? null,
    destinationAgencyId: params.destinationAgencyId ?? null,
    changedBy: params.changedBy ?? null,
    role: params.role ?? null,
    context: params.context ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/** Fusion villeActuelle / currentCity + normalisation ; logs Phase 1 en dev. */
function applyNormalizedCityAndFleetToRaw(
  data: Record<string, unknown>,
  context?: { docId?: string }
): Record<string, unknown> {
  const villeActuelle = String(
    (data as { villeActuelle?: string }).villeActuelle ??
      (data as { ville_actuelle?: string }).ville_actuelle ??
      ""
  ).trim();
  let cityRaw = String(data.currentCity ?? "").trim();
  if (!cityRaw && villeActuelle) cityRaw = villeActuelle;
  const currentCity = normalizeCity(cityRaw);
  const next: Record<string, unknown> = { ...data, currentCity };
  if (data.destinationCity !== undefined) {
    if (data.destinationCity === null || data.destinationCity === "") {
      next.destinationCity = data.destinationCity;
    } else {
      next.destinationCity = normalizeCity(String(data.destinationCity));
    }
  }

  if (VEHICLE_DATA_DEBUG) {
    const id = context?.docId ?? "?";
    if (!currentCity) {
      console.warn(`[vehicle-data] Véhicule sans ville (currentCity vide après normalisation) — id=${id}`);
    }
    const st = data.status != null ? String(data.status).trim() : "";
    if (st && !LEGACY_VEHICLE_STATUS_SET.has(st)) {
      console.warn(`[vehicle-data] Statut legacy non reconnu — id=${id} status=${st}`);
    }
    if (data.fleetStatus != null && !isValidFleetStatus(String(data.fleetStatus))) {
      console.warn(`[vehicle-data] fleetStatus invalide en base — id=${id} fleetStatus=${String(data.fleetStatus)}`);
    }
  }

  return next;
}

function buildAffectationTripKey(aff: AffectationDoc): string {
  const datePart = typeof aff.departureTime === "string" && aff.departureTime.length >= 10 ? aff.departureTime.slice(0, 10) : "";
  const timePart = typeof aff.departureTime === "string" && aff.departureTime.length >= 16 ? aff.departureTime.slice(11, 16) : "";
  const dep = String(aff.departureCity ?? "").trim().replace(/\s+/g, "-");
  const arr = String(aff.arrivalCity ?? "").trim().replace(/\s+/g, "-");
  return `${dep}_${arr}_${timePart}_${datePart}`;
}

async function syncCourierWithVehicleDeparture(
  companyId: string,
  originAgencyId: string,
  aff: AffectationDoc
): Promise<void> {
  const batchCol = collection(db, "companies", companyId, "agences", originAgencyId, "batches");
  const snap = await getDocs(
    query(
      batchCol,
      where("vehicleId", "==", aff.vehicleId),
      where("status", "in", ["DRAFT", "READY", "DEPARTED"]),
      limit(20)
    )
  );
  if (snap.empty) return;
  const wantedTripKey = normalizeTripKey(buildAffectationTripKey(aff));
  const sorted = snap.docs.map((d) => ({ id: d.id, data: d.data() as CourierBatchDoc }));
  const exact = sorted.find((b) => normalizeTripKey(b.data.tripKey ?? "") === wantedTripKey);
  const candidate = exact ?? sorted.find((b) => b.data.status === "READY" || b.data.status === "DRAFT") ?? sorted[0];
  if (!candidate) return;

  if (candidate.data.status !== "DEPARTED") {
    await updateDoc(doc(batchCol, candidate.id), { status: "DEPARTED", departedAt: serverTimestamp() });
  }
  const shipmentIds = Array.isArray(candidate.data.shipmentIds) ? candidate.data.shipmentIds : [];
  if (shipmentIds.length === 0) return;

  const shipCol = shipmentsRef(db, companyId);
  await Promise.all(
    shipmentIds.map(async (sid) => {
      const sRef = doc(shipCol, sid);
      const sSnap = await getDoc(sRef);
      if (!sSnap.exists()) return;
      const data = sSnap.data() as { currentStatus?: string };
      if (data.currentStatus === "IN_TRANSIT" || data.currentStatus === "DELIVERED" || data.currentStatus === "CANCELLED") return;
      await updateDoc(sRef, {
        currentStatus: "IN_TRANSIT",
        currentAgencyId: originAgencyId,
        currentLocationAgencyId: originAgencyId,
        vehicleId: aff.vehicleId,
      });
    })
  );
}

async function syncCourierWithVehicleArrival(
  companyId: string,
  originAgencyId: string,
  destinationAgencyId: string | undefined,
  aff: AffectationDoc
): Promise<void> {
  const batchCol = collection(db, "companies", companyId, "agences", originAgencyId, "batches");
  const snap = await getDocs(
    query(
      batchCol,
      where("vehicleId", "==", aff.vehicleId),
      where("status", "in", ["DEPARTED", "CLOSED"]),
      limit(20)
    )
  );
  if (snap.empty) return;
  const wantedTripKey = normalizeTripKey(buildAffectationTripKey(aff));
  const sorted = snap.docs.map((d) => ({ id: d.id, data: d.data() as CourierBatchDoc }));
  const exact = sorted.find((b) => normalizeTripKey(b.data.tripKey ?? "") === wantedTripKey);
  const candidate = exact ?? sorted[0];
  if (!candidate) return;

  const shipmentIds = Array.isArray(candidate.data.shipmentIds) ? candidate.data.shipmentIds : [];
  const shipCol = shipmentsRef(db, companyId);
  await Promise.all(
    shipmentIds.map(async (sid) => {
      const sRef = doc(shipCol, sid);
      const sSnap = await getDoc(sRef);
      if (!sSnap.exists()) return;
      const data = sSnap.data() as { currentStatus?: string; destinationAgencyId?: string };
      if (data.currentStatus === "DELIVERED" || data.currentStatus === "CANCELLED") return;
      const targetAgencyId = destinationAgencyId || data.destinationAgencyId || null;
      await updateDoc(sRef, {
        currentStatus: "ARRIVED",
        ...(targetAgencyId ? { currentAgencyId: targetAgencyId, currentLocationAgencyId: targetAgencyId } : {}),
      });
    })
  );

  await updateDoc(doc(batchCol, candidate.id), {
    status: "CLOSED",
    arrivedAt: serverTimestamp(),
    closedAt: serverTimestamp(),
  });
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
function normalizeVehicleDoc(data: Record<string, unknown>, docId?: string): Record<string, unknown> {
  const prepared = applyNormalizedCityAndFleetToRaw(data, { docId });
  const status = prepared.status as string | undefined;
  const hasNew = prepared.technicalStatus != null && prepared.operationalStatus != null;
  const deriveOperationStatus = (input: Record<string, unknown>): "idle" | "planned" | "in_transit" => {
    const explicit = String(input.operationStatus ?? "").toLowerCase();
    if (explicit === "idle" || explicit === "planned" || explicit === "in_transit") return explicit;
    const op = String(input.operationalStatus ?? OPERATIONAL_STATUS.GARAGE).toUpperCase();
    if (op === OPERATIONAL_STATUS.EN_TRANSIT) return "in_transit";
    if (op === OPERATIONAL_STATUS.AFFECTE) return "planned";
    if (String(input.currentAssignmentId ?? "").trim()) return "planned";
    return "idle";
  };
  const deriveStatusVehicule = (input: Record<string, unknown>): "disponible" | "affecte" | "en_transit" | "en_maintenance" => {
    const explicit = String(input.statusVehicule ?? "").toLowerCase();
    if (explicit === "disponible" || explicit === "affecte" || explicit === "en_transit" || explicit === "en_maintenance") {
      return explicit as "disponible" | "affecte" | "en_transit" | "en_maintenance";
    }
    const tech = String(input.technicalStatus ?? TECHNICAL_STATUS.NORMAL).toUpperCase();
    if (tech !== TECHNICAL_STATUS.NORMAL) return "en_maintenance";
    const op = deriveOperationStatus(input);
    if (op === "in_transit") return "en_transit";
    if (op === "planned") return "affecte";
    return "disponible";
  };
  if (hasNew) {
    const fleetStatus = inferFleetStatus(prepared) as VehicleFleetStatus;
    return { ...prepared, operationStatus: deriveOperationStatus(prepared), statusVehicule: deriveStatusVehicule(prepared), fleetStatus };
  }
  if (!status) {
    const merged = {
      ...prepared,
      technicalStatus: TECHNICAL_STATUS.NORMAL,
      operationalStatus: OPERATIONAL_STATUS.GARAGE,
    };
    return {
      ...merged,
      operationStatus: deriveOperationStatus(merged),
      statusVehicule: deriveStatusVehicule(merged),
      fleetStatus: inferFleetStatus(merged) as VehicleFleetStatus,
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
  const merged = { ...prepared, technicalStatus, operationalStatus, canonicalStatus };
  return {
    ...merged,
    operationStatus: deriveOperationStatus(merged),
    statusVehicule: deriveStatusVehicule(merged),
    fleetStatus: inferFleetStatus(merged) as VehicleFleetStatus,
  };
}

export type ListVehiclesOrderBy = "plate" | "technicalStatus" | "updatedAt";

export async function listVehicles(companyId: string, max = 500): Promise<(VehicleDoc & { id: string })[]> {
  const pageSize = Math.min(max * 3, 1500);
  const mapDocs = (docs: Array<{ id: string; data: () => unknown }>) =>
    docs
      .filter((d) => (d.data() as any).isArchived !== true)
      .slice(0, max)
      .map((d) => {
        const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>, d.id);
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
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>, d.id);
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
  const cityKey = normalizeCity(currentCity);
  const ref = vehiclesRef(companyId);
  let q = query(
    ref,
    where("currentCity", "==", cityKey),
    orderBy("updatedAt", "desc"),
    limit(limitCount + 1)
  );
  if (options.startAfterDoc) {
    q = query(
      ref,
      where("currentCity", "==", cityKey),
      orderBy("updatedAt", "desc"),
      startAfter(options.startAfterDoc),
      limit(limitCount + 1)
    );
  }
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => (d.data() as any).isArchived !== true).slice(0, limitCount);
  const list = docs.map((d) => {
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>, d.id);
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
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>, d.id);
    return { id: d.id, ...normalized } as VehicleDoc & { id: string };
  });
  const hasMore = snap.docs.length > limitCount;
  const lastDoc = docs.length > 0 ? snap.docs[docs.length - 1] ?? null : null;
  return { vehicles: list, lastDoc: hasMore ? lastDoc : null, hasMore };
}

/** Lecture défensive : champs ville alignés sur le canon (minuscule, sans espace). */
export function withNormalizedVehicleCityFields<T extends VehicleDoc & { id: string }>(v: T): T {
  return {
    ...v,
    currentCity: normalizeCity(v.currentCity ?? ""),
    destinationCity:
      v.destinationCity == null || v.destinationCity === ""
        ? v.destinationCity
        : normalizeCity(String(v.destinationCity)),
  } as T;
}

function mapVehiclesWithNormalizedCities(list: (VehicleDoc & { id: string })[]): (VehicleDoc & { id: string })[] {
  return list.map((v) => withNormalizedVehicleCityFields(v));
}

/** List vehicles available in a city (currentCity + GARAGE + NORMAL). Indexed query; no full-fleet load. Requires Firestore index: vehicles (currentCity ASC, operationalStatus ASC, technicalStatus ASC, updatedAt DESC). */
export async function listVehiclesAvailableInCity(
  companyId: string,
  currentCity: string,
  options: { limitCount?: number; startAfterDoc?: DocumentSnapshot | null; agencyId?: string } = {}
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const limitCount = options.limitCount ?? DEFAULT_PAGE_SIZE;
  const ref = vehiclesRef(companyId);
  const cityKey = normalizeCity(currentCity);
  const cityNorm = cityKey;
  try {
    let q = query(
      ref,
      where("currentCity", "==", cityKey),
      where("operationalStatus", "==", OPERATIONAL_STATUS.GARAGE),
      where("technicalStatus", "==", TECHNICAL_STATUS.NORMAL),
      orderBy("updatedAt", "desc"),
      limit(limitCount + 1)
    );
    if (options.startAfterDoc) {
      q = query(
        ref,
        where("currentCity", "==", cityKey),
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
      const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>, d.id);
      return { id: d.id, ...normalized } as VehicleDoc & { id: string };
    }).filter((v) => {
      const statusVehicule = String((v as any).statusVehicule ?? "").toLowerCase();
      if (statusVehicule !== "disponible") return false;
      if (options.agencyId) return String((v as any).currentAgencyId ?? "") === String(options.agencyId);
      return true;
    });
    if (list.length > 0) {
      const hasMore = snap.docs.length > limitCount;
      const lastDoc = docs.length > 0 ? docs[docs.length - 1] ?? null : null;
      return { vehicles: mapVehiclesWithNormalizedCities(list), lastDoc: hasMore ? lastDoc : null, hasMore };
    }
  } catch {
    // Fallback below: tolerate missing index / legacy data shape.
  }

  // Fallback path: robust filtering when currentCity is inconsistent or index is missing.
  const all = await listVehicles(companyId, Math.max(limitCount * 4, 500));
  const filtered = all.filter((v) => {
    if ((v as any).isArchived === true) return false;
    const statusVehicule = String((v as any).statusVehicule ?? "").toLowerCase();
    if (statusVehicule !== "disponible") return false;
    const op = (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) as OperationalStatus;
    const tech = (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
    if (op !== OPERATIONAL_STATUS.GARAGE || tech !== TECHNICAL_STATUS.NORMAL) return false;
    const sameAgency = options.agencyId ? String((v as any).currentAgencyId ?? "") === String(options.agencyId) : false;
    const vCity = normalizeCity(String((v as any).currentCity ?? ""));
    const sameCity = cityNorm ? vCity === cityNorm : true;
    if (sameAgency) return true;
    return !options.agencyId && sameCity;
  });
  return {
    vehicles: mapVehiclesWithNormalizedCities(filtered.slice(0, limitCount)),
    lastDoc: null,
    hasMore: filtered.length > limitCount,
  };
}

/** List vehicles in transit to a city (destinationCity + ON_TRIP / EN_TRANSIT). Uses legacy status for backward compatibility. Requires index: vehicles (destinationCity ASC, status ASC, updatedAt DESC). */
export async function listVehiclesInTransitToCity(
  companyId: string,
  destinationCity: string,
  options: { limitCount?: number; startAfterDoc?: DocumentSnapshot | null } = {}
): Promise<{ vehicles: (VehicleDoc & { id: string })[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
  const limitCount = options.limitCount ?? DEFAULT_PAGE_SIZE;
  const destKey = normalizeCity(destinationCity);
  const ref = vehiclesRef(companyId);
  let q = query(
    ref,
    where("destinationCity", "==", destKey),
    where("status", "==", VEHICLE_STATUS.EN_TRANSIT),
    orderBy("updatedAt", "desc"),
    limit(limitCount + 1)
  );
  if (options.startAfterDoc) {
    q = query(
      ref,
      where("destinationCity", "==", destKey),
      where("status", "==", VEHICLE_STATUS.EN_TRANSIT),
      orderBy("updatedAt", "desc"),
      startAfter(options.startAfterDoc),
      limit(limitCount + 1)
    );
  }
  const snap = await getDocs(q);
  const docs = snap.docs.filter((d) => (d.data() as any).isArchived !== true).slice(0, limitCount);
  const list = docs.map((d) => {
    const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>, d.id);
    return { id: d.id, ...normalized } as VehicleDoc & { id: string };
  });
  const hasMore = snap.docs.length > limitCount;
  const lastDoc = docs.length > 0 ? snap.docs[docs.length - 1] ?? null : null;
  return { vehicles: list, lastDoc: hasMore ? lastDoc : null, hasMore };
}

/** @deprecated L’état trajet est synchronisé via tripInstance (transaction). Ne fait aucune écriture véhicule. */
export async function setVehicleOnTripStart(
  _companyId: string,
  _vehicleId: string,
  _tripId: string,
  _arrivalCity: string
): Promise<void> {
  return;
}

/** @deprecated L’état trajet est synchronisé via tripInstance (transaction). Ne fait aucune écriture véhicule. */
export async function setVehicleOnTripEnd(
  _companyId: string,
  _vehicleId: string,
  _arrivalCity: string,
  _tripId: string
): Promise<void> {
  return;
}

export async function getVehicle(companyId: string, vehicleId: string): Promise<(VehicleDoc & { id: string }) | null> {
  const d = await getDoc(vehicleRef(companyId, vehicleId));
  if (!d.exists()) return null;
  const normalized = normalizeVehicleDoc(d.data() as Record<string, unknown>, d.id);
  return { id: d.id, ...normalized } as VehicleDoc & { id: string };
}

export async function updateVehicleStatus(
  companyId: string,
  vehicleId: string,
  status: VehicleStatus
): Promise<void> {
  const fleetStatus = legacyVehicleStatusToFleetStatus(status);
  await updateDoc(vehicleRef(companyId, vehicleId), {
    status,
    fleetStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function updateVehicleCity(
  companyId: string,
  vehicleId: string,
  currentCity: string,
  destinationCity?: string
): Promise<void> {
  const snap = await getDoc(vehicleRef(companyId, vehicleId));
  const raw = (snap.data() as Record<string, unknown>) ?? {};
  const payload: Record<string, unknown> = {
    currentCity: normalizeCity(currentCity),
    updatedAt: serverTimestamp(),
  };
  if (destinationCity !== undefined) {
    payload.destinationCity = destinationCity ? normalizeCity(destinationCity) : null;
  }
  const mergedForFleet = { ...raw, ...payload };
  payload.fleetStatus = inferFleetStatus(mergedForFleet);
  await updateDoc(vehicleRef(companyId, vehicleId), payload);
}

/** @deprecated Transit : utiliser la progression tripInstance. Aucune écriture sur le véhicule. */
export async function declareTransit(
  _companyId: string,
  _vehicleId: string,
  _destinationCity: string
): Promise<void> {
  return;
}

export async function declareMaintenance(companyId: string, vehicleId: string): Promise<void> {
  await markVehicleIncidentAsDisrupted(companyId, vehicleId, "maintenance");
  await updateDoc(vehicleRef(companyId, vehicleId), {
    status: "EN_MAINTENANCE",
    technicalStatus: TECHNICAL_STATUS.MAINTENANCE,
    operationalStatus: OPERATIONAL_STATUS.GARAGE,
    fleetStatus: VEHICLE_FLEET_STATUS.MAINTENANCE,
    statusVehicule: "en_maintenance",
    destinationCity: null,
    updatedAt: serverTimestamp(),
  });
}

export async function declareAccident(companyId: string, vehicleId: string): Promise<void> {
  await markVehicleIncidentAsDisrupted(companyId, vehicleId, "accidented");
  await updateDoc(vehicleRef(companyId, vehicleId), {
    status: "ACCIDENTE",
    technicalStatus: TECHNICAL_STATUS.ACCIDENTE,
    operationalStatus: OPERATIONAL_STATUS.GARAGE,
    fleetStatus: VEHICLE_FLEET_STATUS.MAINTENANCE,
    statusVehicule: "en_maintenance",
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
  const tech = (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
  const cityMatch = normalizeCity(v.currentCity ?? "") === normalizeCity(agencyCity ?? "");
  const agencyMatch = String((v as any).currentAgencyId ?? "").trim() === String(agencyId ?? "").trim();
  if (tech !== TECHNICAL_STATUS.NORMAL || !(cityMatch || agencyMatch)) {
    throw new Error("Véhicule non assignable : doit être NORMAL et dans la ville de l'agence.");
  }
  if (String((v as any).statusVehicule ?? "disponible").toLowerCase() !== "disponible") {
    throw new Error("Affectation impossible: véhicule non disponible.");
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
  await updateDoc(vehicleRef(companyId, vehicleId), {
    defaultDriverName: payload.driverName ?? "",
    defaultDriverPhone: payload.driverPhone ?? "",
    defaultConvoyeurName: payload.convoyeurName ?? "",
    defaultConvoyeurPhone: payload.convoyeurPhone ?? "",
    destinationCity: payload.arrivalCity ? normalizeCity(payload.arrivalCity) : null,
    updatedAt: serverTimestamp(),
  });
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
  role: string,
  cancelReason?: string
): Promise<void> {
  const aff = await getAffectation(companyId, agencyId, affectationId);
  if (!aff) throw new Error("Affectation introuvable.");
  if (aff.status !== AFFECTATION_STATUS.AFFECTE) {
    throw new Error("Seule une affectation au statut AFFECTE peut être annulée.");
  }
  await updateAffectationStatus(companyId, agencyId, affectationId, AFFECTATION_STATUS.CANCELLED, {
    cancelledAt: Timestamp.now(),
    cancelledBy: userId,
    cancelledByRole: role,
    cancelReason: (cancelReason ?? "").trim() || null,
  });
}

/** @deprecated Départ : enregistrer via tripInstance / affectation. Aucune écriture véhicule. */
export async function confirmDeparture(
  _companyId: string,
  _vehicleId: string,
  _destinationCity: string,
  _userId: string,
  _role: string
): Promise<void> {
  return;
}

/** @deprecated Arrivée : enregistrer via tripInstance / affectation. Aucune écriture véhicule. */
export async function confirmArrival(
  _companyId: string,
  _vehicleId: string,
  _userId: string,
  _role: string
): Promise<void> {
  return;
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
  const st = String((v as { statusVehicule?: string }).statusVehicule ?? "disponible").toLowerCase();
  if (st !== "disponible" && st !== "affecte") {
    throw new Error("Véhicule doit être disponible ou affecté (billetterie) pour confirmer le départ.");
  }
  const now = Timestamp.now();
  await logVehicleWorkflowEvent({
    companyId,
    vehicleId: aff.vehicleId,
    statusVehicule: "en_transit",
    sourceAgencyId: agencyId,
    changedBy: userId,
    role,
    context: "confirm_departure_affectation",
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
  try {
    await syncCourierWithVehicleDeparture(companyId, agencyId, aff);
  } catch (_) { /* optional: keep transport flow resilient if courier sync fails */ }
}

/** Phase 1 Affectation: confirm arrival (Chef Agence destination). Affectation DEPART_CONFIRME → vehicle GARAGE, affectation ARRIVE. */
export async function confirmArrivalAffectation(
  companyId: string,
  agencyId: string,
  affectationId: string,
  agencyCity: string,
  userId: string,
  role: string,
  destinationAgencyId?: string
): Promise<void> {
  const aff = await getAffectation(companyId, agencyId, affectationId);
  if (!aff) throw new Error("Affectation introuvable.");
  if (aff.status !== AFFECTATION_STATUS.DEPART_CONFIRME) {
    throw new Error("Seule une affectation au statut DEPART_CONFIRME peut être confirmée à l'arrivée.");
  }
  const v = await getVehicle(companyId, aff.vehicleId);
  if (!v) throw new Error("Véhicule introuvable.");
  const st = String((v as { statusVehicule?: string }).statusVehicule ?? "").toLowerCase();
  const dest = normalizeCity(String(v.destinationCity ?? ""));
  const cityMatch = dest === normalizeCity(agencyCity ?? "");
  if (st !== "en_transit" || !cityMatch) {
    throw new Error("Véhicule doit être en transit et la destination doit être la ville de cette agence.");
  }
  const now = Timestamp.now();
  await logVehicleWorkflowEvent({
    companyId,
    vehicleId: aff.vehicleId,
    statusVehicule: "disponible",
    sourceAgencyId: agencyId,
    destinationAgencyId: destinationAgencyId ?? null,
    changedBy: userId,
    role,
    context: "confirm_arrival_affectation",
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
  try {
    await syncCourierWithVehicleArrival(companyId, agencyId, destinationAgencyId, aff);
  } catch (_) { /* optional: keep transport flow resilient if courier sync fails */ }
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
  if (!replacement) throw new Error("Véhicule de remplacement introuvable.");

  const replacementTech = (replacement.technicalStatus ?? TECHNICAL_STATUS.NORMAL) as TechnicalStatus;
  const repSt = String((replacement as { statusVehicule?: string }).statusVehicule ?? "disponible").toLowerCase();
  if (repSt !== "disponible" || replacementTech !== TECHNICAL_STATUS.NORMAL) {
    throw new Error("Le vehicule de remplacement doit etre disponible et NORMAL.");
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
  let fleetStatus: VehicleFleetStatus = VEHICLE_FLEET_STATUS.DISPONIBLE;
  if (technicalStatus !== TECHNICAL_STATUS.NORMAL) fleetStatus = VEHICLE_FLEET_STATUS.MAINTENANCE;
  else if (nextOperational === OPERATIONAL_STATUS.EN_TRANSIT) fleetStatus = VEHICLE_FLEET_STATUS.EN_TRANSIT;
  const patch: Record<string, unknown> = {
    technicalStatus,
    canonicalStatus: canonicalStatusFromStates(technicalStatus, nextOperational),
    status: legacyStatus,
    fleetStatus,
    ...(technicalStatus !== TECHNICAL_STATUS.NORMAL ? { destinationCity: null, statusVehicule: "en_maintenance" } : {}),
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  };
  await updateDoc(vehicleRef(companyId, vehicleId), patch);
}

export async function createVehicle(
  companyId: string,
  data: Omit<VehicleDoc, "createdAt" | "updatedAt">,
  meta?: { createdBy?: string; createdByRole?: string; sourceModule?: string }
): Promise<string> {
  if (!data.insuranceExpiryDate || !data.inspectionExpiryDate || !data.vignetteExpiryDate) {
    throw new Error("Les dates d'expiration assurance, contrôle technique et vignette sont obligatoires.");
  }
  const incomingFleetRaw = (data as { fleetStatus?: string }).fleetStatus;
  const busNumber = normalizeBusNumber(String((data as any).busNumber ?? (data as any).fleetNumber ?? ""));
  if (!busNumber) {
    throw new Error("Le numero bus est obligatoire (001 a 999).");
  }
  await assertBusNumberAvailable(companyId, busNumber);
  const ref = doc(vehiclesRef(companyId));
  const now = Timestamp.now();
  const currentCityNorm = normalizeCity(String(data.currentCity ?? ""));
  const destRaw = data.destinationCity;
  const destinationNorm =
    destRaw === undefined
      ? undefined
      : destRaw === null || String(destRaw).trim() === ""
        ? null
        : normalizeCity(String(destRaw));

  let legacyStatus = data.status ?? VEHICLE_STATUS.GARAGE;
  let technicalStatus: TechnicalStatus = TECHNICAL_STATUS.NORMAL;
  let operationalStatus: OperationalStatus = OPERATIONAL_STATUS.GARAGE;
  let fleetStatus: VehicleFleetStatus;

  if (incomingFleetRaw != null && String(incomingFleetRaw).trim() !== "") {
    const fs = assertValidFleetStatus(String(incomingFleetRaw));
    const leg = fleetStatusToLegacyFirestoreFields(fs);
    legacyStatus = leg.status;
    technicalStatus = leg.technicalStatus;
    operationalStatus = leg.operationalStatus;
    fleetStatus = leg.fleetStatus;
  } else {
    if (legacyStatus === VEHICLE_STATUS.EN_MAINTENANCE) technicalStatus = TECHNICAL_STATUS.MAINTENANCE;
    else if (legacyStatus === VEHICLE_STATUS.ACCIDENTE) technicalStatus = TECHNICAL_STATUS.ACCIDENTE;
    else if (legacyStatus === VEHICLE_STATUS.HORS_SERVICE) technicalStatus = TECHNICAL_STATUS.HORS_SERVICE;
    else if (legacyStatus === VEHICLE_STATUS.EN_TRANSIT) operationalStatus = OPERATIONAL_STATUS.EN_TRANSIT;
    else if (legacyStatus === VEHICLE_STATUS.EN_SERVICE) operationalStatus = OPERATIONAL_STATUS.AFFECTE;
    fleetStatus = inferFleetStatus({
      status: legacyStatus,
      technicalStatus,
      operationalStatus,
      currentCity: currentCityNorm,
      destinationCity: destinationNorm,
    } as Record<string, unknown>);
  }

  const plateStored = (data.plateNumber ?? "").trim();
  const modelLabel = await ensureVehicleModel(companyId, data.model ?? "", {
    createdBy: meta?.createdBy,
    createdByRole: meta?.createdByRole,
  });
  const plateNormalized = normalizePlate(data.plateNumber ?? "");
  const payload = {
    ...data,
    currentCity: currentCityNorm,
    ...(destinationNorm !== undefined ? { destinationCity: destinationNorm } : {}),
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
    fleetStatus,
    statusVehicule:
      technicalStatus !== TECHNICAL_STATUS.NORMAL
        ? "en_maintenance"
        : operationalStatus === OPERATIONAL_STATUS.EN_TRANSIT
          ? "en_transit"
          : operationalStatus === OPERATIONAL_STATUS.AFFECTE
            ? "affecte"
            : "disponible",
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
  const mergedForFleet: Record<string, unknown> = { ...(v as unknown as Record<string, unknown>), ...updates };
  updates.fleetStatus = inferFleetStatus(mergedForFleet);
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
    const curNorm = normalizeCity(String((vehicle as any).currentCity ?? ""));
    if (curNorm !== String((vehicle as any).currentCity ?? "")) {
      patch.currentCity = curNorm;
    }
    const dc = (vehicle as any).destinationCity;
    if (dc !== undefined && dc !== null && String(dc).trim() !== "") {
      const dn = normalizeCity(String(dc));
      if (dn !== String(dc)) {
        patch.destinationCity = dn;
      }
    }
    const mergedFleetInput = { ...(vehicle as unknown as Record<string, unknown>), ...patch };
    const inferredFs = inferFleetStatus(mergedFleetInput);
    if (String((vehicle as any).fleetStatus ?? "") !== inferredFs) {
      patch.fleetStatus = inferredFs;
    }
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

export type VehiclesPhase1MigrationResult = {
  scanned: number;
  updated: number;
  skipped: number;
  errors: string[];
};

/**
 * Migration one-shot : villes normalisées (minuscule, sans espace), fleetStatus recalculé,
 * suppression des champs legacy villeActuelle / ville_actuelle s’ils existent.
 * Parcourt la collection par pages (orderBy documentId).
 */
export async function migrateVehiclesPhase1Normalization(companyId: string): Promise<VehiclesPhase1MigrationResult> {
  const ref = vehiclesRef(companyId);
  const PAGE = 450;
  let lastDoc: DocumentSnapshot | null = null;
  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];

  while (true) {
    let q = query(ref, orderBy(documentId()), limit(PAGE));
    if (lastDoc) {
      q = query(ref, orderBy(documentId()), startAfter(lastDoc), limit(PAGE));
    }
    const snap = await getDocs(q);
    if (snap.empty) break;

    let batch = writeBatch(db);
    let batchOps = 0;

    for (const d of snap.docs) {
      scanned += 1;
      try {
        const raw = d.data() as Record<string, unknown>;
        const cityFrom = String(raw.currentCity ?? raw.villeActuelle ?? raw.ville_actuelle ?? "").trim();
        const currentCity = normalizeCity(cityFrom);

        let destNorm: string | null | undefined = undefined;
        if (raw.destinationCity !== undefined) {
          if (raw.destinationCity === null || String(raw.destinationCity).trim() === "") {
            destNorm = null;
          } else {
            destNorm = normalizeCity(String(raw.destinationCity));
          }
        }

        const merged: Record<string, unknown> = {
          ...raw,
          currentCity,
          ...(raw.destinationCity !== undefined ? { destinationCity: destNorm } : {}),
        };
        const fleetStatus = inferFleetStatus(merged);

        const patch: Record<string, unknown> = {};
        if (String(raw.currentCity ?? "") !== currentCity) {
          patch.currentCity = currentCity;
        }
        if (raw.destinationCity !== undefined) {
          const prev = raw.destinationCity;
          const prevNorm =
            prev === null || String(prev).trim() === "" ? null : normalizeCity(String(prev));
          if (prevNorm !== destNorm) {
            patch.destinationCity = destNorm ?? null;
          }
        }
        if (String(raw.fleetStatus ?? "") !== fleetStatus) {
          patch.fleetStatus = fleetStatus;
        }
        if (Object.prototype.hasOwnProperty.call(raw, "villeActuelle")) {
          patch.villeActuelle = deleteField();
        }
        if (Object.prototype.hasOwnProperty.call(raw, "ville_actuelle")) {
          patch.ville_actuelle = deleteField();
        }

        if (Object.keys(patch).length === 0) {
          skipped += 1;
        } else {
          patch.updatedAt = serverTimestamp();
          batch.update(vehicleRef(companyId, d.id), patch);
          batchOps += 1;
          updated += 1;
          if (batchOps >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            batchOps = 0;
          }
        }
      } catch (e) {
        errors.push(`${d.id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    if (batchOps > 0) {
      await batch.commit();
    }

    lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    if (snap.docs.length < PAGE) {
      break;
    }
  }

  return { scanned, updated, skipped, errors };
}

export type VehiclesPhase1VerificationResult = {
  scanned: number;
  clean: boolean;
  cityNotNormalizedIds: string[];
  invalidFleetStatus: Array<{ id: string; fleetStatus: string }>;
  legacyCityFieldIds: string[];
  destinationNotNormalizedIds: string[];
};

/**
 * Contrôle post-migration : villes stockées normalisées, fleetStatus valide, pas de clés villeActuelle / ville_actuelle.
 * Lecture brute Firestore (pas via normalizeVehicleDoc).
 */
export async function verifyVehiclesPhase1Normalization(companyId: string): Promise<VehiclesPhase1VerificationResult> {
  const ref = vehiclesRef(companyId);
  const PAGE = 450;
  let lastDoc: DocumentSnapshot | null = null;
  let scanned = 0;
  const cityNotNormalizedIds: string[] = [];
  const invalidFleetStatus: Array<{ id: string; fleetStatus: string }> = [];
  const legacyCityFieldIds: string[] = [];
  const destinationNotNormalizedIds: string[] = [];

  while (true) {
    let q = query(ref, orderBy(documentId()), limit(PAGE));
    if (lastDoc) {
      q = query(ref, orderBy(documentId()), startAfter(lastDoc), limit(PAGE));
    }
    const snap = await getDocs(q);
    if (snap.empty) break;

    for (const d of snap.docs) {
      scanned += 1;
      const raw = d.data() as Record<string, unknown>;
      const cc = raw.currentCity;
      if (cc != null && String(cc).trim() !== "" && String(cc) !== normalizeCity(String(cc))) {
        cityNotNormalizedIds.push(d.id);
      }
      const fs = raw.fleetStatus;
      if (fs != null && String(fs).trim() !== "" && !isValidFleetStatus(String(fs))) {
        invalidFleetStatus.push({ id: d.id, fleetStatus: String(fs) });
      }
      if (
        Object.prototype.hasOwnProperty.call(raw, "villeActuelle") ||
        Object.prototype.hasOwnProperty.call(raw, "ville_actuelle")
      ) {
        legacyCityFieldIds.push(d.id);
      }
      const dest = raw.destinationCity;
      if (dest != null && String(dest).trim() !== "" && String(dest) !== normalizeCity(String(dest))) {
        destinationNotNormalizedIds.push(d.id);
      }
    }

    lastDoc = snap.docs[snap.docs.length - 1] ?? null;
    if (snap.docs.length < PAGE) break;
  }

  const clean =
    cityNotNormalizedIds.length === 0 &&
    invalidFleetStatus.length === 0 &&
    legacyCityFieldIds.length === 0 &&
    destinationNotNormalizedIds.length === 0;

  return {
    scanned,
    clean,
    cityNotNormalizedIds,
    invalidFleetStatus,
    legacyCityFieldIds,
    destinationNotNormalizedIds,
  };
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
  const fleetStatus = inferFleetStatus(v as unknown as Record<string, unknown>);
  await updateDoc(vehicleRef(companyId, vehicleId), {
    isArchived: true,
    archivedAt: serverTimestamp(),
    archivedBy: userId,
    fleetStatus,
    statusHistory: arrayUnion(entry),
    updatedAt: serverTimestamp(),
  });
}
