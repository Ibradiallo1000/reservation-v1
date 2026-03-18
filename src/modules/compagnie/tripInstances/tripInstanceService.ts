/**
 * Trip instance CRUD and queries.
 * Lazy creation: getOrCreateTripInstanceForSlot creates when needed.
 */
import {
  collection,
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
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import {
  TRIP_INSTANCE_COLLECTION,
  TRIP_INSTANCE_STATUS,
  type TripInstanceDoc,
  type TripInstanceDocWithId,
  type TripInstanceStatus,
} from "./tripInstanceTypes";

function tripInstancesRef(companyId: string) {
  return collection(db, "companies", companyId, TRIP_INSTANCE_COLLECTION);
}

function tripInstanceRef(companyId: string, tripInstanceId: string) {
  return doc(db, "companies", companyId, TRIP_INSTANCE_COLLECTION, tripInstanceId);
}

export interface CreateTripInstanceParams {
  routeId?: string | null;
  agencyId: string;
  /** All agencies involved on this trip (e.g. [Bamako, Sikasso, Bouaké]). Optional; when absent, agencyId is used as single agency. */
  agenciesInvolved?: string[];
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

/** Create a single trip instance. Returns the new document id. If optionalId is provided, uses it (idempotent create). */
export async function createTripInstance(
  companyId: string,
  params: CreateTripInstanceParams,
  optionalId?: string
): Promise<string> {
  const ref = optionalId
    ? doc(tripInstancesRef(companyId), optionalId)
    : doc(tripInstancesRef(companyId));
  const now = serverTimestamp();
  const dep = (params.departureCity || "").trim();
  const arr = (params.arrivalCity || "").trim();
  const departureDate = Timestamp.fromDate(new Date(`${params.date}T00:00:00.000Z`));
  const capacitySeats = params.capacitySeats ?? params.seatCapacity ?? 0;
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
    ...(params.agenciesInvolved != null && params.agenciesInvolved.length > 0 && { agenciesInvolved: params.agenciesInvolved }),
    routeDeparture: dep,
    routeArrival: arr,
    weeklyTripId: params.weeklyTripId ?? null,
    vehicleId: params.vehicleId ?? null,
    date: params.date,
    departureDate,
    departureTime: params.departureTime,
    status: TRIP_INSTANCE_STATUS.SCHEDULED,
    passengerCount: 0,
    parcelCount: 0,
    ...(capacitySeats > 0 && { capacitySeats }),
    ...(params.capacityParcels != null && params.capacityParcels > 0 && { capacityParcels: params.capacityParcels }),
    createdAt: now,
    createdBy: params.createdBy ?? "",
    updatedAt: now,
    departureCity: dep,
    arrivalCity: arr,
    seatCapacity: capacitySeats,
    reservedSeats: 0,
    routeId: params.routeId ?? null,
    price: params.price ?? null,
  };
  if (optionalId) {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) tx.set(ref, data);
    });
  } else {
    await setDoc(ref, data);
  }
  return ref.id;
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
  const q = query(
    tripInstancesRef(companyId),
    where("agencyId", "==", agencyId),
    where("date", "==", date),
    where("departureTime", "==", departureTime),
    where("departureCity", "==", dep),
    where("arrivalCity", "==", arr),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
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
  const id = await createTripInstance(companyId, params);
  const snap = await getDoc(tripInstanceRef(companyId, id));
  return { id: snap.id, ...snap.data() } as TripInstanceDocWithId;
}

/** List trip instances by route (cities) and date. Requires index: tripInstances (departureCity, arrivalCity, date, departureTime). */
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
  const q = query(
    tripInstancesRef(companyId),
    where("departureCity", "==", dep),
    where("arrivalCity", "==", arr),
    where("date", "==", date),
    orderBy("departureTime", "asc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripInstanceDocWithId));
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

/** List trip instances by routeId and date (for escale dashboard). Requires composite index: (routeId, date, departureTime). */
export async function listTripInstancesByRouteIdAndDate(
  companyId: string,
  routeId: string,
  date: string,
  options?: { limitCount?: number }
): Promise<TripInstanceDocWithId[]> {
  if (!routeId || !date) return [];
  const limitCount = options?.limitCount ?? 100;
  const q = query(
    tripInstancesRef(companyId),
    where("routeId", "==", routeId),
    where("date", "==", date),
    orderBy("departureTime", "asc"),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TripInstanceDocWithId));
}

/** Update trip instance status. */
export async function updateTripInstanceStatus(
  companyId: string,
  tripInstanceId: string,
  status: TripInstanceStatus
): Promise<void> {
  await updateDoc(tripInstanceRef(companyId, tripInstanceId), {
    status,
    updatedAt: serverTimestamp(),
  });
}

/** Increment reservedSeats and passengerCount (e.g. when a reservation is created). Uses transaction to avoid overbooking. */
export async function incrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number
): Promise<void> {
  if (seats <= 0) return;
  const ref = tripInstanceRef(companyId, tripInstanceId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Trip instance not found");
    const d = snap.data() as { seatCapacity?: number; capacitySeats?: number; reservedSeats?: number };
    const capacity = d.seatCapacity ?? d.capacitySeats ?? 0;
    const current = d.reservedSeats ?? 0;
    if (capacity > 0 && current + seats > capacity)
      throw new Error("Plus assez de places disponibles sur ce trajet");
    tx.update(ref, {
      reservedSeats: increment(seats),
      passengerCount: increment(seats),
      updatedAt: serverTimestamp(),
    });
  });
}

/** Decrement reservedSeats and passengerCount (e.g. when a reservation is cancelled). Uses transaction to keep reservedSeats >= 0. */
export async function decrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number
): Promise<void> {
  if (seats <= 0) return;
  const ref = tripInstanceRef(companyId, tripInstanceId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const d = snap.data() as { reservedSeats?: number };
    const current = d.reservedSeats ?? 0;
    const delta = Math.min(seats, current);
    if (delta <= 0) return;
    tx.update(ref, {
      reservedSeats: increment(-delta),
      passengerCount: increment(-delta),
      updatedAt: serverTimestamp(),
    });
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
