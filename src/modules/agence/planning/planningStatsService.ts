/**
 * Agrégats planification compagnie : companies/{companyId}/planningStats/current
 * Mise à jour incrémentale (totalTrips, totalPlannedVehicles) + compteur par véhicule
 * companies/{companyId}/planningVehicleTripCount/{vehicleId}
 * Recalcul complet = fallback (réparation / troncature).
 */
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  orderBy,
  limit,
  startAfter,
  serverTimestamp,
  increment,
  type DocumentSnapshot,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export const PLANNING_STATS_DOC_ID = "current";

export type PlanningStatsDoc = {
  totalPlannedVehicles: number;
  totalTrips: number;
  updatedAt?: unknown;
  recomputeCapped?: boolean;
};

export function planningStatsDocRef(companyId: string) {
  return doc(db, "companies", companyId, "planningStats", PLANNING_STATS_DOC_ID);
}

export function planningVehicleTripCountRef(companyId: string, vehicleId: string) {
  return doc(db, "companies", companyId, "planningVehicleTripCount", vehicleId);
}

function todayIso(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}

/** Affectations futures (date >= aujourd’hui) : incrémente compteurs agrégés. */
export async function applyPlanningStatsIncrementCreate(
  transaction: Transaction,
  companyId: string,
  vehicleId: string,
  assignmentDate: string
): Promise<void> {
  if (assignmentDate < todayIso()) return;
  const vid = String(vehicleId ?? "").trim();
  if (!vid) return;

  const statsRef = planningStatsDocRef(companyId);
  const usageRef = planningVehicleTripCountRef(companyId, vid);

  const [statsSnap, usageSnap] = await Promise.all([transaction.get(statsRef), transaction.get(usageRef)]);

  const prev = usageSnap.exists() ? Number((usageSnap.data() as { count?: number }).count ?? 0) : 0;

  if (!statsSnap.exists()) {
    transaction.set(statsRef, {
      totalTrips: 1,
      totalPlannedVehicles: prev === 0 ? 1 : 0,
      updatedAt: serverTimestamp(),
      recomputeCapped: false,
    });
  } else {
    transaction.update(statsRef, {
      totalTrips: increment(1),
      ...(prev === 0 ? { totalPlannedVehicles: increment(1) } : {}),
      updatedAt: serverTimestamp(),
    });
  }

  if (usageSnap.exists()) {
    transaction.update(usageRef, { count: increment(1), updatedAt: serverTimestamp() });
  } else {
    transaction.set(usageRef, { count: 1, updatedAt: serverTimestamp() });
  }
}

/** Suppression / annulation d’une affectation future comptée dans les stats. */
export async function applyPlanningStatsDecrementRemove(
  transaction: Transaction,
  companyId: string,
  vehicleId: string,
  assignmentDate: string
): Promise<void> {
  if (assignmentDate < todayIso()) return;
  const vid = String(vehicleId ?? "").trim();
  if (!vid) return;

  const statsRef = planningStatsDocRef(companyId);
  const usageRef = planningVehicleTripCountRef(companyId, vid);

  const [statsSnap, usageSnap] = await Promise.all([transaction.get(statsRef), transaction.get(usageRef)]);
  if (!statsSnap.exists() || !usageSnap.exists()) return;

  const prev = Math.max(0, Number((usageSnap.data() as { count?: number }).count ?? 0));
  if (prev <= 0) return;

  if (prev <= 1) {
    transaction.delete(usageRef);
    transaction.update(statsRef, {
      totalTrips: increment(-1),
      totalPlannedVehicles: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } else {
    transaction.update(usageRef, { count: increment(-1), updatedAt: serverTimestamp() });
    transaction.update(statsRef, {
      totalTrips: increment(-1),
      updatedAt: serverTimestamp(),
    });
  }
}

/** Changement de véhicule sur affectation future (planned). */
export async function applyPlanningStatsVehicleChange(
  transaction: Transaction,
  companyId: string,
  oldVehicleId: string,
  newVehicleId: string,
  assignmentDate: string
): Promise<void> {
  if (assignmentDate < todayIso()) return;
  const o = String(oldVehicleId ?? "").trim();
  const n = String(newVehicleId ?? "").trim();
  if (!o || !n || o === n) return;

  await applyPlanningStatsDecrementRemove(transaction, companyId, o, assignmentDate);
  await applyPlanningStatsIncrementCreate(transaction, companyId, n, assignmentDate);
}

const PAGE = 200;
const MAX_PAGES = 50;

/**
 * Recalcul complet (fallback) : totalTrips, totalPlannedVehicles distincts, reset compteurs véhicule non géré ici
 * (les docs planningVehicleTripCount peuvent diverger — option : supprimer sous-collection en admin).
 */
export async function recomputeCompanyPlanningStats(companyId: string): Promise<void> {
  const t0 = todayIso();
  const agSnap = await getDocs(collection(db, "companies", companyId, "agences"));
  const vehicleIds = new Set<string>();
  let totalTrips = 0;
  let recomputeCapped = false;

  for (const ag of agSnap.docs) {
    const taCol = collection(db, "companies", companyId, "agences", ag.id, "tripAssignments");
    let last: DocumentSnapshot | undefined;
    let pages = 0;
    while (true) {
      if (pages >= MAX_PAGES) {
        recomputeCapped = true;
        break;
      }
      const q = last
        ? query(
            taCol,
            where("date", ">=", t0),
            where("status", "in", ["planned", "validated"]),
            orderBy("date"),
            startAfter(last),
            limit(PAGE)
          )
        : query(
            taCol,
            where("date", ">=", t0),
            where("status", "in", ["planned", "validated"]),
            orderBy("date"),
            limit(PAGE)
          );
      const snap = await getDocs(q);
      if (snap.empty) break;
      snap.docs.forEach((d) => {
        totalTrips += 1;
        const vid = (d.data() as { vehicleId?: string }).vehicleId;
        if (vid) vehicleIds.add(String(vid));
      });
      last = snap.docs[snap.docs.length - 1];
      pages += 1;
      if (snap.docs.length < PAGE) break;
    }
  }

  await setDoc(
    planningStatsDocRef(companyId),
    {
      totalPlannedVehicles: vehicleIds.size,
      totalTrips,
      recomputeCapped,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function scheduleRecomputeCompanyPlanningStats(companyId: string): void {
  if (!companyId) return;
  void recomputeCompanyPlanningStats(companyId).catch(() => {
    /* ignore */
  });
}
