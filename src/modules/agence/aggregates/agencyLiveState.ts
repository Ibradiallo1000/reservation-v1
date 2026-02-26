// src/modules/agence/aggregates/agencyLiveState.ts
// Phase 4.5: Single document agencyLiveState/current updated via increment (idempotent with trigger transaction).
import type { Transaction } from "firebase/firestore";
import { doc, serverTimestamp, increment } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const DOC_PATH = "agencyLiveState/current";

function agencyLiveStateRef(companyId: string, agencyId: string) {
  return doc(db, `companies/${companyId}/agences/${agencyId}/${DOC_PATH}`);
}

/** Call inside transaction when a session becomes ACTIVE (opened). */
export function updateAgencyLiveStateOnSessionOpened(
  tx: Transaction,
  companyId: string,
  agencyId: string
): void {
  const ref = agencyLiveStateRef(companyId, agencyId);
  tx.set(ref, {
    companyId,
    agencyId,
    activeSessionsCount: increment(1),
    closedPendingValidationCount: increment(0),
    vehiclesInTransitCount: increment(0),
    boardingOpenCount: increment(0),
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Call inside transaction when a session moves to CLOSED. */
export function updateAgencyLiveStateOnSessionClosed(
  tx: Transaction,
  companyId: string,
  agencyId: string
): void {
  const ref = agencyLiveStateRef(companyId, agencyId);
  tx.set(ref, {
    companyId,
    agencyId,
    activeSessionsCount: increment(-1),
    closedPendingValidationCount: increment(1),
    vehiclesInTransitCount: increment(0),
    boardingOpenCount: increment(0),
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Call inside transaction when a session is VALIDATED. */
export function updateAgencyLiveStateOnSessionValidated(
  tx: Transaction,
  companyId: string,
  agencyId: string
): void {
  const ref = agencyLiveStateRef(companyId, agencyId);
  tx.set(ref, {
    companyId,
    agencyId,
    activeSessionsCount: increment(0),
    closedPendingValidationCount: increment(-1),
    vehiclesInTransitCount: increment(0),
    boardingOpenCount: increment(0),
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Call inside transaction when a boarding is opened (first use of trip for boarding). */
export function updateAgencyLiveStateOnBoardingOpened(
  tx: Transaction,
  companyId: string,
  agencyId: string
): void {
  const ref = agencyLiveStateRef(companyId, agencyId);
  tx.set(ref, {
    companyId,
    agencyId,
    activeSessionsCount: increment(0),
    closedPendingValidationCount: increment(0),
    vehiclesInTransitCount: increment(0),
    boardingOpenCount: increment(1),
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Call inside transaction when a boarding is closed. */
export function updateAgencyLiveStateOnBoardingClosed(
  tx: Transaction,
  companyId: string,
  agencyId: string
): void {
  const ref = agencyLiveStateRef(companyId, agencyId);
  tx.set(ref, {
    companyId,
    agencyId,
    activeSessionsCount: increment(0),
    closedPendingValidationCount: increment(0),
    vehiclesInTransitCount: increment(0),
    boardingOpenCount: increment(-1),
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true });
}

/** Call inside transaction when a vehicle transitions to in_transit. */
export function updateAgencyLiveStateOnVehicleInTransit(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  delta: number
): void {
  if (delta === 0) return;
  const ref = agencyLiveStateRef(companyId, agencyId);
  tx.set(ref, {
    companyId,
    agencyId,
    activeSessionsCount: increment(0),
    closedPendingValidationCount: increment(0),
    vehiclesInTransitCount: increment(delta),
    boardingOpenCount: increment(0),
    lastUpdatedAt: serverTimestamp(),
  }, { merge: true });
}
