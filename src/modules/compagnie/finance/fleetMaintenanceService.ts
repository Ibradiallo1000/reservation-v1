// Phase C — Fleet maintenance (Enterprise only). Link maintenance to expense or payable.
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FleetMaintenanceDoc, FleetMaintenanceDocCreate } from "./fleetMaintenanceTypes";
import { FLEET_MAINTENANCE_COLLECTION } from "./fleetMaintenanceTypes";

function fleetMaintenanceRef(companyId: string) {
  return collection(db, `companies/${companyId}/${FLEET_MAINTENANCE_COLLECTION}`);
}

export function fleetMaintenanceDocRef(companyId: string, maintenanceId: string) {
  return doc(db, `companies/${companyId}/${FLEET_MAINTENANCE_COLLECTION}/${maintenanceId}`);
}

/** Create maintenance record (Enterprise). Links to expense (cash) or payable (credit). */
export async function createFleetMaintenance(
  companyId: string,
  input: FleetMaintenanceDocCreate
): Promise<string> {
  const ref = doc(fleetMaintenanceRef(companyId));
  const now = Timestamp.now();
  await setDoc(ref, {
    vehicleId: input.vehicleId,
    agencyId: input.agencyId,
    description: input.description,
    costType: input.costType,
    linkedExpenseId: input.linkedExpenseId ?? null,
    linkedPayableId: input.linkedPayableId ?? null,
    createdBy: input.createdBy,
    createdAt: now,
  });
  return ref.id;
}

/** List by vehicle or agency. */
export async function listFleetMaintenance(
  companyId: string,
  options?: { vehicleId?: string; agencyId?: string; limitCount?: number }
): Promise<(FleetMaintenanceDoc & { id: string })[]> {
  const ref = fleetMaintenanceRef(companyId);
  const constraints: ReturnType<typeof where>[] = [];
  if (options?.vehicleId) constraints.push(where("vehicleId", "==", options.vehicleId));
  if (options?.agencyId) constraints.push(where("agencyId", "==", options.agencyId));
  const q = query(
    ref,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FleetMaintenanceDoc & { id: string }));
}

export type { FleetMaintenanceDoc, FleetMaintenanceDocCreate };
