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
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
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
  departureCity: string;
  arrivalCity: string;
  date: string;
  departureTime: string;
  seatCapacity: number;
  price?: number | null;
  weeklyTripId?: string | null;
  vehicleId?: string | null;
}

/** Create a single trip instance. Returns the new document id. */
export async function createTripInstance(
  companyId: string,
  params: CreateTripInstanceParams
): Promise<string> {
  const ref = doc(tripInstancesRef(companyId));
  const now = serverTimestamp();
  const data: TripInstanceDoc & { createdAt?: unknown; updatedAt?: unknown; price?: number | null } = {
    routeId: params.routeId ?? null,
    agencyId: params.agencyId,
    departureCity: (params.departureCity || "").trim(),
    arrivalCity: (params.arrivalCity || "").trim(),
    date: params.date,
    departureTime: params.departureTime,
    vehicleId: params.vehicleId ?? null,
    seatCapacity: params.seatCapacity,
    reservedSeats: 0,
    status: TRIP_INSTANCE_STATUS.SCHEDULED,
    weeklyTripId: params.weeklyTripId ?? null,
    price: params.price ?? null,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, data);
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

/** Get or create a trip instance for a slot (lazy creation). */
export async function getOrCreateTripInstanceForSlot(
  companyId: string,
  params: CreateTripInstanceParams
): Promise<TripInstanceDocWithId> {
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

/** Increment reservedSeats (e.g. when a reservation is created). Uses FieldValue.increment for safety. */
export async function incrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number
): Promise<void> {
  if (seats <= 0) return;
  await updateDoc(tripInstanceRef(companyId, tripInstanceId), {
    reservedSeats: increment(seats),
    updatedAt: serverTimestamp(),
  });
}

/** Decrement reservedSeats (e.g. when a reservation is cancelled). */
export async function decrementReservedSeats(
  companyId: string,
  tripInstanceId: string,
  seats: number
): Promise<void> {
  if (seats <= 0) return;
  await updateDoc(tripInstanceRef(companyId, tripInstanceId), {
    reservedSeats: increment(-seats),
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
