// src/modules/agence/fleet/fleetStateMachine.ts
// Centralized fleet status transitions and fleetMovements logging.
import { doc, collection, serverTimestamp, runTransaction } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FleetVehicleStatus, FleetMovementDoc } from "./types";
import { canTransition } from "./types";

/**
 * Writes a fleetMovement document. Call after (or inside same transaction as) vehicle update.
 */
export function createFleetMovementPayload(
  vehicleId: string,
  fromAgencyId: string | null,
  toAgencyId: string | null,
  tripId: string | null,
  date: string | null,
  heure: string | null,
  movedBy: string,
  previousStatus: FleetVehicleStatus,
  newStatus: FleetVehicleStatus
): Omit<FleetMovementDoc, "movedAt"> & { movedAt: ReturnType<typeof serverTimestamp> } {
  return {
    vehicleId,
    fromAgencyId,
    toAgencyId,
    tripId,
    date,
    heure,
    movedBy,
    movedAt: serverTimestamp(),
    previousStatus,
    newStatus,
  };
}

/**
 * Transition vehicle from assigned → in_transit (e.g. on boarding closure).
 * Validates transition and optionally writes fleetMovement in the same transaction.
 */
export function buildVehicleTransitionToInTransit(
  currentAgencyId: string,
  destinationAgencyId: string | null,
  movedBy: string
): Record<string, unknown> {
  return {
    status: "in_transit" as FleetVehicleStatus,
    destinationAgencyId: destinationAgencyId ?? null,
    lastMovementAt: serverTimestamp(),
    lastMovementBy: movedBy,
    updatedAt: serverTimestamp(),
  };
}

/**
 * Transition vehicle from in_transit → arrived (at destination agency).
 */
export function buildVehicleTransitionToArrived(
  newCurrentAgencyId: string,
  movedBy: string
): Record<string, unknown> {
  return {
    status: "arrived" as FleetVehicleStatus,
    currentAgencyId: newCurrentAgencyId,
    destinationAgencyId: null,
    lastMovementAt: serverTimestamp(),
    lastMovementBy: movedBy,
    updatedAt: serverTimestamp(),
  };
}

/**
 * Transition vehicle from arrived → garage (reset).
 */
export function buildVehicleTransitionToGarage(movedBy: string): Record<string, unknown> {
  return {
    status: "garage" as FleetVehicleStatus,
    currentAgencyId: null,
    destinationAgencyId: null,
    currentTripId: null,
    currentDate: null,
    currentHeure: null,
    currentDeparture: null,
    currentArrival: null,
    lastMovementAt: serverTimestamp(),
    lastMovementBy: movedBy,
    updatedAt: serverTimestamp(),
  };
}

/**
 * Standalone update of vehicle status with movement log (for Fleet UI).
 * Validates transition; throws if invalid.
 */
export async function transitionVehicleStatus(
  companyId: string,
  vehicleId: string,
  newStatus: FleetVehicleStatus,
  movedBy: string,
  options?: {
    toAgencyId?: string | null;
    date?: string | null;
    heure?: string | null;
    tripId?: string | null;
  }
): Promise<void> {
  const vehicleRef = doc(db, `companies/${companyId}/fleetVehicles/${vehicleId}`);
  const movementRef = doc(collection(db, `companies/${companyId}/fleetMovements`));

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(vehicleRef);
    if (!snap.exists()) throw new Error("Véhicule introuvable");
    const data = snap.data() as { status: FleetVehicleStatus; currentAgencyId?: string | null; destinationAgencyId?: string | null };
    const previousStatus = data.status;
    if (!canTransition(previousStatus, newStatus)) {
      throw new Error(`Transition interdite: ${previousStatus} → ${newStatus}`);
    }

    const fromAgencyId = data.currentAgencyId ?? null;
    const toAgencyId = options?.toAgencyId ?? (newStatus === "arrived" ? fromAgencyId : null);

    let updatePayload: Record<string, unknown> = {
      status: newStatus,
      lastMovementAt: serverTimestamp(),
      lastMovementBy: movedBy,
      updatedAt: serverTimestamp(),
    };
    if (newStatus === "in_transit") {
      updatePayload.destinationAgencyId = options?.toAgencyId ?? null;
    } else if (newStatus === "arrived" && options?.toAgencyId) {
      updatePayload.currentAgencyId = options.toAgencyId;
      updatePayload.destinationAgencyId = null;
    } else if (newStatus === "garage") {
      updatePayload.currentAgencyId = null;
      updatePayload.destinationAgencyId = null;
      updatePayload.currentTripId = null;
      updatePayload.currentDate = null;
      updatePayload.currentHeure = null;
      updatePayload.currentDeparture = null;
      updatePayload.currentArrival = null;
    }

    tx.update(vehicleRef, updatePayload);
    tx.set(movementRef, createFleetMovementPayload(
      vehicleId,
      fromAgencyId,
      toAgencyId,
      options?.tripId ?? null,
      options?.date ?? null,
      options?.heure ?? null,
      movedBy,
      previousStatus,
      newStatus
    ));
  });
}
