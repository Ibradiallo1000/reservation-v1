/**
 * Trip instance CRUD and queries.
 * Lazy creation: getOrCreateTripInstanceForSlot creates when needed.
 */
import {
  collection,
  documentId,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  limit,
  orderBy,
  serverTimestamp,
  increment,
  Timestamp,
  runTransaction,
  startAfter,
  type DocumentReference,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type Transaction,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { runFirestoreTransactionWithRetry } from "@/shared/firebase/runTransactionWithRetry";
import {
  applyVehicleSyncFromTripInstanceInTransaction,
  isVehicleCoherentWithTripInstance,
} from "@/modules/compagnie/fleet/syncVehicleWithTripInstance";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import {
  onTripInstanceStarted,
  onTripInstanceArrivedAuto,
} from "@/modules/logistics/services/tripInstanceShipmentSync";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import {
  TRIP_INSTANCE_COLLECTION,
  TRIP_INSTANCE_STATUT_METIER,
  TRIP_INSTANCE_STATUS,
  tripInstanceArrival,
  tripInstanceDeparture,
  tripInstanceSeatCapacity,
  tripInstanceRemainingFromDoc,
  tripInstanceTime,
  type JourneyForSegments,
  type TripInstanceDoc,
  type TripInstanceDocWithId,
  type TripInstanceStatutMetier,
  type TripInstanceStatus,
} from "./tripInstanceTypes";
import {
  buildSegmentsFromStops,
  resolveJourneySegmentIndices,
  applySegmentDelta,
  applySegmentDeltaCapped,
  type TripInstanceSegment,
} from "./tripInstanceSegments";

export type { JourneyForSegments } from "./tripInstanceTypes";

function tripInstancesRef(companyId: string) {
  return collection(db, "companies", companyId, TRIP_INSTANCE_COLLECTION);
}

export function tripInstanceRef(companyId: string, tripInstanceId: string) {
  return doc(db, "companies", companyId, TRIP_INSTANCE_COLLECTION, tripInstanceId);
}

/** Merge two query result lists by id (canonical first), sort by tripInstanceTime, cap length. */
function mergeTripInstancesById(
  canonicalFirst: TripInstanceDocWithId[],
  legacySecond: TripInstanceDocWithId[],
  limitCount: number
): TripInstanceDocWithId[] {
  const map = new Map<string, TripInstanceDocWithId>();
  for (const x of canonicalFirst) map.set(x.id, x);
  for (const x of legacySecond) {
    if (!map.has(x.id)) map.set(x.id, x);
  }
  const merged = [...map.values()];
  merged.sort((a, b) => tripInstanceTime(a).localeCompare(tripInstanceTime(b)));
  return merged.slice(0, limitCount);
}

function normalizeTripInstanceQueryDoc(d: QueryDocumentSnapshot<DocumentData>): TripInstanceDocWithId {
  const raw = d.data() as TripInstanceDoc;
  return {
    id: d.id,
    ...(raw as any),
    departure: tripInstanceDeparture(raw),
    arrival: tripInstanceArrival(raw),
    time: tripInstanceTime(raw),
    remainingSeats: tripInstanceRemainingFromDoc(raw),
  } as TripInstanceDocWithId;
}

export interface CreateTripInstanceParams {
  routeId?: string | null;
  agencyId: string;
  /** All agencies involved on this trip (e.g. [Bamako, Sikasso, Bouaké]). Optional; when absent, agencyId is used as single agency. */
  agenciesInvolved?: string[];
  destinationAgencyId?: string | null;
  departureCity: string;
  arrivalCity: string;
  date: string;
  departureTime: string;
  seatCapacity?: number;
  /** Bus seat capacity for fill-rate (passengerCount / capacitySeats). Falls back to seatCapacity if not set. */
  capacitySeats?: number;
  /** Parcel capacity for fill-rate (parcelCount / capacityParcels). */
  capacityParcels?: number;
  price?: number | null;
  weeklyTripId?: string | null;
  vehicleId?: string | null;
  /** User id creating the instance (operational audit). */
  createdBy?: string;
}

/** Build deterministic trip instance id from weeklyTripId + date + time (avoids duplicates on lazy creation). */
export function buildTripInstanceId(weeklyTripId: string, date: string, departureTime: string): string {
  const safeTime = (departureTime || "").replace(":", "-");
  return `${weeklyTripId}_${date}_${safeTime}`;
}

export type CreateTripInstanceResult = { id: string; created: boolean };

/** Create a single trip instance. If optionalId is provided, idempotent (skip if doc exists). */
export async function createTripInstance(
  companyId: string,
  params: CreateTripInstanceParams,
  optionalId?: string
): Promise<CreateTripInstanceResult> {
  const ref = optionalId
    ? doc(tripInstancesRef(companyId), optionalId)
    : doc(tripInstancesRef(companyId));
  const now = serverTimestamp();
  const dep = (params.departureCity || "").trim();
  const arr = (params.arrivalCity || "").trim();
  const departureDate = Timestamp.fromDate(new Date(`${params.date}T00:00:00.000Z`));
  const capacitySeats = params.capacitySeats ?? params.seatCapacity ?? 0;
  const cap = Math.max(0, Number(capacitySeats) || 0);
  const timeStr = params.departureTime;

  let stopCities: string[] = [dep, arr];
  let stopsSnapshot: Array<{ stopId: string; order: number; agencyId: string | null }> | undefined;
  if (params.routeId) {
    try {
      const routeStops = await getRouteStops(companyId, params.routeId);
      if (routeStops.length >= 2) {
        const ordered = [...routeStops].sort((a, b) => a.order - b.order);
        const cities = ordered
          .map((s) => String(s.city ?? "").trim())
          .filter((c) => c.length > 0);
        if (cities.length >= 2) stopCities = cities;
        stopsSnapshot = ordered.map((s) => ({
          stopId: s.id,
          order: s.order,
          agencyId: null,
        }));
      }
    } catch {
      /* garder [dep, arr] */
    }
  }
  const segments: TripInstanceSegment[] =
    stopCities.length >= 2 ? buildSegmentsFromStops(stopCities, cap) : [];

  const data: TripInstanceDoc & {
    createdAt?: unknown;
    updatedAt?: unknown;
    price?: number | null;
    departureCity?: string;
    arrivalCity?: string;
    seatCapacity?: number;
    reservedSeats?: number;
  } = {
    companyId,
    agencyId: params.agencyId,
    destinationAgencyId: params.destinationAgencyId ?? null,
    ...(params.agenciesInvolved != null && params.agenciesInvolved.length > 0 && { agenciesInvolved: params.agenciesInvolved }),
    capacity: cap,
    departure: dep,
    arrival: arr,
    time: timeStr,
    remainingSeats: segments.length > 0 ? Math.min(...segments.map((s) => s.remaining)) : cap,
    routeDeparture: dep,
    routeArrival: arr,
    weeklyTripId: params.weeklyTripId ?? null,
    vehicleId: params.vehicleId ?? null,
    date: params.date,
    departureDate,
    departureTime: timeStr,
    status: TRIP_INSTANCE_STATUS.SCHEDULED,
    statutMetier: TRIP_INSTANCE_STATUT_METIER.PLANIFIE,
    passengerCount: 0,
    parcelCount: 0,
    ...(cap > 0 && { capacitySeats: cap }),
    ...(params.capacityParcels != null && params.capacityParcels > 0 && { capacityParcels: params.capacityParcels }),
    createdAt: now,
    createdBy: params.createdBy ?? "",
    updatedAt: now,
    departureCity: dep,
    arrivalCity: arr,
    seatCapacity: cap,
    reservedSeats: 0,
    routeId: params.routeId ?? null,
    price: params.price ?? null,
    stops: stopCities,
    segments,
    ...(stopsSnapshot && stopsSnapshot.length >= 2 ? { stopsSnapshot } : {}),
  };
  if (optionalId) {
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, data);
      return true;
    });
    return { id: optionalId, created };
  }
  await setDoc(ref, data);
  return { id: ref.id, created: true };
}

/** Find trip instance by agency + date + time + route (cities). */
export async function findTripInstanceBySlot(
  companyId: string,
  agencyId: string,
  date: string,
  departureTime: string,
  departureCity: string,
  arrivalCity: string
): Promise<TripInstanceDocWithId | null> {
  const dep = (departureCity || "").trim();
  const arr = (arrivalCity || "").trim();
  if (!dep || !arr || !date || !departureTime || !agencyId) return null;
  const ref = tripInstancesRef(companyId);
  const qCanon = query(
    ref,
    where("agencyId", "==", agencyId),
    where("date", "==", date),
    where("departureTime", "==", departureTime),
    where("departureCity", "==", dep),
    where("arrivalCity", "==", arr),
    limit(1)
  );
  const qLegacy = query(
    ref,
    where("agencyId", "==", agencyId),
    where("date", "==", date),
    where("departureTime", "==", departureTime),
    where("departureCity", "==", dep),
    where("arrivalCity", "==", arr),
    limit(1)
  );
  try {
    const snapCanon = await getDocs(qCanon);
    if (!snapCanon.empty) {
      const d = snapCanon.docs[0];
      return { id: d.id, ...d.data() } as TripInstanceDocWithId;
    }
  } catch (e) {
    console.warn(
      "[tripInstanceService] findTripInstanceBySlot canonical query failed (index or data); using legacy only",
      e
    );
  }
  const snapLegacy = await getDocs(qLegacy);
  if (snapLegacy.empty) return null;
  const d = snapLegacy.docs[0];
  return { id: d.id, ...d.data() } as TripInstanceDocWithId;
}

/** Get or create a trip instance for a slot (lazy creation). Uses deterministic id when weeklyTripId is set to avoid duplicates. */
export async function getOrCreateTripInstanceForSlot(
  companyId: string,
  params: CreateTripInstanceParams
): Promise<TripInstanceDocWithId> {
  const deterministicId =
    params.weeklyTripId && params.date && params.departureTime
      ? buildTripInstanceId(params.weeklyTripId, params.date, params.departureTime)
      : null;
  if (deterministicId) {
    const ref = tripInstanceRef(companyId, deterministicId);
    const snap = await getDoc(ref);
    if (snap.exists()) return { id: snap.id, ...snap.data() } as TripInstanceDocWithId;
    await createTripInstance(companyId, params, deterministicId);
    const after = await getDoc(ref);
    return { id: after.id, ...after.data() } as TripInstanceDocWithId;
  }
  const existing = await findTripInstanceBySlot(
    companyId,
    params.agencyId,
    params.date,
    params.departureTime,
    params.departureCity,
    params.arrivalCity
  );
  if (existing) return existing;
  const { id } = await createTripInstance(companyId, params);
  const snap = await getDoc(tripInstanceRef(companyId, id));
  return { id: snap.id, ...snap.data() } as TripInstanceDocWithId;
}

/**
 * List trip instances by route (cities) and date.
 * Fusionne `departureCity`/`arrivalCity` et `departure`/`arrival` (anciennes fiches).
 */
export async function listTripInstancesByRouteAndDate(
  companyId: string,
  departureCity: string,
  arrivalCity: string,
  date: string,
  options?: { limitCount?: number }
): Promise<TripInstanceDocWithId[]> {
  const dep = (departureCity || "").trim();
  const arr = (arrivalCity || "").trim();
  if (!dep || !arr || !date) return [];
  const limitCount = options?.limitCount ?? 100;
  const perQueryLimit = Math.min(250, Math.max(limitCount, limitCount * 2));
  const ref = tripInstancesRef(companyId);
  const qCanon = query(
    ref,
    where("departureCity", "==", dep),
    where("arrivalCity", "==", arr),
    where("date", "==", date),
    orderBy("departureTime", "asc"),
    limit(perQueryLimit)
  );
  const qLegacy = query(
    ref,
    where("departure", "==", dep),
    where("arrival", "==", arr),
    where("date", "==", date),
    orderBy("time", "asc"),
    limit(perQueryLimit)
  );
  let canon: TripInstanceDocWithId[] = [];
  try {
    const snapCanon = await getDocs(qCanon);
    canon = snapCanon.docs.map(normalizeTripInstanceQueryDoc);
  } catch (e) {
    console.warn(
      "[tripInstanceService] listTripInstancesByRouteAndDate canonical query failed; legacy only",
      e
    );
  }
  const snapLegacy = await getDocs(qLegacy);
  const legacy = snapLegacy.docs.map(normalizeTripInstanceQueryDoc);
  return mergeTripInstancesById(canon, legacy, limitCount);
}

/**
 * Trajets sur une OD et une plage de dates.
 * Fusionne requête canonique (`departureCity` / `arrivalCity`) et requête legacy (`departure` / `arrival`) :
 * certaines fiches n’ont qu’un des deux jeux de champs — le guichet listait alors « Aucun horaire ».
 */
export async function listTripInstancesByRouteAndDateRange(
  companyId: string,
  departureCity: string,
  arrivalCity: string,
  dateFrom: string,
  dateTo: string,
  options?: { limitCount?: number; startAfterCursor?: { date: string; time: string; id: string } }
): Promise<TripInstanceDocWithId[]> {
  const dep = (departureCity || "").trim();
  const arr = (arrivalCity || "").trim();
  if (!dep || !arr || !dateFrom || !dateTo) return [];
  const limitCount = Math.max(1, options?.limitCount ?? 50);
  const qBase = query(
    tripInstancesRef(companyId),
    where("departureCity", "==", dep),
    where("arrivalCity", "==", arr),
    where("date", ">=", dateFrom),
    where("date", "<=", dateTo),
    orderBy("date", "asc"),
    orderBy("departureTime", "asc"),
    orderBy(documentId(), "asc")
  );
  const q = options?.startAfterCursor
    ? query(
        qBase,
        startAfter(
          options.startAfterCursor.date,
          options.startAfterCursor.time,
          options.startAfterCursor.id
        ),
        limit(limitCount)
      )
    : query(qBase, limit(limitCount));
  const snap = await getDocs(q);
  const primary = snap.docs.map(normalizeTripInstanceQueryDoc);

  if (options?.startAfterCursor) {
    return primary;
  }

  const qLegacy = query(
    tripInstancesRef(companyId),
    where("departure", "==", dep),
    where("arrival", "==", arr),
    where("date", ">=", dateFrom),
    where("date", "<=", dateTo),
    orderBy("date", "asc"),
    orderBy("time", "asc"),
    limit(limitCount)
  );
  let legacy: TripInstanceDocWithId[] = [];
  try {
    const snapL = await getDocs(qLegacy);
    legacy = snapL.docs.map(normalizeTripInstanceQueryDoc);
  } catch (e) {
    console.warn("[tripInstanceService] listTripInstancesByRouteAndDateRange legacy OD query failed", e);
  }

  return mergeTripInstancesById(primary, legacy, limitCount);
}

/** List trip instances by date range (for capacity / fill rate). Requires index: tripInstances (date ASC). */
export async function listTripInstancesByDateRange(
  companyId: string,
  dateFrom: string,
  dateTo: string,
  options?: { limitCount?: number }
): Promise<TripInstanceDocWithId[]> {
  if (!dateFrom || !dateTo) return [];
  const limitCount = options?.limitCount ?? 2000;
  const q = query(
    tripInstancesRef(companyId),
    where("date", ">=", dateFrom),
    where("date", "<=", dateTo),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripInstanceDocWithId));
}

/** Nombre de bus "en circulation" aujourd'hui : status in_progress = boarding ou departed. Date en Africa/Bamako. */
export async function getBusesInProgressCountToday(companyId: string): Promise<number> {
  const today = getTodayBamako();
  const instances = await listTripInstancesByDateRange(companyId, today, today, { limitCount: 500 });
  const statusInProgress = ["boarding", "departed"];
  return instances.filter((ti) => statusInProgress.includes((ti.status ?? "").toLowerCase())).length;
}

/**
 * List trip instances by routeId and date (escale). Merges canonical orderBy(time) and legacy orderBy(departureTime).
 */
export async function listTripInstancesByRouteIdAndDate(
  companyId: string,
  routeId: string,
  date: string,
  options?: { limitCount?: number }
): Promise<TripInstanceDocWithId[]> {
  if (!routeId || !date) return [];
  const limitCount = options?.limitCount ?? 100;
  const perQueryLimit = Math.min(250, Math.max(limitCount, limitCount * 2));
  const ref = tripInstancesRef(companyId);
  const qCanon = query(
    ref,
    where("routeId", "==", routeId),
    where("date", "==", date),
    orderBy("time", "asc"),
    limit(perQueryLimit)
  );
  const qLegacy = query(
    ref,
    where("routeId", "==", routeId),
    where("date", "==", date),
    orderBy("departureTime", "asc"),
    limit(perQueryLimit)
  );
  let canon: TripInstanceDocWithId[] = [];
  try {
    const snapCanon = await getDocs(qCanon);
    canon = snapCanon.docs.map((d) => ({ id: d.id, ...d.data() } as TripInstanceDocWithId));
  } catch (e) {
    console.warn(
      "[tripInstanceService] listTripInstancesByRouteIdAndDate canonical query failed; legacy only",
      e
    );
  }
  const snapLegacy = await getDocs(qLegacy);
  const legacy = snapLegacy.docs.map((d) => ({ id: d.id, ...d.data() } as TripInstanceDocWithId));
  return mergeTripInstancesById(canon, legacy, limitCount);
}

/** Update trip instance status. */
export async function updateTripInstanceStatus(
  companyId: string,
  tripInstanceId: string,
  status: TripInstanceStatus
): Promise<void> {
  const statutMetierByLegacy: Partial<Record<TripInstanceStatus, TripInstanceStatutMetier>> = {
    scheduled: TRIP_INSTANCE_STATUT_METIER.PLANIFIE,
    boarding: TRIP_INSTANCE_STATUT_METIER.EMBARQUEMENT_EN_COURS,
    departed: TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT,
    arrived: TRIP_INSTANCE_STATUT_METIER.TERMINE,
  };
  const sm = statutMetierByLegacy[status];
  if (sm) {
    const extraTripExecutionFields: Record<string, unknown> = {};
    if (status === TRIP_INSTANCE_STATUS.DEPARTED) {
      extraTripExecutionFields.transitAt = serverTimestamp();
    }
    if (status === TRIP_INSTANCE_STATUS.ARRIVED) {
      extraTripExecutionFields.arrivedAt = serverTimestamp();
    }
    await updateTripInstanceStatutMetier(companyId, tripInstanceId, sm, {
      extraTripInstanceFields: { status },
      ...(Object.keys(extraTripExecutionFields).length > 0
        ? { extraTripExecutionFields }
        : {}),
    });
  } else {
    await updateDoc(tripInstanceRef(companyId, tripInstanceId), {
      status,
      updatedAt: serverTimestamp(),
    });
  }

  if (status === TRIP_INSTANCE_STATUS.DEPARTED) {
    void onTripInstanceStarted(companyId, tripInstanceId).catch((err) => {
      console.error("[tripInstanceService] onTripInstanceStarted failed:", err);
    });
  }

  if (status === TRIP_INSTANCE_STATUS.ARRIVED) {
    void onTripInstanceArrivedAuto(companyId, tripInstanceId).catch((err) => {
      console.error("[tripInstanceService] onTripInstanceArrivedAuto failed:", err);
    });
  }
}

export async function updateTripInstanceStatutMetier(
  companyId: string,
  tripInstanceId: string,
  statutMetier: TripInstanceStatutMetier,
  options?: {
    isReturnToOrigin?: boolean;
    tripExecutionStatusOverride?: "boarding" | "validation_agence_requise" | "departed" | "transit" | "arrived" | "finished" | "disrupted";
    extraTripInstanceFields?: Record<string, unknown>;
    extraTripExecutionFields?: Record<string, unknown>;
  }
): Promise<void> {
  const ref = tripInstanceRef(companyId, tripInstanceId);
  const tripExecutionDocRef = doc(db, "companies", companyId, "tripExecutions", tripInstanceId);
  const tripExecutionStatusFromMetier = (s: TripInstanceStatutMetier) => {
    if (s === TRIP_INSTANCE_STATUT_METIER.EMBARQUEMENT_EN_COURS) return "boarding";
    if (s === TRIP_INSTANCE_STATUT_METIER.VALIDATION_AGENCE_REQUISE) return "validation_agence_requise";
    if (s === TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT) return "transit";
    if (s === TRIP_INSTANCE_STATUT_METIER.TERMINE) return "arrived";
    return null;
  };

  await runFirestoreTransactionWithRetry(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Trajet introuvable.");
    const data = snap.data() as {
      statutMetier?: string;
      vehicleId?: string | null;
      destinationAgencyId?: string | null;
      agencyId?: string | null;
      isReturnToOrigin?: boolean | null;
      retourOrigine?: boolean | null;
    };
    const currentRaw = String(data.statutMetier ?? "").trim();
    const effectiveCurrentMetier = (currentRaw || TRIP_INSTANCE_STATUT_METIER.PLANIFIE) as TripInstanceStatutMetier;

    const allowed: Record<TripInstanceStatutMetier, TripInstanceStatutMetier[]> = {
      planifie: ["planifie", "embarquement_en_cours"],
      embarquement_en_cours: ["embarquement_en_cours", "validation_agence_requise"],
      embarquement_termine: ["embarquement_termine"],
      validation_agence_requise: ["validation_agence_requise", "en_transit"],
      en_transit: ["en_transit", "termine"],
      retour_origine: ["retour_origine"],
      termine: ["termine"],
    };

    if (!allowed[effectiveCurrentMetier]?.includes(statutMetier)) {
      throw new Error(`Transition statutMetier interdite: ${effectiveCurrentMetier} -> ${statutMetier}`);
    }

    const vehicleId = String(data.vehicleId ?? "").trim();
    const destinationAgencyId = String(data.destinationAgencyId ?? "").trim() || null;
    const originAgencyId = String(data.agencyId ?? "").trim() || null;

    const tripForCoherenceCheck = {
      statutMetier: effectiveCurrentMetier,
      destinationAgencyId,
      agencyId: originAgencyId ?? undefined,
      isReturnToOrigin: data.isReturnToOrigin,
      retourOrigine: data.retourOrigine,
    };

    if (vehicleId) {
      const vRef = doc(db, "companies", companyId, "vehicles", vehicleId);
      const vSnap = await tx.get(vRef);
      if (vSnap.exists()) {
        const vd = vSnap.data() as {
          statusVehicule?: string;
          currentAgencyId?: string | null;
          destinationAgencyId?: string | null;
        };
        if (!isVehicleCoherentWithTripInstance(vd, tripForCoherenceCheck)) {
          throw new Error("Incohérence détectée: état véhicule non aligné avec tripInstance.statutMetier.");
        }
      }
    }

    let persistReturnToOrigin: boolean;
    if (statutMetier === TRIP_INSTANCE_STATUT_METIER.TERMINE) {
      persistReturnToOrigin = false;
    } else if (options?.isReturnToOrigin === true) {
      persistReturnToOrigin = true;
    } else if (options?.isReturnToOrigin === false) {
      persistReturnToOrigin = false;
    } else {
      persistReturnToOrigin = !!(data.isReturnToOrigin || data.retourOrigine);
    }

    tx.update(ref, {
      statutMetier,
      isReturnToOrigin: persistReturnToOrigin,
      retourOrigine: persistReturnToOrigin,
      updatedAt: serverTimestamp(),
      ...(options?.extraTripInstanceFields ?? {}),
    });

    if (vehicleId) {
      const applyReturn =
        options?.isReturnToOrigin === true ||
        data.isReturnToOrigin === true ||
        data.retourOrigine === true;
      applyVehicleSyncFromTripInstanceInTransaction(
        tx,
        companyId,
        vehicleId,
        {
          statutMetier,
          destinationAgencyId,
          agencyId: originAgencyId ?? undefined,
          isReturnToOrigin: applyReturn,
          retourOrigine: applyReturn,
        },
        tripInstanceId
      );
    }

    const teStatus = options?.tripExecutionStatusOverride ?? tripExecutionStatusFromMetier(statutMetier);
    if (teStatus) {
      tx.set(
        tripExecutionDocRef,
        {
          status: teStatus,
          updatedAt: serverTimestamp(),
          ...(options?.extraTripExecutionFields ?? {}),
        },
        { merge: true }
      );
    }
  });
}

export async function confirmTripArrivalAtDestination(params: {
  companyId: string;
  tripInstanceId: string;
  destinationAgencyId: string;
  validatedBy: string;
}): Promise<void> {
  const { companyId, tripInstanceId, destinationAgencyId, validatedBy } = params;
  const ref = tripInstanceRef(companyId, tripInstanceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Trajet introuvable.");
  const data = snap.data() as { destinationAgencyId?: string | null; statutMetier?: TripInstanceStatutMetier; vehicleId?: string | null };
  if (String(data.destinationAgencyId ?? "") !== destinationAgencyId) {
    throw new Error("Validation arrivée refusée: cette agence n'est pas la destination.");
  }
  if (data.statutMetier !== TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT) {
    throw new Error("Validation arrivée refusée: le trajet n'est pas en transit.");
  }
  await updateTripInstanceStatutMetier(companyId, tripInstanceId, TRIP_INSTANCE_STATUT_METIER.TERMINE, {
    extraTripInstanceFields: {
      status: TRIP_INSTANCE_STATUS.ARRIVED,
      arrivalValidatedAt: serverTimestamp(),
      arrivalValidatedBy: validatedBy,
    },
    extraTripExecutionFields: {
      arrivedAt: serverTimestamp(),
    },
  });
  const vehicleId = String(data.vehicleId ?? "").trim();
  if (vehicleId) {
    await setDoc(
      doc(db, "companies", companyId, "fleetMovements", `${tripInstanceId}__arrival__${vehicleId}`),
      {
        vehicleId,
        statusVehicule: "disponible",
        sourceAgencyId: null,
        destinationAgencyId,
        changedBy: validatedBy,
        role: null,
        context: "trip_instance_arrival_validation",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  }
}

export async function markTripReturnToOrigin(params: {
  companyId: string;
  tripInstanceId: string;
  byUserId: string;
}): Promise<void> {
  const { companyId, tripInstanceId, byUserId } = params;
  const ref = tripInstanceRef(companyId, tripInstanceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Trajet introuvable.");
  const data = snap.data() as { statutMetier?: TripInstanceStatutMetier };
  if (data.statutMetier !== TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT) {
    throw new Error("Retour gare refusé: le trajet n'est pas en transit.");
  }
  await updateTripInstanceStatutMetier(companyId, tripInstanceId, TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT, {
    isReturnToOrigin: true,
    tripExecutionStatusOverride: "disrupted",
    extraTripInstanceFields: {
      returnedToOriginAt: serverTimestamp(),
      returnedToOriginBy: byUserId,
    },
    extraTripExecutionFields: {
      returnedToOriginAt: serverTimestamp(),
      returnedToOriginBy: byUserId,
    },
  });
}

/**
 * Réserve des places dans une transaction existante (ex. création réservation guichet).
 * Lève si capacité / segments insuffisants.
 */
export function bookSeatsOnTripInstanceInTransaction(
  tx: Transaction,
  tripRef: DocumentReference,
  tripSnap: DocumentSnapshot,
  seats: number,
  journey?: JourneyForSegments
): void {
  if (seats <= 0) return;
  if (!tripSnap.exists()) throw new Error("Trip instance not found");
  const d = tripSnap.data() as TripInstanceDoc;
  const capacity = tripInstanceSeatCapacity(d);
  const reserved = Math.max(0, Number(d.reservedSeats) || 0);
  const stops = d.stops;
  const segmentsRaw = Array.isArray(d.segments) ? (d.segments as TripInstanceSegment[]) : undefined;
  const indices =
    stops && segmentsRaw && segmentsRaw.length > 0
      ? resolveJourneySegmentIndices(stops, segmentsRaw, journey ?? {})
      : null;

  if (indices != null && segmentsRaw && segmentsRaw.length > 0) {
    const concerned = indices
      .map((i) => segmentsRaw[i])
      .filter((s): s is TripInstanceSegment => s != null);
    if (!concerned.every((s) => Math.max(0, Number(s.remaining) || 0) >= seats)) {
      throw new Error("Plus assez de places disponibles sur ce trajet");
    }
    if (capacity <= 0 && seats > 0) {
      throw new Error("Capacité du trajet non définie ou nulle");
    }
    const newSegs = applySegmentDelta(segmentsRaw, indices, -seats);
    const newRemainingSeats = Math.min(
      ...newSegs.map((s) => Math.max(0, Number(s.remaining) || 0))
    );
    tx.update(tripRef, {
      segments: newSegs,
      remainingSeats: newRemainingSeats,
      reservedSeats: reserved + seats,
      passengerCount: increment(seats),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const remaining = tripInstanceRemainingFromDoc(d);
  if (capacity > 0 && remaining < seats) {
    throw new Error("Plus assez de places disponibles sur ce trajet");
  }
  if (capacity <= 0 && seats > 0) {
    throw new Error("Capacité du trajet non définie ou nulle");
  }
  tx.update(tripRef, {
    reservedSeats: reserved + seats,
    remainingSeats: remaining - seats,
    passengerCount: increment(seats),
    updatedAt: serverTimestamp(),
  });
}

/** Libère des places dans une transaction existante (ex. annulation). */
export function releaseSeatsOnTripInstanceInTransaction(
  tx: Transaction,
  tripRef: DocumentReference,
  tripSnap: DocumentSnapshot,
  seats: number,
  journey?: JourneyForSegments
): void {
  if (seats <= 0 || !tripSnap.exists()) return;
  const d = tripSnap.data() as TripInstanceDoc;
  const capacity = tripInstanceSeatCapacity(d);
  const reserved = Math.max(0, Number(d.reservedSeats) || 0);
  const delta = Math.min(seats, reserved);
  if (delta <= 0) return;

  const stops = d.stops;
  const segmentsRaw = Array.isArray(d.segments) ? (d.segments as TripInstanceSegment[]) : undefined;
  const indices =
    stops && segmentsRaw && segmentsRaw.length > 0
      ? resolveJourneySegmentIndices(stops, segmentsRaw, journey ?? {})
      : null;

  if (indices != null && segmentsRaw && segmentsRaw.length > 0) {
    const newSegs = applySegmentDeltaCapped(segmentsRaw, indices, delta, capacity);
    const newRemainingSeats = Math.min(
      ...newSegs.map((s) => Math.max(0, Number(s.remaining) || 0))
    );
    const newReserved = reserved - delta;
    tx.update(tripRef, {
      segments: newSegs,
      remainingSeats: newRemainingSeats,
      reservedSeats: newReserved,
      passengerCount: increment(-delta),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  const remaining = tripInstanceRemainingFromDoc(d);
  const newReserved = reserved - delta;
  const newRemaining = Math.min(capacity, remaining + delta);
  tx.update(tripRef, {
    reservedSeats: newReserved,
    remainingSeats: newRemaining,
    passengerCount: increment(-delta),
    updatedAt: serverTimestamp(),
  });
}

/** Increment reservedSeats (+ segments si présents). Transaction atomique. */
export async function incrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number,
  journey?: JourneyForSegments
): Promise<void> {
  if (seats <= 0) return;
  const ref = tripInstanceRef(companyId, tripInstanceId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    bookSeatsOnTripInstanceInTransaction(tx, ref, snap, seats, journey);
  });
}

/** Decrement reservedSeats (+ segments si présents). */
export async function decrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number,
  journey?: JourneyForSegments
): Promise<void> {
  if (seats <= 0) return;
  const ref = tripInstanceRef(companyId, tripInstanceId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    releaseSeatsOnTripInstanceInTransaction(tx, ref, snap, seats, journey);
  });
}

/** Increment parcelCount (e.g. when a shipment is assigned to this trip instance). */
export async function incrementParcelCount(
  companyId: string,
  tripInstanceId: string,
  count: number = 1
): Promise<void> {
  if (count <= 0) return;
  await updateDoc(tripInstanceRef(companyId, tripInstanceId), {
    parcelCount: increment(count),
    updatedAt: serverTimestamp(),
  });
}

/** Decrement parcelCount (e.g. when a shipment is unassigned). */
export async function decrementParcelCount(
  companyId: string,
  tripInstanceId: string,
  count: number = 1
): Promise<void> {
  if (count <= 0) return;
  await updateDoc(tripInstanceRef(companyId, tripInstanceId), {
    parcelCount: increment(-count),
    updatedAt: serverTimestamp(),
  });
}

/** Assign vehicle to trip instance. */
export async function assignVehicleToTripInstance(
  companyId: string,
  tripInstanceId: string,
  vehicleId: string | null
): Promise<void> {
  await updateDoc(tripInstanceRef(companyId, tripInstanceId), {
    vehicleId: vehicleId ?? null,
    updatedAt: serverTimestamp(),
  });
}

/** Get a single trip instance by id. */
export async function getTripInstance(
  companyId: string,
  tripInstanceId: string
): Promise<TripInstanceDocWithId | null> {
  const snap = await getDoc(tripInstanceRef(companyId, tripInstanceId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as TripInstanceDocWithId;
}

/** List trip instances for a weekly trip (for lock checks). Single-field query, no composite index needed. */
export async function listTripInstancesByWeeklyTripId(
  companyId: string,
  weeklyTripId: string,
  options?: { limitCount?: number }
): Promise<TripInstanceDocWithId[]> {
  if (!weeklyTripId?.trim()) return [];
  const limitCount = options?.limitCount ?? 2000;
  const q = query(
    tripInstancesRef(companyId),
    where("weeklyTripId", "==", weeklyTripId.trim()),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripInstanceDocWithId));
}

/** Verrouillage métier weeklyTrip : indique si le trajet a des réservations et le max de places réservées (pour bloquer réduction en dessous). */
export interface WeeklyTripLockStatus {
  hasReservations: boolean;
  maxReservedSeats: number;
}

export async function getWeeklyTripLockStatus(
  companyId: string,
  weeklyTripId: string
): Promise<WeeklyTripLockStatus> {
  const instances = await listTripInstancesByWeeklyTripId(companyId, weeklyTripId);
  let maxReservedSeats = 0;
  for (const ti of instances) {
    const r = (ti as { reservedSeats?: number }).reservedSeats ?? 0;
    if (r > 0) maxReservedSeats = Math.max(maxReservedSeats, r);
  }
  return {
    hasReservations: maxReservedSeats > 0,
    maxReservedSeats,
  };
}
