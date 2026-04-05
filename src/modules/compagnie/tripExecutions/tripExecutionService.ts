/**
 * Suivi temps réel inter-agences des exécutions de trajet.
 *
 * Collection :
 *  companies/{companyId}/tripExecutions/{tripInstanceId}
 *
 * Le doc est alimenté par :
 *  - start boarding (boardingSession)
 *  - départ origine (markOriginDeparture / auto)
 *  - progression tripInstance (updateTripInstanceStatus)
 *  - checkpoints (markArrival / markDeparture / ensureAutoDepartForStopIfNeeded)
 *  - descente finale (markDropped -> finished)
 */
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { normalizeCity } from "@/shared/utils/normalizeCity";
import { getAgencyCityFromDoc } from "@/modules/agence/utils/agencyCity";
import { vehicleRef } from "../fleet/vehiclesService";
import { getAffectationForBoarding } from "../fleet/affectationService";
import {
  tripInstanceRef,
  buildTripInstanceId,
  getTripInstance,
  updateTripInstanceStatutMetier,
} from "../tripInstances/tripInstanceService";
import type { TripInstanceDoc } from "../tripInstances/tripInstanceTypes";
import { TRIP_INSTANCE_STATUT_METIER } from "../tripInstances/tripInstanceTypes";
import { getRouteStops } from "../routes/routeStopsService";
import { mergeQueryDocsUnique, resolveStop } from "../routes/stopResolution";
import { getPassengersToDrop } from "../dropoff/dropoffService";
import {
  type TripExecutionCheckpoint,
  type TripExecutionDoc,
  type TripExecutionDocWithId,
  type TripExecutionStatus,
  type TripExecutionVehicleSnapshot,
} from "./tripExecutionTypes";
import { syncVehicleWithTripExecution } from "../fleet/vehicleOperationStateMachine";

const STATUS_RANK: Record<TripExecutionStatus, number> = {
  boarding: 0,
  validation_agence_requise: 1,
  departed: 2,
  transit: 3,
  arrived: 4,
  finished: 5,
  disrupted: 6,
};

export function tripExecutionRef(companyId: string, tripInstanceId: string) {
  return doc(db, "companies", companyId, "tripExecutions", tripInstanceId);
}

function normalizeTripInstanceTime(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return s;
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function buildTripExecutionIdFromSlot(params: {
  weeklyTripId: string;
  tripExecutionDate: string;
  departureTime: string;
}): string {
  const depTime = normalizeTripInstanceTime(params.departureTime);
  return buildTripInstanceId(params.weeklyTripId, params.tripExecutionDate, depTime);
}

function safeNum(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function resolveDestinationCityRaw(companyId: string, targetArrivalCity: string) {
  const targetNorm = normalizeCity(targetArrivalCity);
  const agenciesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
  let bestRaw = "";
  for (const ag of agenciesSnap.docs) {
    const raw = getAgencyCityFromDoc(ag.data() as any);
    if (!raw) continue;
    if (normalizeCity(raw) === targetNorm) {
      bestRaw = raw;
      break;
    }
  }
  return bestRaw || String(targetArrivalCity ?? "").trim();
}

async function resolveDestinationAgencyId(companyId: string, targetArrivalCity: string) {
  const targetNorm = normalizeCity(targetArrivalCity);
  const agenciesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
  for (const ag of agenciesSnap.docs) {
    const raw = getAgencyCityFromDoc(ag.data() as any);
    if (!raw) continue;
    if (normalizeCity(raw) === targetNorm) return ag.id;
  }
  return null;
}

/**
 * Compte des passagers embarqués à une escale (montées) :
 * originStopOrder == stopOrder && boardingStatus == "boarded".
 *
 * On évite un index supplémentaire sur boardingStatus en filtrant côté client.
 */
async function countBoardedAtStop(companyId: string, tripInstanceId: string, stopOrder: number): Promise<number> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  const routeId = (ti as { routeId?: string | null })?.routeId ?? null;
  let originStopId: string | null = null;
  if (routeId) {
    const rs = await resolveStop(companyId, routeId, stopOrder);
    originStopId = rs?.stopId ?? null;
  }
  const qOrder = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("tripInstanceId", "==", tripInstanceId),
    where("originStopOrder", "==", stopOrder)
  );
  const snapOrder = await getDocs(qOrder);
  let docs = snapOrder.docs;
  if (originStopId) {
    const qId = query(
      collectionGroup(db, "reservations"),
      where("companyId", "==", companyId),
      where("tripInstanceId", "==", tripInstanceId),
      where("originStopId", "==", originStopId)
    );
    const snapId = await getDocs(qId);
    docs = mergeQueryDocsUnique(snapOrder.docs, snapId.docs);
  }
  let total = 0;
  for (const d of docs) {
    const data = d.data() as any;
    const boardingStatus = String(data.boardingStatus ?? "").toLowerCase();
    const dropoffStatus = String(data.dropoffStatus ?? "").toLowerCase();
    if (boardingStatus !== "boarded") continue;
    if (dropoffStatus === "dropped") continue;
    total += safeNum(data.seatsGo ?? 1);
  }
  return total;
}

/**
 * Compte des passagers descendus à une escale (déscentes) :
 * destinationStopOrder == stopOrder && dropoffStatus == "dropped".
 *
 * On évite un index supplémentaire sur dropoffStatus en filtrant côté client.
 */
async function countDroppedAtStop(companyId: string, tripInstanceId: string, stopOrder: number): Promise<number> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  const routeId = (ti as { routeId?: string | null })?.routeId ?? null;
  let destinationStopId: string | null = null;
  if (routeId) {
    const rs = await resolveStop(companyId, routeId, stopOrder);
    destinationStopId = rs?.stopId ?? null;
  }
  const qOrder = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("tripInstanceId", "==", tripInstanceId),
    where("destinationStopOrder", "==", stopOrder)
  );
  const snapOrder = await getDocs(qOrder);
  let docs = snapOrder.docs;
  if (destinationStopId) {
    const qId = query(
      collectionGroup(db, "reservations"),
      where("companyId", "==", companyId),
      where("tripInstanceId", "==", tripInstanceId),
      where("destinationStopId", "==", destinationStopId)
    );
    const snapId = await getDocs(qId);
    docs = mergeQueryDocsUnique(snapOrder.docs, snapId.docs);
  }
  let total = 0;
  for (const d of docs) {
    const data = d.data() as any;
    const dropoffStatus = String(data.dropoffStatus ?? "").toLowerCase();
    if (dropoffStatus !== "dropped") continue;
    total += safeNum(data.seatsGo ?? 1);
  }
  return total;
}

async function upsertTripExecutionStatus(params: {
  companyId: string;
  tripInstanceId: string;
  newStatus: TripExecutionStatus;
  statusFieldTimes: Partial<Pick<TripExecutionDoc, "boardingStartedAt" | "departedAt" | "transitAt" | "arrivedAt" | "finishedAt">>;
}): Promise<void> {
  const { companyId, tripInstanceId, newStatus, statusFieldTimes } = params;
  const ref = tripExecutionRef(companyId, tripInstanceId);
  const snap = await getDoc(ref);
  const existing = snap.exists() ? (snap.data() as TripExecutionDoc) : null;
  const existingRank = existing ? STATUS_RANK[existing.status] : -1;
  const newRank = STATUS_RANK[newStatus];
  if (existing && existingRank > newRank) return;

  const patch: Partial<TripExecutionDoc> = {
    status: newStatus,
    ...statusFieldTimes,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, patch, { merge: true });
}

function upsertCheckpointInArray(
  prev: TripExecutionCheckpoint[] | undefined,
  checkpoint: TripExecutionCheckpoint
): TripExecutionCheckpoint[] {
  const list = Array.isArray(prev) ? [...prev] : [];
  const idx = list.findIndex((c) => c.stopOrder === checkpoint.stopOrder);
  if (idx >= 0) list[idx] = { ...list[idx], ...checkpoint };
  else list.push(checkpoint);
  list.sort((a, b) => a.stopOrder - b.stopOrder);
  return list;
}

async function ensureTripExecutionBaseFromTripInstance(companyId: string, tripInstanceId: string): Promise<void> {
  const ref = tripExecutionRef(companyId, tripInstanceId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;

  const tiSnap = await getDoc(tripInstanceRef(companyId, tripInstanceId));
  if (!tiSnap.exists()) return;
  const ti = tiSnap.data() as TripInstanceDoc;

  const tripExecutionDate = String(ti.date ?? "").trim() || "";
  const weeklyTripId = String(ti.weeklyTripId ?? "").trim();
  const departureTime = String(ti.departureTime ?? "").trim();

  const tripExecutionDateSafe = tripExecutionDate || (tripExecutionDate ? tripExecutionDate : "");
  const destinationCity = String(ti.arrival ?? ti.arrivalCity ?? "").trim() || "";

  await setDoc(
    ref,
    {
      companyId,
      tripInstanceId,
      tripExecutionDate: tripExecutionDateSafe,
      tripAssignmentId: "",
      vehicleId: String(ti.vehicleId ?? ""),
      departureAgencyId: String(ti.agencyId ?? ""),
      arrivalAgencyId: null,
      destinationCity,
      passengersCount: 0,
      status: "boarding",
      boardingStartedAt: null,
      boardingCompletedAt: null,
      boardingCompletedBy: null,
      agencyValidationRequiredAt: null,
      agencyValidatedAt: null,
      agencyValidatedBy: null,
      departureValidatedAt: null,
      departureValidatedBy: null,
      departedAt: null,
      transitAt: null,
      arrivedAt: null,
      finishedAt: null,
      checkpoints: [],
      updatedAt: serverTimestamp(),
    } as Partial<TripExecutionDoc>,
    { merge: true }
  );
}

async function syncCheckpointFromProgress(params: {
  companyId: string;
  tripInstanceId: string;
  stopOrder: number;
}): Promise<void> {
  const { companyId, tripInstanceId, stopOrder } = params;
  const progressRef = doc(collection(db, "companies", companyId, "tripInstances", tripInstanceId, "progress"), String(stopOrder));
  const progressSnap = await getDoc(progressRef);
  if (!progressSnap.exists()) return;
  const progress = progressSnap.data() as { city?: string; arrivalTime?: any; departureTime?: any };

  // Load counts based on reservations state
  const [montées, descentes] = await Promise.all([
    countBoardedAtStop(companyId, tripInstanceId, stopOrder),
    countDroppedAtStop(companyId, tripInstanceId, stopOrder),
  ]);

  const checkpoint: TripExecutionCheckpoint = {
    stopOrder,
    city: String(progress.city ?? "").trim() || "—",
    arrivalTime: progress.arrivalTime ?? null,
    departureTime: progress.departureTime ?? null,
    montées,
    descentes,
  };

  const ref = tripExecutionRef(companyId, tripInstanceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);
  }
  const updatedSnap = await getDoc(ref);
  const existing = updatedSnap.exists() ? (updatedSnap.data() as TripExecutionDoc) : null;
  const nextCheckpoints = upsertCheckpointInArray(existing?.checkpoints, checkpoint);
  await setDoc(ref, { checkpoints: nextCheckpoints, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Créé / upsert le tripExecution à l’instant du démarrage boarding.
 */
export async function ensureTripExecutionOnBoardingStart(params: {
  companyId: string;
  tripAssignmentId: string;
  vehicleId: string;
  departureAgencyId: string;
  departureCity: string;
  weeklyTripId: string; // id weeklyTrips
  tripExecutionDate: string; // YYYY-MM-DD
  departureTime: string; // HH:mm
  targetArrivalCity: string; // sélection weeklyTrip.arrival
}): Promise<string> {
  const {
    companyId,
    tripAssignmentId,
    vehicleId,
    departureAgencyId,
    departureCity,
    weeklyTripId,
    tripExecutionDate,
    departureTime,
    targetArrivalCity,
  } = params;

  const tripInstanceId = buildTripExecutionIdFromSlot({
    weeklyTripId,
    tripExecutionDate,
    departureTime,
  });

  const destinationCityRaw = await resolveDestinationCityRaw(companyId, targetArrivalCity);
  const arrivalAgencyId = await resolveDestinationAgencyId(companyId, targetArrivalCity);

  const ref = tripExecutionRef(companyId, tripInstanceId);
  const snap = await getDoc(ref);
  const now = serverTimestamp();
  let vehicleSnapshot: TripExecutionVehicleSnapshot | undefined = undefined;

  try {
    const [vSnap, assignmentSnap, affectation] = await Promise.all([
      getDoc(vehicleRef(companyId, vehicleId)),
      getDoc(doc(db, "companies", companyId, "agences", departureAgencyId, "tripAssignments", tripAssignmentId)),
      getAffectationForBoarding(
        companyId,
        departureAgencyId,
        departureCity,
        targetArrivalCity,
        tripExecutionDate,
        departureTime
      ).catch(() => null),
    ]);
    const plateNumber = vSnap.exists() ? String((vSnap.data() as { plateNumber?: string }).plateNumber ?? "").trim() : "";
    const assignmentData = assignmentSnap.exists() ? (assignmentSnap.data() as Record<string, unknown>) : null;
    const driverName = String(assignmentData?.driverName ?? (affectation as any)?.driverName ?? "").trim();
    const convoyeurName = String(assignmentData?.convoyeurName ?? (affectation as any)?.convoyeurName ?? "").trim();
    if (plateNumber || driverName || convoyeurName) {
      vehicleSnapshot = {
        plateNumber: plateNumber || undefined,
        driverName: driverName || undefined,
        convoyeurName: convoyeurName || undefined,
      };
    }
  } catch {
    // Best effort only: tripExecution creation must not fail on snapshot enrichment.
  }

  const existing = snap.exists() ? (snap.data() as TripExecutionDoc) : null;
  if (existing && STATUS_RANK[existing.status] > STATUS_RANK.boarding) {
    // Ne pas rétrograder depuis départ/transit/arrivée/finished
    return tripInstanceId;
  }

  await setDoc(
    ref,
    {
      companyId,
      tripInstanceId,
      tripExecutionDate,
      tripAssignmentId,
      vehicleId,
      vehicleSnapshot: existing?.vehicleSnapshot ?? vehicleSnapshot,
      departureAgencyId,
      arrivalAgencyId,
      destinationCity: destinationCityRaw,
      passengersCount: existing?.passengersCount ?? 0,
      status: "boarding",
      boardingStartedAt: existing?.boardingStartedAt ?? now,
      checkpoints: existing?.checkpoints ?? [],
      updatedAt: now,
    } as Partial<TripExecutionDoc>,
    { merge: true }
  );
  await updateTripInstanceStatutMetier(
    companyId,
    tripInstanceId,
    TRIP_INSTANCE_STATUT_METIER.EMBARQUEMENT_EN_COURS
  ).catch(() => {
    /* non-bloquant */
  });
  await setDoc(
    tripInstanceRef(companyId, tripInstanceId),
    {
      destinationAgencyId: arrivalAgencyId ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  try {
    const teAfter = await getDoc(ref);
    if (teAfter.exists()) {
      await syncVehicleWithTripExecution({
        companyId,
        tripInstanceId,
        tripExecution: teAfter.data() as TripExecutionDoc,
      });
    }
  } catch {
    // best effort: trip execution must still be persisted.
  }

  return tripInstanceId;
}

/**
 * Validation logistique: alimente/rafraîchit le vehicleSnapshot si le tripExecution existe déjà.
 * Si le tripExecution n'existe pas encore, il sera enrichi au début d'embarquement.
 */
export async function refreshTripExecutionVehicleSnapshotOnAssignmentValidation(params: {
  companyId: string;
  agencyId: string;
  assignmentId: string;
}): Promise<void> {
  const { companyId, agencyId, assignmentId } = params;
  const asgRef = doc(db, "companies", companyId, "agences", agencyId, "tripAssignments", assignmentId);
  const asgSnap = await getDoc(asgRef);
  if (!asgSnap.exists()) return;
  const asg = asgSnap.data() as Record<string, unknown>;
  const weeklyTripId = String(asg.tripId ?? "").trim();
  const tripExecutionDate = String(asg.date ?? "").trim();
  const departureTime = String(asg.heure ?? "").trim();
  const vehicleId = String(asg.vehicleId ?? "").trim();
  if (!weeklyTripId || !tripExecutionDate || !departureTime || !vehicleId) return;

  const tripInstanceId = buildTripExecutionIdFromSlot({
    weeklyTripId,
    tripExecutionDate,
    departureTime,
  });
  const teRef = tripExecutionRef(companyId, tripInstanceId);
  const teSnap = await getDoc(teRef);
  if (!teSnap.exists()) return;

  let plateNumber = "";
  let driverName = "";
  let convoyeurName = "";
  try {
    const [vSnap, wtSnap] = await Promise.all([
      getDoc(vehicleRef(companyId, vehicleId)),
      getDoc(doc(db, "companies", companyId, "agences", agencyId, "weeklyTrips", weeklyTripId)),
    ]);
    plateNumber = vSnap.exists() ? String((vSnap.data() as { plateNumber?: string }).plateNumber ?? "").trim() : "";
    const departureCity = String(wtSnap.exists() ? (wtSnap.data() as any).departure ?? "" : "").trim();
    const arrivalCity = String(wtSnap.exists() ? (wtSnap.data() as any).arrival ?? "" : "").trim();
    const affectation = await getAffectationForBoarding(
      companyId,
      agencyId,
      departureCity,
      arrivalCity,
      tripExecutionDate,
      departureTime
    ).catch(() => null);
    driverName = String((asg as any).driverName ?? (affectation as any)?.driverName ?? "").trim();
    convoyeurName = String((asg as any).convoyeurName ?? (affectation as any)?.convoyeurName ?? "").trim();
  } catch {
    /* best effort */
  }

  await setDoc(
    teRef,
    {
      tripAssignmentId: assignmentId,
      vehicleId,
      vehicleSnapshot: {
        plateNumber: plateNumber || undefined,
        driverName: driverName || undefined,
        convoyeurName: convoyeurName || undefined,
      },
      updatedAt: serverTimestamp(),
    } as Partial<TripExecutionDoc>,
    { merge: true }
  );
}

/**
 * Upsert : status=departed, departedAt, passengersCount depuis tripAssignments.liveStatus.boardedCount.
 * + checkpoint stopOrder=1.
 */
export async function upsertTripExecutionDeparted(params: { companyId: string; tripInstanceId: string }): Promise<void> {
  const { companyId, tripInstanceId } = params;
  await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);

  const teSnap = await getDoc(tripExecutionRef(companyId, tripInstanceId));
  if (!teSnap.exists()) return;
  const te = teSnap.data() as TripExecutionDoc;
  const tiSnap = await getDoc(tripInstanceRef(companyId, tripInstanceId));
  const ti = tiSnap.exists() ? (tiSnap.data() as { statutMetier?: string }) : null;
  if (String(ti?.statutMetier ?? "") !== TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT) {
    throw new Error("Validation agence requise avant le départ véhicule.");
  }

  let passengersCount = te.passengersCount ?? 0;
  if (te.tripAssignmentId && te.departureAgencyId) {
    try {
      const asgRef = doc(db, "companies", companyId, "agences", te.departureAgencyId, "tripAssignments", te.tripAssignmentId);
      const asgSnap = await getDoc(asgRef);
      if (asgSnap.exists()) {
        const ad = asgSnap.data() as any;
        const ls = ad.liveStatus as { boardedCount?: number } | undefined;
        passengersCount = Number(ls?.boardedCount ?? passengersCount ?? 0);
      }
    } catch {
      /* best effort */
    }
  }

  const now = serverTimestamp();
  await upsertTripExecutionStatus({
    companyId,
    tripInstanceId,
    newStatus: "departed",
    statusFieldTimes: {
      departedAt: now,
    },
  });
  // Ensure checkpoint from progress/1
  await syncCheckpointFromProgress({ companyId, tripInstanceId, stopOrder: 1 });
  await setDoc(tripExecutionRef(companyId, tripInstanceId), { passengersCount }, { merge: true });
  try {
    const teAfter = await getDoc(tripExecutionRef(companyId, tripInstanceId));
    if (teAfter.exists()) {
      await syncVehicleWithTripExecution({
        companyId,
        tripInstanceId,
        tripExecution: teAfter.data() as TripExecutionDoc,
      });
    }
  } catch {
    // best effort
  }
}

export async function markTripExecutionBoardingCompleted(params: {
  companyId: string;
  tripInstanceId: string;
  completedBy: string;
}): Promise<void> {
  const { companyId, tripInstanceId, completedBy } = params;
  await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);
  await upsertTripExecutionStatus({
    companyId,
    tripInstanceId,
    newStatus: "validation_agence_requise",
    statusFieldTimes: {},
  });
  await setDoc(
    tripExecutionRef(companyId, tripInstanceId),
    {
      boardingCompletedAt: serverTimestamp(),
      boardingCompletedBy: completedBy,
      agencyValidationRequiredAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } as Partial<TripExecutionDoc>,
    { merge: true }
  );
  await updateTripInstanceStatutMetier(
    companyId,
    tripInstanceId,
    TRIP_INSTANCE_STATUT_METIER.VALIDATION_AGENCE_REQUISE
  );
}

export async function ensureAgencyValidationBeforeDeparture(params: {
  companyId: string;
  tripInstanceId: string;
  validatedBy: string | null;
}): Promise<void> {
  const { companyId, tripInstanceId, validatedBy } = params;
  await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);
  const tiSnap = await getDoc(tripInstanceRef(companyId, tripInstanceId));
  if (!tiSnap.exists()) throw new Error("Trajet introuvable.");
  const ti = tiSnap.data() as { statutMetier?: string };
  if (String(ti.statutMetier ?? "") !== TRIP_INSTANCE_STATUT_METIER.VALIDATION_AGENCE_REQUISE) {
    throw new Error("Validation agence requise avant le départ véhicule.");
  }
  const canValidate = !!validatedBy;
  if (canValidate) {
    const ref = tripExecutionRef(companyId, tripInstanceId);
    await setDoc(
      ref,
      {
        agencyValidatedAt: serverTimestamp(),
        agencyValidatedBy: validatedBy,
        departureValidatedAt: serverTimestamp(),
        departureValidatedBy: validatedBy,
        updatedAt: serverTimestamp(),
      } as Partial<TripExecutionDoc>,
      { merge: true }
    );
    await updateTripInstanceStatutMetier(
      companyId,
      tripInstanceId,
      TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT
    );
  }
}

export async function upsertTripExecutionTransit(params: { companyId: string; tripInstanceId: string }): Promise<void> {
  const { companyId, tripInstanceId } = params;
  await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);
  const tiSnapBefore = await getDoc(tripInstanceRef(companyId, tripInstanceId));
  if (tiSnapBefore.exists()) {
    const tiBefore = tiSnapBefore.data() as { statutMetier?: string };
    if (String(tiBefore.statutMetier ?? "") !== TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT) {
      throw new Error("Interdit: passage direct embarquement -> transit sans validation agence.");
    }
  }
  await upsertTripExecutionStatus({
    companyId,
    tripInstanceId,
    newStatus: "transit",
    statusFieldTimes: { transitAt: serverTimestamp() },
  });
  const teSnap = await getDoc(tripExecutionRef(companyId, tripInstanceId));
  if (teSnap.exists()) {
    const te = teSnap.data() as TripExecutionDoc;
    try {
      await syncVehicleWithTripExecution({
        companyId,
        tripInstanceId,
        tripExecution: te,
      });
    } catch {
      // best effort
    }
  }
}

export async function upsertTripExecutionArrived(params: { companyId: string; tripInstanceId: string }): Promise<void> {
  const { companyId, tripInstanceId } = params;
  await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);
  await upsertTripExecutionStatus({
    companyId,
    tripInstanceId,
    newStatus: "arrived",
    statusFieldTimes: { arrivedAt: serverTimestamp() },
  });
}

export async function syncTripExecutionCheckpoint(params: {
  companyId: string;
  tripInstanceId: string;
  stopOrder: number;
}): Promise<void> {
  const { companyId, tripInstanceId, stopOrder } = params;
  await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);
  await syncCheckpointFromProgress({ companyId, tripInstanceId, stopOrder });
}

async function listFinalStopOrdersFromTripInstance(companyId: string, tripInstanceId: string): Promise<number | null> {
  const tiSnap = await getDoc(tripInstanceRef(companyId, tripInstanceId));
  if (!tiSnap.exists()) return null;
  const ti = tiSnap.data() as TripInstanceDoc;
  const routeId = (ti.routeId ?? null) as string | null;
  if (!routeId) return null;
  const stops = await getRouteStops(companyId, routeId);
  if (!stops || stops.length === 0) return null;
  // final stop is max order among stops
  const max = Math.max(...stops.map((s: any) => Number(s.order ?? 0)));
  const finalStop = stops.find((s: any) => Number(s.order ?? 0) === max);
  if (!finalStop) return null;
  return max;
}

/**
 * Détermine si la descente finale est terminée et si tripExecution peut passer à finished.
 */
export async function maybeFinishTripExecutionAfterFinalDropoff(params: {
  companyId: string;
  tripInstanceId: string;
  destinationStopOrder: number;
}): Promise<void> {
  const { companyId, tripInstanceId, destinationStopOrder } = params;
  await ensureTripExecutionBaseFromTripInstance(companyId, tripInstanceId);

  const teSnap = await getDoc(tripExecutionRef(companyId, tripInstanceId));
  if (!teSnap.exists()) return;
  const te = teSnap.data() as TripExecutionDoc;
  if (te.status === "finished") return;

  const finalStopOrder = await listFinalStopOrdersFromTripInstance(companyId, tripInstanceId);
  if (finalStopOrder == null) return;
  if (destinationStopOrder !== finalStopOrder) return;

  const pending = await getPassengersToDrop(companyId, tripInstanceId, destinationStopOrder);
  if (pending.length > 0) return;

  await upsertTripExecutionStatus({
    companyId,
    tripInstanceId,
    newStatus: "finished",
    statusFieldTimes: { finishedAt: serverTimestamp() },
  });
  try {
    const teAfter = await getDoc(tripExecutionRef(companyId, tripInstanceId));
    if (teAfter.exists()) {
      await syncVehicleWithTripExecution({
        companyId,
        tripInstanceId,
        tripExecution: teAfter.data() as TripExecutionDoc,
      });
    }
  } catch {
    // best effort
  }
}

export function subscribeTripExecutionsByDestinationCityAndDate(params: {
  companyId: string;
  destinationCity: string;
  tripExecutionDate: string; // YYYY-MM-DD
  onData: (rows: Array<TripExecutionDocWithId>) => void;
  onError?: (e: Error) => void;
}): () => void {
  const { companyId, destinationCity, tripExecutionDate, onData, onError } = params;
  const ref = collection(db, "companies", companyId, "tripExecutions");
  const q = query(ref, where("destinationCity", "==", destinationCity), where("tripExecutionDate", "==", tripExecutionDate));

  const unsub = onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TripExecutionDoc) }));
      onData(rows);
    },
    (err) => onError?.(err)
  );

  return unsub;
}

