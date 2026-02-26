// src/modules/agence/aggregates/boardingStats.ts
// Phase 4.5: boardingStats updated only inside boarding transactions.
import type { DocumentReference, Transaction } from "firebase/firestore";
import { doc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { boardingStatsKey } from "./types";

const COLLECTION = "boardingStats";

function boardingStatsRef(companyId: string, agencyId: string, tripKey: string) {
  return doc(db, `companies/${companyId}/agences/${agencyId}/${COLLECTION}/${tripKey}`);
}

/** For use in transactions that need to read the doc (e.g. capacity check). */
export function getBoardingStatsRef(companyId: string, agencyId: string, tripKey: string) {
  return boardingStatsRef(companyId, agencyId, tripKey);
}

/**
 * Create boardingStats document for this trip (call only when doc does not exist).
 * Use after tx.get(ref) and !snap.exists(). Then use incrementBoardingStatsEmbarked to add seats.
 */
export function createBoardingStats(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  tripKey: string,
  payload: {
    tripId: string | null;
    date: string;
    heure: string;
    vehicleCapacity: number;
  }
): void {
  const ref = boardingStatsRef(companyId, agencyId, tripKey);
  tx.set(ref, {
    tripId: payload.tripId,
    date: payload.date,
    heure: payload.heure,
    vehicleCapacity: payload.vehicleCapacity,
    embarkedSeats: 0,
    absentSeats: 0,
    status: "open",
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

/**
 * Increment embarkedSeats. Call only after verifying capacity in same transaction
 * (read boardingStats, ensure embarkedSeats + addSeats <= vehicleCapacity).
 */
export function incrementBoardingStatsEmbarked(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  tripKey: string,
  addSeats: number
): void {
  if (addSeats <= 0) return;
  const ref = boardingStatsRef(companyId, agencyId, tripKey);
  tx.update(ref, {
    embarkedSeats: increment(addSeats),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Mark boarding as closed and set absentSeats. Call inside closure transaction.
 */
export function setBoardingStatsClosed(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  tripKey: string,
  absentSeats: number
): void {
  const ref = boardingStatsRef(companyId, agencyId, tripKey);
  tx.set(ref, {
    status: "closed",
    absentSeats,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export { boardingStatsKey };
