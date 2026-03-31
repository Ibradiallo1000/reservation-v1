import { collection, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { vehicleRef } from "./vehiclesService";
import type { VehicleDoc, VehicleOperationStatus } from "./vehicleTypes";
import { OPERATIONAL_STATUS } from "./vehicleTransitions";
import type { TripExecutionDoc, TripExecutionStatus } from "../tripExecutions/tripExecutionTypes";

const ALLOWED_TRANSITIONS: Record<VehicleOperationStatus, VehicleOperationStatus[]> = {
  idle: ["planned"],
  planned: ["boarding", "idle"],
  boarding: ["in_transit"],
  in_transit: ["arrived"],
  arrived: ["idle"],
};

export function isVehicleActiveTechnical(vehicle: Partial<VehicleDoc>): boolean {
  const legacy = String((vehicle as any).status ?? "").toLowerCase();
  if (legacy) return legacy === "active" || legacy === "garage" || legacy === "en_service";
  const tech = String(vehicle.technicalStatus ?? "NORMAL").toUpperCase();
  return tech === "NORMAL";
}

export function deriveOperationStatus(vehicle: Partial<VehicleDoc>): VehicleOperationStatus {
  const explicit = String((vehicle as any).operationStatus ?? "").toLowerCase();
  if (explicit === "idle" || explicit === "planned" || explicit === "boarding" || explicit === "in_transit" || explicit === "arrived") {
    return explicit as VehicleOperationStatus;
  }
  const op = String((vehicle as any).operationalStatus ?? OPERATIONAL_STATUS.GARAGE).toUpperCase();
  if (op === OPERATIONAL_STATUS.EN_TRANSIT) return "in_transit";
  if (op === OPERATIONAL_STATUS.AFFECTE) return "planned";
  return String((vehicle as any).currentAssignmentId ?? "").trim() ? "planned" : "idle";
}

export function canAssignVehicle(vehicle: Partial<VehicleDoc>): boolean {
  return isVehicleActiveTechnical(vehicle) && deriveOperationStatus(vehicle) === "idle";
}

export function canTransitionVehicleOperationStatus(from: VehicleOperationStatus, to: VehicleOperationStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export function mapTripExecutionStatusToVehicleOperationStatus(
  tripStatus: TripExecutionStatus
): VehicleOperationStatus | null {
  if (tripStatus === "boarding") return "boarding";
  if (tripStatus === "departed" || tripStatus === "transit") return "in_transit";
  if (tripStatus === "arrived") return "arrived";
  if (tripStatus === "finished") return "idle";
  return null;
}

export async function setVehicleOperationStatus(params: {
  companyId: string;
  vehicleId: string;
  from?: VehicleOperationStatus | null;
  to: VehicleOperationStatus;
  currentTripId?: string | null;
  currentAssignmentId?: string | null;
  destinationCity?: string | null;
  currentCity?: string | null;
}): Promise<void> {
  const { companyId, vehicleId, to } = params;
  await runTransaction(db, async (tx) => {
    const vRef = vehicleRef(companyId, vehicleId);
    const vSnap = await tx.get(vRef);
    if (!vSnap.exists()) throw new Error("Véhicule introuvable.");
    const vehicle = vSnap.data() as VehicleDoc;
    const current = params.from ?? deriveOperationStatus(vehicle);
    if (!canTransitionVehicleOperationStatus(current, to)) {
      throw new Error(`Transition véhicule interdite: ${current} -> ${to}`);
    }
    tx.update(vRef, {
      operationStatus: to,
      ...(params.currentTripId !== undefined ? { currentTripId: params.currentTripId } : {}),
      ...(params.currentAssignmentId !== undefined ? { currentAssignmentId: params.currentAssignmentId } : {}),
      ...(params.destinationCity !== undefined ? { destinationCity: params.destinationCity } : {}),
      ...(params.currentCity !== undefined ? { currentCity: params.currentCity } : {}),
      updatedAt: serverTimestamp(),
    });
  });
}

export async function syncVehicleWithTripExecution(params: {
  companyId: string;
  tripExecution: TripExecutionDoc;
  tripInstanceId: string;
}): Promise<void> {
  const { companyId, tripExecution, tripInstanceId } = params;
  const target = mapTripExecutionStatusToVehicleOperationStatus(tripExecution.status);
  if (!target) return;

  const vRef = vehicleRef(companyId, tripExecution.vehicleId);
  const teRef = doc(collection(db, "companies", companyId, "tripExecutions"), tripInstanceId);
  await runTransaction(db, async (tx) => {
    const [vSnap, teSnap] = await Promise.all([tx.get(vRef), tx.get(teRef)]);
    if (!vSnap.exists() || !teSnap.exists()) return;
    const vehicle = vSnap.data() as VehicleDoc;
    const te = teSnap.data() as TripExecutionDoc;
    const current = deriveOperationStatus(vehicle);

    if (!isVehicleActiveTechnical(vehicle) && te.status !== "finished") {
      tx.update(teRef, {
        status: "disrupted",
        updatedAt: serverTimestamp(),
      });
      tx.set(doc(collection(db, "companies", companyId, "logisticsActions")), {
        type: "vehicle_disrupted",
        status: "pending",
        vehicleId: tripExecution.vehicleId,
        tripInstanceId,
        tripAssignmentId: te.tripAssignmentId ?? null,
        message: "Véhicule indisponible techniquement. Remplacement ou annulation requis.",
        createdAt: serverTimestamp(),
      });
      return;
    }

    if (current !== target && !canTransitionVehicleOperationStatus(current, target)) {
      return;
    }
    tx.update(vRef, {
      operationStatus: target,
      currentTripId: target === "idle" ? null : te.tripAssignmentId || tripInstanceId,
      currentAssignmentId: target === "idle" ? null : te.tripAssignmentId || null,
      destinationCity: target === "idle" ? null : (te.destinationCity || null),
      currentCity: target === "idle" ? (te.destinationCity || vehicle.currentCity || null) : (vehicle.currentCity ?? null),
      updatedAt: serverTimestamp(),
    });
  });
}
