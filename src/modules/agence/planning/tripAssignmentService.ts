/**
 * Affectations trajet ↔ véhicule par agence (planifié par le chef, validé par la logistique).
 * Chemin : companies/{companyId}/agences/{agencyId}/tripAssignments/{assignmentId}
 * Phase 2.5 : index créneau véhicule atomique — companies/.../tripAssignmentVehicleSlots/{vehicleId}__{date}__{heure}
 * (Firestore Web ne permet pas les requêtes WHERE dans runTransaction ; l’index miroir garantit l’atomicité.)
 */
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where,
  orderBy,
  limit,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { vehicleRef } from "@/modules/compagnie/fleet/vehiclesService";
import type { VehicleDoc } from "@/modules/compagnie/fleet/vehicleTypes";
import { TECHNICAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import { canAssignVehicle, deriveOperationStatus } from "@/modules/compagnie/fleet/vehicleOperationStateMachine";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import {
  applyPlanningStatsDecrementRemove,
  applyPlanningStatsIncrementCreate,
  applyPlanningStatsVehicleChange,
  scheduleRecomputeCompanyPlanningStats,
} from "./planningStatsService";

/** planned / validated bloquent les créneaux ; cancelled / rejected non. */
export type TripAssignmentStatus = "planned" | "validated" | "cancelled" | "rejected";

/** Verrou embarquement multi-appareils (Phase 3.5). clientInstanceId = instance navigateur (localStorage). */
export type TripAssignmentBoardingSession = {
  startedBy: string;
  startedAt?: unknown;
  status: "active" | "closed";
  clientInstanceId: string;
  closedAt?: unknown;
};

/** Supervision temps réel (Phase 4). */
export type TripAssignmentLiveStatus = {
  boardingStartedAt?: unknown;
  boardedCount: number;
  expectedCount: number;
  status: "waiting" | "boarding" | "completed";
};

export type TripAssignmentDoc = {
  tripId: string;
  date: string;
  heure: string;
  /** Durée trajet (minutes) — conflits véhicule = chevauchement [départ, départ+durée). */
  tripDurationMinutes?: number;
  vehicleId: string;
  agencyId: string;
  status: TripAssignmentStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
  validatedAt?: unknown;
  boardingSession?: TripAssignmentBoardingSession;
  liveStatus?: TripAssignmentLiveStatus;
};

function isVehicleTechnicallyActiveForPlanning(v: Partial<VehicleDoc> & { isArchived?: boolean }): boolean {
  if ((v as any).isArchived === true) return false;
  const legacy = String((v as any).status ?? "").toLowerCase();
  if (legacy) {
    if (legacy === "active") return true;
    if (legacy === "garage" || legacy === "en_service") return true;
  }
  const tech = String((v as any).technicalStatus ?? TECHNICAL_STATUS.NORMAL).toUpperCase();
  return tech === TECHNICAL_STATUS.NORMAL;
}

function isVehicleAssignableOperationally(v: Partial<VehicleDoc>, assignmentId?: string): boolean {
  if (canAssignVehicle(v)) return true;
  const opState = deriveOperationStatus(v);
  if (opState !== "planned") return false;
  const currentAssignmentId = String((v as any).currentAssignmentId ?? "").trim();
  if (!currentAssignmentId) return true;
  return assignmentId != null && currentAssignmentId === assignmentId;
}

/** Message affiché si une autre instance détient déjà le verrou actif. */
export const BOARDING_SESSION_IN_USE_MSG = "Embarquement déjà en cours sur un autre appareil";
/**
 * Hotfix prod: verrou Firestore embarquement désactivé temporairement.
 * Raison: règles hétérogènes selon profils en production -> 403 bloquants au scan.
 * Impact: plus d'exclusivité multi-appareils stricte pendant l'embarquement.
 */
const BOARDING_LOCKS_DISABLED = true;

export type TripAssignmentVehicleSlotDoc = {
  assignmentId: string;
  vehicleId: string;
  tripId: string;
  date: string;
  heure: string;
  status: TripAssignmentStatus;
  updatedAt?: unknown;
};

export function tripAssignmentsCollectionRef(companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, "tripAssignments");
}

/**
 * Idempotence compteur live (Phase 4.5) — un doc par (tripAssignment, réservation).
 * Champs : reservationId, tripAssignmentId, scannedAt
 */
export function boardingEmbarkDedupDocRef(
  companyId: string,
  agencyId: string,
  tripAssignmentId: string,
  reservationId: string
) {
  const safeAid = String(tripAssignmentId).replace(/\//g, "_");
  const dedupId = `${safeAid}__emb__${reservationId}`;
  return doc(db, "companies", companyId, "agences", agencyId, "boardingEmbarkDedup", dedupId);
}

/** Créneau véhicule + date + heure (une seule affectation active à la fois). */
export function tripAssignmentVehicleSlotsCollectionRef(companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, "tripAssignmentVehicleSlots");
}

export function tripAssignmentDocId(tripId: string, date: string, heure: string): string {
  const h = String(heure ?? "").trim().replace(/:/g, "-");
  return `${tripId}__${date}__${h}`;
}

async function notifyLogisticsPlanningCreated(params: {
  companyId: string;
  agencyId: string;
  assignmentId: string;
  tripId: string;
  date: string;
  heure: string;
  vehicleId: string;
}): Promise<void> {
  const roles = ["responsable_logistique", "chef_garage", "admin_compagnie"];
  // Backward compat: some users still carry `compagnieId` instead of `companyId`.
  const [companyUsersSnap, compagnieUsersSnap] = await Promise.all([
    getDocs(query(collection(db, "users"), where("companyId", "==", params.companyId), where("role", "in", roles))),
    getDocs(query(collection(db, "users"), where("compagnieId", "==", params.companyId), where("role", "in", roles))),
  ]);
  const recipientById = new Map<string, { role?: string }>();
  [...companyUsersSnap.docs, ...compagnieUsersSnap.docs].forEach((u) => {
    recipientById.set(u.id, { role: String((u.data() as { role?: string }).role ?? "") });
  });
  const notificationsCol = collection(db, "companies", params.companyId, "notifications");
  if (recipientById.size === 0) {
    await addDoc(notificationsCol, {
      type: "planning_submitted",
      entityType: "planning_assignment",
      entityId: params.assignmentId,
      title: "Nouvelle demande de planification",
      body: `Trajet ${params.tripId} · ${params.date} ${params.heure} · Véhicule ${params.vehicleId}`,
      link: `/compagnie/${params.companyId}/logistics`,
      agencyId: params.agencyId,
      targetUserId: null,
      targetRole: null,
      read: false,
      createdAt: serverTimestamp(),
    });
    return;
  }

  const writes = Array.from(recipientById.entries()).map(([uid, meta]) => {
    const role = String(meta.role ?? "");
    return addDoc(notificationsCol, {
      type: "planning_submitted",
      entityType: "planning_assignment",
      entityId: params.assignmentId,
      title: "Nouvelle demande de planification",
      body: `Trajet ${params.tripId} · ${params.date} ${params.heure} · Véhicule ${params.vehicleId}`,
      link: `/compagnie/${params.companyId}/logistics`,
      agencyId: params.agencyId,
      targetUserId: uid,
      targetRole: role || null,
      read: false,
      createdAt: serverTimestamp(),
    });
  });
  await Promise.all(writes);
}

export function tripAssignmentVehicleSlotDocId(vehicleId: string, date: string, heure: string): string {
  const h = String(heure ?? "").trim().replace(/:/g, "-");
  const vid = String(vehicleId ?? "").trim();
  return `${vid}__${date}__${h}`;
}

function isBlockingTripAssignmentStatus(s: unknown): boolean {
  return s === "planned" || s === "validated";
}

/** Messages d’erreur planification (Phase 2 — pas d’écrasement silencieux). */
export const TRIP_PLANNING_ERROR_TRIP_SLOT_TAKEN =
  "Ce trajet est déjà planifié avec un autre véhicule.";
export const TRIP_PLANNING_ERROR_VEHICLE_BUSY =
  "Affectation impossible : véhicule déjà utilisé sur une plage horaire qui chevauche ce départ.";
export const PLANNING_LOCK_CONFLICT_MSG =
  "Ce créneau est verrouillé par un autre opérateur. Réessayez dans quelques instants.";

export const DEFAULT_TRIP_DURATION_MINUTES = 180;

export function minutesFromHeure(h: string): number {
  const p = String(h ?? "").trim().split(":").map((x) => Number(x));
  const hh = Number.isFinite(p[0]) ? p[0] : 0;
  const mm = Number.isFinite(p[1]) ? p[1] : 0;
  return hh * 60 + mm;
}

/** Chevauchement sur la même journée calendaire (intervalles semi-ouverts en minutes depuis minuit). */
export function assignmentTimeRangesOverlap(
  date: string,
  heureA: string,
  durA: number,
  other: { date: string; heure: string; tripDurationMinutes?: number }
): boolean {
  if (date !== other.date) return false;
  const dA = Math.max(1, Math.min(24 * 60, Math.floor(durA || DEFAULT_TRIP_DURATION_MINUTES)));
  const dB = Math.max(
    1,
    Math.min(24 * 60, Math.floor(other.tripDurationMinutes ?? DEFAULT_TRIP_DURATION_MINUTES))
  );
  const sa = minutesFromHeure(heureA);
  const ea = sa + dA;
  const sb = minutesFromHeure(other.heure);
  const eb = sb + dB;
  return sa < eb && sb < ea;
}

export async function fetchWeeklyTripDurationMinutes(
  companyId: string,
  agencyId: string,
  tripId: string
): Promise<number> {
  const wref = doc(db, "companies", companyId, "agences", agencyId, "weeklyTrips", tripId);
  const wSnap = await getDoc(wref);
  if (!wSnap.exists()) return DEFAULT_TRIP_DURATION_MINUTES;
  const d = wSnap.data() as Record<string, unknown>;
  const n = Number(
    d.tripDurationMinutes ?? d.durationMinutes ?? d.dureeMinutes ?? d.dureeTrajetMinutes ?? DEFAULT_TRIP_DURATION_MINUTES
  );
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_TRIP_DURATION_MINUTES;
  return Math.min(24 * 60, Math.floor(n));
}

export function planningSlotLockRef(companyId: string, agencyId: string, lockId: string) {
  const safe = String(lockId).replace(/\//g, "_");
  return doc(db, "companies", companyId, "agences", agencyId, "planningLocks", safe);
}

const PLANNING_LOCK_TTL_MS = 120_000;

export async function acquirePlanningSlotLock(
  companyId: string,
  agencyId: string,
  lockId: string,
  uid: string
): Promise<void> {
  const ref = planningSlotLockRef(companyId, agencyId, lockId);
  await runTransaction(db, async (transaction) => {
    const s = await transaction.get(ref);
    const now = Date.now();
    if (s.exists()) {
      const d = s.data() as { holderUid?: string; acquiredAt?: { toMillis?: () => number } };
      const at = d.acquiredAt?.toMillis?.() ?? 0;
      if (d.holderUid && d.holderUid !== uid && now - at < PLANNING_LOCK_TTL_MS) {
        throw new Error(PLANNING_LOCK_CONFLICT_MSG);
      }
    }
    transaction.set(ref, { holderUid: uid, acquiredAt: serverTimestamp() }, { merge: true });
  });
}

export async function releasePlanningSlotLock(
  companyId: string,
  agencyId: string,
  lockId: string,
  uid: string
): Promise<void> {
  const ref = planningSlotLockRef(companyId, agencyId, lockId);
  await runTransaction(db, async (transaction) => {
    const s = await transaction.get(ref);
    if (!s.exists()) return;
    const d = s.data() as { holderUid?: string };
    if (d.holderUid === uid) {
      transaction.delete(ref);
    }
  });
}

/**
 * Pré-contrôle hors transaction : trajet déjà pris sur l’heure exacte ; véhicule libre sur toute la plage [heure, heure+durée).
 */
export async function assertNoTripPlanningConflicts(
  companyId: string,
  agencyId: string,
  input: {
    tripId: string;
    date: string;
    heure: string;
    vehicleId: string;
    excludeAssignmentId?: string;
    tripDurationMinutes?: number;
  }
): Promise<void> {
  const ref = tripAssignmentsCollectionRef(companyId, agencyId);
  const heure = String(input.heure ?? "").trim();
  const { tripId, date, vehicleId } = input;
  const excludeId = input.excludeAssignmentId;
  const dur = Math.max(1, Math.floor(input.tripDurationMinutes ?? DEFAULT_TRIP_DURATION_MINUTES));

  const snapTrip = await getDocs(
    query(
      ref,
      where("tripId", "==", tripId),
      where("date", "==", date),
      where("heure", "==", heure),
      where("status", "in", ["planned", "validated"]),
      limit(25)
    )
  );
  const tripConflicts = snapTrip.docs.filter((d) => d.id !== excludeId);
  if (tripConflicts.length > 0) {
    throw new Error(TRIP_PLANNING_ERROR_TRIP_SLOT_TAKEN);
  }

  const snapVeh = await getDocs(
    query(
      ref,
      where("vehicleId", "==", vehicleId),
      where("date", "==", date),
      where("status", "in", ["planned", "validated"]),
      limit(40)
    )
  );
  const tripDurationCache: Record<string, number> = {};
  for (const d of snapVeh.docs) {
    if (d.id === excludeId) continue;
    const o = d.data() as TripAssignmentDoc;

    const otherTripId = String(o.tripId ?? "").trim();
    let otherDur = o.tripDurationMinutes;
    if (!Number.isFinite(otherDur) || (otherDur ?? 0) <= 0) {
      if (!otherTripId) continue;
      otherDur =
        tripDurationCache[otherTripId] ??
        (await fetchWeeklyTripDurationMinutes(companyId, agencyId, otherTripId));
      tripDurationCache[otherTripId] = otherDur;
    }

    if (
      assignmentTimeRangesOverlap(date, heure, dur, {
        ...o,
        tripDurationMinutes: Math.max(1, Math.floor(otherDur as number)),
      })
    ) {
      throw new Error(TRIP_PLANNING_ERROR_VEHICLE_BUSY);
    }
  }
}

export function subscribeTripAssignmentsForDate(
  companyId: string,
  agencyId: string,
  date: string,
  onData: (rows: Array<TripAssignmentDoc & { id: string }>) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const ref = tripAssignmentsCollectionRef(companyId, agencyId);
  const q = query(ref, where("date", "==", date), where("status", "in", ["planned", "validated"]));
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TripAssignmentDoc) }));
      onData(rows);
    },
    (err) => onError?.(err)
  );
}

/** Taille max des affectations « à venir » par écoute temps réel (scalabilité). */
export const FUTURE_ASSIGNMENTS_LISTENER_LIMIT = 250;

export type TripAssignmentsFromDatePayload = {
  rows: Array<TripAssignmentDoc & { id: string }>;
  /** True si au moins `FUTURE_ASSIGNMENTS_LISTENER_LIMIT` docs — afficher un avertissement troncature. */
  capped: boolean;
};

/**
 * Affectations planned|validated à partir d’une date ISO (>=), agence courante — filtre côté serveur + limite.
 */
export function subscribeTripAssignmentsFromDate(
  companyId: string,
  agencyId: string,
  fromDateIso: string,
  onData: (payload: TripAssignmentsFromDatePayload) => void,
  onError?: (e: Error) => void
): Unsubscribe {
  const ref = tripAssignmentsCollectionRef(companyId, agencyId);
  const q = query(
    ref,
    where("date", ">=", fromDateIso),
    where("status", "in", ["planned", "validated"]),
    orderBy("date"),
    limit(FUTURE_ASSIGNMENTS_LISTENER_LIMIT)
  );
  return onSnapshot(
    q,
    (snap) => {
      onData({
        rows: snap.docs.map((d) => ({ id: d.id, ...(d.data() as TripAssignmentDoc) })),
        capped: snap.docs.length >= FUTURE_ASSIGNMENTS_LISTENER_LIMIT,
      });
    },
    (err) => onError?.(err)
  );
}

export async function listValidatedTripAssignmentsForDate(
  companyId: string,
  agencyId: string,
  date: string
): Promise<Array<TripAssignmentDoc & { id: string }>> {
  const ref = tripAssignmentsCollectionRef(companyId, agencyId);
  const q = query(ref, where("date", "==", date), where("status", "==", "validated"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TripAssignmentDoc) }));
}

/** Embarquement / tableau des départs : source unique planification (planned + validated). */
export async function listBoardingTripAssignmentsForDate(
  companyId: string,
  agencyId: string,
  date: string
): Promise<Array<TripAssignmentDoc & { id: string }>> {
  const ref = tripAssignmentsCollectionRef(companyId, agencyId);
  const q = query(
    ref,
    where("date", "==", date),
    where("status", "in", ["planned", "validated"]),
    limit(200)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TripAssignmentDoc) }));
}

/**
 * Total places (sièges) des réservations « embarquables » pour le créneau (trajet hebdo + date + heure).
 * Utilisé pour liveStatus.expectedCount à la création de l’affectation.
 */
export async function countExpectedReservationsForTripSlot(
  companyId: string,
  agencyId: string,
  params: { tripId: string; date: string; heure: string }
): Promise<number> {
  const heureNorm = String(params.heure ?? "").trim();
  const reservationsCol = collection(db, "companies", companyId, "agences", agencyId, "reservations");
  const statuts = [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"] as string[];

  const weeklyRef = doc(db, "companies", companyId, "agences", agencyId, "weeklyTrips", params.tripId);
  const weeklySnap = await getDoc(weeklyRef);
  const dep = weeklySnap.exists() ? String((weeklySnap.data() as { departure?: string }).departure ?? "").trim() : "";
  const arr = weeklySnap.exists() ? String((weeklySnap.data() as { arrival?: string }).arrival ?? "").trim() : "";

  const seen = new Set<string>();
  let total = 0;

  const addSnap = (snap: Awaited<ReturnType<typeof getDocs>>) => {
    snap.docs.forEach((d) => {
      if (seen.has(d.id)) return;
      seen.add(d.id);
      const seats = Number((d.data() as { seatsGo?: number }).seatsGo) || 1;
      total += seats;
    });
  };

  if (dep && arr) {
    const q1 = query(
      reservationsCol,
      where("date", "==", params.date),
      where("depart", "==", dep),
      where("arrivee", "==", arr),
      where("heure", "==", heureNorm),
      where("statut", "in", statuts),
      limit(500)
    );
    addSnap(await getDocs(q1));
  }

  const q2 = query(
    reservationsCol,
    where("date", "==", params.date),
    where("trajetId", "==", params.tripId),
    where("heure", "==", heureNorm),
    where("statut", "in", statuts),
    limit(500)
  );
  addSnap(await getDocs(q2));

  // Rules expect an integer for liveStatus.expectedCount.
  // Some legacy reservations may contain non-integer seatsGo values.
  return Math.max(0, Math.floor(total));
}

export async function createPlannedTripAssignment(
  companyId: string,
  agencyId: string,
  input: { tripId: string; date: string; heure: string; vehicleId: string }
): Promise<string> {
  const heureNorm = String(input.heure ?? "").trim();
  const vehicleId = String(input.vehicleId ?? "").trim();
  if (!vehicleId) throw new Error("Véhicule invalide.");

  const tripDurationMinutes = await fetchWeeklyTripDurationMinutes(companyId, agencyId, input.tripId);
  await assertNoTripPlanningConflicts(companyId, agencyId, {
    tripId: input.tripId,
    date: input.date,
    heure: heureNorm,
    vehicleId,
    tripDurationMinutes,
  });

  const id = tripAssignmentDocId(input.tripId, input.date, heureNorm);
  const assignmentsCol = tripAssignmentsCollectionRef(companyId, agencyId);
  const slotsCol = tripAssignmentVehicleSlotsCollectionRef(companyId, agencyId);
  const assignmentRef = doc(assignmentsCol, id);
  const vehicleSlotRef = doc(slotsCol, tripAssignmentVehicleSlotDocId(vehicleId, input.date, heureNorm));
  const vehicleDocRef = vehicleRef(companyId, vehicleId);

  const expectedCount = await countExpectedReservationsForTripSlot(companyId, agencyId, {
    tripId: input.tripId,
    date: input.date,
    heure: heureNorm,
  });
  const liveStatusInit: TripAssignmentLiveStatus = {
    boardedCount: 0,
    expectedCount,
    status: "waiting",
  };

  await runTransaction(db, async (transaction) => {
    const aSnap = await transaction.get(assignmentRef);

    if (aSnap.exists()) {
      const prev = aSnap.data() as TripAssignmentDoc;
      if (isBlockingTripAssignmentStatus(prev.status)) {
        throw new Error(TRIP_PLANNING_ERROR_TRIP_SLOT_TAKEN);
      }
      const prevVid = String(prev.vehicleId ?? "").trim();
      if (prevVid && prevVid !== vehicleId) {
        const oldSlotRef = doc(slotsCol, tripAssignmentVehicleSlotDocId(prevVid, input.date, heureNorm));
        const oldSlotSnap = await transaction.get(oldSlotRef);
        if (oldSlotSnap.exists()) {
          const od = oldSlotSnap.data() as { assignmentId?: string };
          if (od.assignmentId === id) {
            transaction.delete(oldSlotRef);
          }
        }
      }
    }

    const vSnap = await transaction.get(vehicleSlotRef);
    if (vSnap.exists()) {
      const vd = vSnap.data() as { assignmentId?: string; status?: string };
      if (isBlockingTripAssignmentStatus(vd.status) && vd.assignmentId !== id) {
        throw new Error(TRIP_PLANNING_ERROR_VEHICLE_BUSY);
      }
    }
    const vehicleSnap = await transaction.get(vehicleDocRef);
    if (!vehicleSnap.exists()) throw new Error("Véhicule introuvable.");
    const vehicleData = vehicleSnap.data() as VehicleDoc & { currentAssignmentId?: string; isArchived?: boolean };
    if (!isVehicleTechnicallyActiveForPlanning(vehicleData)) {
      throw new Error("Véhicule non actif techniquement.");
    }
    if (!isVehicleAssignableOperationally(vehicleData, id)) {
      throw new Error("Véhicule déjà planifié sur une autre affectation.");
    }

    const prevStatus = aSnap.exists() ? (aSnap.data() as TripAssignmentDoc).status : undefined;
    const wasCounted = prevStatus === "planned" || prevStatus === "validated";
    if (!wasCounted) {
      // Best effort outside transaction to avoid blocking planning if aggregate rules diverge.
      // See post-commit scheduleRecomputeCompanyPlanningStats fallback.
    }

    const payload: TripAssignmentDoc = {
      tripId: input.tripId,
      date: input.date,
      heure: heureNorm,
      tripDurationMinutes,
      vehicleId,
      agencyId,
      status: "planned",
      liveStatus: liveStatusInit,
    };

    const now = serverTimestamp();
    if (aSnap.exists()) {
      const prevCreated = (aSnap.data() as TripAssignmentDoc & { createdAt?: unknown }).createdAt;
      transaction.set(assignmentRef, {
        ...payload,
        createdAt: prevCreated ?? now,
        updatedAt: now,
      });
    } else {
      transaction.set(assignmentRef, {
        ...payload,
        createdAt: now,
        updatedAt: now,
      });
    }

    transaction.set(vehicleSlotRef, {
      assignmentId: id,
      vehicleId,
      tripId: input.tripId,
      date: input.date,
      heure: heureNorm,
      status: "planned",
      updatedAt: now,
    });
    // Do not block assignment creation on fleet mirror update permissions.
    // Fleet consistency is reconciled by planner/fleet flows and periodic recompute.
  });

  // Safety net: keep aggregates consistent even if incremental update is skipped.
  scheduleRecomputeCompanyPlanningStats(companyId);

  // Notification logistique (non bloquante) : nouvelle demande "planned" à traiter.
  void notifyLogisticsPlanningCreated({
    companyId,
    agencyId,
    assignmentId: id,
    tripId: input.tripId,
    date: input.date,
    heure: heureNorm,
    vehicleId,
  }).catch((e) => {
    console.warn("[tripAssignmentService] notifyLogisticsPlanningCreated failed:", e);
  });

  return id;
}

export async function validateTripAssignment(
  companyId: string,
  agencyId: string,
  assignmentId: string
): Promise<void> {
  const assignmentsCol = tripAssignmentsCollectionRef(companyId, agencyId);
  const slotsCol = tripAssignmentVehicleSlotsCollectionRef(companyId, agencyId);
  const assignmentRef = doc(assignmentsCol, assignmentId);

  await runTransaction(db, async (transaction) => {
    const aSnap = await transaction.get(assignmentRef);
    if (!aSnap.exists()) throw new Error("Affectation introuvable.");
    const data = aSnap.data() as TripAssignmentDoc;
    const heureNorm = String(data.heure ?? "").trim();
    const vehicleSlotRef = doc(
      slotsCol,
      tripAssignmentVehicleSlotDocId(data.vehicleId, data.date, heureNorm)
    );
    const vSnap = await transaction.get(vehicleSlotRef);
    const now = serverTimestamp();

    transaction.update(assignmentRef, {
      status: "validated",
      validatedAt: now,
      updatedAt: now,
    });

    if (vSnap.exists()) {
      const vd = vSnap.data() as { assignmentId?: string };
      if (vd.assignmentId === assignmentId) {
        transaction.update(vehicleSlotRef, {
          status: "validated",
          updatedAt: now,
        });
      }
    } else {
      transaction.set(vehicleSlotRef, {
        assignmentId,
        vehicleId: data.vehicleId,
        tripId: data.tripId,
        date: data.date,
        heure: heureNorm,
        status: "validated",
        updatedAt: now,
      });
    }
  });
}

/** Annulation chef / superviseur : planned/validated -> cancelled, libère le créneau miroir véhicule, stats −1 (si date future). */
export async function cancelPlannedTripAssignment(
  companyId: string,
  agencyId: string,
  assignmentId: string
): Promise<void> {
  const assignmentsCol = tripAssignmentsCollectionRef(companyId, agencyId);
  const slotsCol = tripAssignmentVehicleSlotsCollectionRef(companyId, agencyId);
  const assignmentRef = doc(assignmentsCol, assignmentId);

  await runTransaction(db, async (transaction) => {
    const aSnap = await transaction.get(assignmentRef);
    if (!aSnap.exists()) throw new Error("Affectation introuvable.");
    const data = aSnap.data() as TripAssignmentDoc;
    if (data.status !== "planned" && data.status !== "validated") {
      throw new Error("Seules les affectations planifiées ou validées peuvent être annulées.");
    }

    const heureNorm = String(data.heure ?? "").trim();
    const vehicleSlotRef = doc(slotsCol, tripAssignmentVehicleSlotDocId(data.vehicleId, data.date, heureNorm));
    const vSnap = await transaction.get(vehicleSlotRef);
    const currentVehicleRef = vehicleRef(companyId, data.vehicleId);
    const currentVehicleSnap = await transaction.get(currentVehicleRef);
    const now = serverTimestamp();
    await applyPlanningStatsDecrementRemove(transaction, companyId, data.vehicleId, data.date);

    if (vSnap.exists()) {
      const vd = vSnap.data() as { assignmentId?: string };
      if (vd.assignmentId === assignmentId) {
        transaction.delete(vehicleSlotRef);
      }
    }
    if (currentVehicleSnap.exists()) {
      const vd = currentVehicleSnap.data() as { currentAssignmentId?: string };
      if (String(vd.currentAssignmentId ?? "") === assignmentId) {
        transaction.update(currentVehicleRef, {
          currentAssignmentId: null,
          updatedAt: now,
        });
      }
    }

    transaction.update(assignmentRef, {
      status: "cancelled",
      updatedAt: now,
    });
  });
}

/** Changement de véhicule tant que l’affectation n’est pas encore validée par la logistique. */
export async function updatePlannedTripAssignmentVehicle(
  companyId: string,
  agencyId: string,
  assignmentId: string,
  vehicleId: string
): Promise<void> {
  const assignmentsCol = tripAssignmentsCollectionRef(companyId, agencyId);
  const slotsCol = tripAssignmentVehicleSlotsCollectionRef(companyId, agencyId);
  const assignmentRef = doc(assignmentsCol, assignmentId);
  const nextVehicleId = String(vehicleId ?? "").trim();
  if (!nextVehicleId) throw new Error("Véhicule invalide.");

  const preSnap = await getDoc(assignmentRef);
  if (!preSnap.exists()) throw new Error("Affectation introuvable.");
  const pre = preSnap.data() as TripAssignmentDoc;
  if (pre.status !== "planned") {
    throw new Error("Seules les affectations en attente de validation peuvent être modifiées.");
  }
  const tripDurationMinutes =
    pre.tripDurationMinutes ??
    (await fetchWeeklyTripDurationMinutes(companyId, agencyId, pre.tripId));

  await assertNoTripPlanningConflicts(companyId, agencyId, {
    tripId: pre.tripId,
    date: pre.date,
    heure: pre.heure,
    vehicleId: nextVehicleId,
    excludeAssignmentId: assignmentId,
    tripDurationMinutes,
  });

  await runTransaction(db, async (transaction) => {
    const aSnap = await transaction.get(assignmentRef);
    if (!aSnap.exists()) throw new Error("Affectation introuvable.");
    const data = aSnap.data() as TripAssignmentDoc;
    if (data.status !== "planned") {
      throw new Error("Seules les affectations en attente de validation peuvent être modifiées.");
    }

    const date = data.date;
    const heureNorm = String(data.heure ?? "").trim();
    const oldVid = String(data.vehicleId ?? "").trim();
    const now = serverTimestamp();
    const newVehicleRef = vehicleRef(companyId, nextVehicleId);
    const oldVehicleRef = vehicleRef(companyId, oldVid);
    const [newVehicleSnap, oldVehicleSnap] = await Promise.all([
      transaction.get(newVehicleRef),
      transaction.get(oldVehicleRef),
    ]);

    if (!newVehicleSnap.exists()) throw new Error("Véhicule introuvable.");
    const newVehicleData = newVehicleSnap.data() as VehicleDoc & { currentAssignmentId?: string; isArchived?: boolean };
    if (!isVehicleTechnicallyActiveForPlanning(newVehicleData)) {
      throw new Error("Véhicule non actif techniquement.");
    }
    if (!isVehicleAssignableOperationally(newVehicleData, assignmentId)) {
      throw new Error("Véhicule déjà planifié sur une autre affectation.");
    }

    if (nextVehicleId === oldVid) {
      transaction.update(assignmentRef, {
        vehicleId: nextVehicleId,
        updatedAt: now,
      });
      const sameSlotRef = doc(slotsCol, tripAssignmentVehicleSlotDocId(nextVehicleId, date, heureNorm));
      const sameSnap = await transaction.get(sameSlotRef);
      if (!sameSnap.exists() || (sameSnap.data() as { assignmentId?: string }).assignmentId !== assignmentId) {
        transaction.set(sameSlotRef, {
          assignmentId,
          vehicleId: nextVehicleId,
          tripId: data.tripId,
          date,
          heure: heureNorm,
          status: "planned",
          updatedAt: now,
        });
      }
      if (newVehicleSnap.exists()) {
        transaction.update(newVehicleRef, {
          currentAssignmentId: assignmentId,
          updatedAt: now,
        });
      }
      return;
    }

    const newSlotRef = doc(slotsCol, tripAssignmentVehicleSlotDocId(nextVehicleId, date, heureNorm));
    const newSnap = await transaction.get(newSlotRef);
    if (newSnap.exists()) {
      const nd = newSnap.data() as { assignmentId?: string; status?: string };
      if (isBlockingTripAssignmentStatus(nd.status) && nd.assignmentId !== assignmentId) {
        throw new Error(TRIP_PLANNING_ERROR_VEHICLE_BUSY);
      }
    }

    const oldSlotRef = doc(slotsCol, tripAssignmentVehicleSlotDocId(oldVid, date, heureNorm));
    const oldSnap = await transaction.get(oldSlotRef);
    if (oldSnap.exists()) {
      const od = oldSnap.data() as { assignmentId?: string };
      if (od.assignmentId === assignmentId) {
        transaction.delete(oldSlotRef);
      }
    }

    await applyPlanningStatsVehicleChange(transaction, companyId, oldVid, nextVehicleId, date);

    transaction.update(assignmentRef, {
      vehicleId: nextVehicleId,
      updatedAt: now,
    });

    transaction.set(newSlotRef, {
      assignmentId,
      vehicleId: nextVehicleId,
      tripId: data.tripId,
      date,
      heure: heureNorm,
      status: "planned",
      updatedAt: now,
    });
    transaction.update(newVehicleRef, {
      currentAssignmentId: assignmentId,
      updatedAt: now,
    });
    if (oldVehicleSnap.exists()) {
      const oldVehicleData = oldVehicleSnap.data() as { currentAssignmentId?: string };
      if (String(oldVehicleData.currentAssignmentId ?? "") === assignmentId) {
        transaction.update(oldVehicleRef, {
          currentAssignmentId: null,
          updatedAt: now,
        });
      }
    }
  });
}

export async function getVehicleCapacity(
  companyId: string,
  vehicleId: string
): Promise<number | null> {
  const snap = await getDoc(vehicleRef(companyId, vehicleId));
  if (!snap.exists()) return null;
  const v = snap.data() as VehicleDoc;
  const cap = v.capacity;
  return typeof cap === "number" && cap > 0 ? cap : null;
}

/**
 * Prend le verrou d’embarquement sur l’affectation (une session active par assignment).
 * Même navigateur (même clientInstanceId) : idempotent (rafraîchit startedAt).
 */
export async function startBoardingSessionLock(
  companyId: string,
  agencyId: string,
  assignmentId: string,
  uid: string,
  clientInstanceId: string
): Promise<void> {
  if (BOARDING_LOCKS_DISABLED) return;
  const assignmentRef = doc(db, "companies", companyId, "agences", agencyId, "tripAssignments", assignmentId);
  const now = serverTimestamp();

  await runTransaction(db, async (transaction) => {
    const aSnap = await transaction.get(assignmentRef);
    if (!aSnap.exists()) throw new Error("Affectation introuvable.");
    const data = aSnap.data() as TripAssignmentDoc;
    if (data.status !== "planned" && data.status !== "validated") {
      throw new Error("Affectation non utilisable pour l’embarquement.");
    }
    const prev = data.boardingSession;
    if (prev?.status === "active") {
      if (prev.clientInstanceId === clientInstanceId && prev.startedBy === uid) {
        transaction.update(assignmentRef, {
          boardingSession: {
            startedBy: uid,
            startedAt: now,
            status: "active",
            clientInstanceId,
          },
          updatedAt: now,
        });
        return;
      }
      throw new Error(BOARDING_SESSION_IN_USE_MSG);
    }
    transaction.update(assignmentRef, {
      boardingSession: {
        startedBy: uid,
        startedAt: now,
        status: "active",
        clientInstanceId,
      },
      updatedAt: now,
    });
  });
}

/** Libère le verrou (fin de session / navigation) — uniquement si clientInstanceId correspond. */
export async function closeBoardingSessionLock(
  companyId: string,
  agencyId: string,
  assignmentId: string,
  clientInstanceId: string
): Promise<void> {
  if (BOARDING_LOCKS_DISABLED) return;
  const assignmentRef = doc(db, "companies", companyId, "agences", agencyId, "tripAssignments", assignmentId);
  const now = serverTimestamp();

  await runTransaction(db, async (transaction) => {
    const aSnap = await transaction.get(assignmentRef);
    if (!aSnap.exists()) return;
    const data = aSnap.data() as TripAssignmentDoc;
    const prev = data.boardingSession;
    if (!prev || prev.status !== "active" || prev.clientInstanceId !== clientInstanceId) return;
    transaction.update(assignmentRef, {
      boardingSession: {
        startedBy: prev.startedBy,
        startedAt: prev.startedAt,
        status: "closed",
        clientInstanceId: prev.clientInstanceId,
        closedAt: now,
      },
      updatedAt: now,
    });
  });
}
