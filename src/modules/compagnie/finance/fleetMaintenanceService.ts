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
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FleetMaintenanceDoc, FleetMaintenanceDocCreate } from "./fleetMaintenanceTypes";
import { FLEET_MAINTENANCE_COLLECTION } from "./fleetMaintenanceTypes";
import { createExpense } from "@/modules/compagnie/treasury/expenses";

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
  const amount = Number(input.costAmount ?? 0);
  const shouldCreateExpense = Number.isFinite(amount) && amount > 0;
  if (shouldCreateExpense && !input.accountId) {
    throw new Error("accountId est requis pour créer la dépense de maintenance.");
  }

  const ref = doc(fleetMaintenanceRef(companyId));
  const now = Timestamp.now();
  await setDoc(ref, {
    vehicleId: input.vehicleId,
    agencyId: input.agencyId,
    description: input.description,
    costType: input.costType,
    costAmount: shouldCreateExpense ? amount : null,
    accountId: input.accountId ?? null,
    linkedExpenseId: input.linkedExpenseId ?? null,
    linkedPayableId: input.linkedPayableId ?? null,
    createdBy: input.createdBy,
    createdAt: now,
  });

  if (shouldCreateExpense) {
    const expenseId = await createExpense({
      companyId,
      agencyId: input.agencyId,
      category: "maintenance",
      expenseCategory: "maintenance",
      description: `Maintenance véhicule ${input.vehicleId}: ${input.description}`,
      amount,
      accountId: input.accountId as string,
      createdBy: input.createdBy,
      vehicleId: input.vehicleId,
      linkedMaintenanceId: ref.id,
    });
    await updateDoc(ref, {
      linkedExpenseId: expenseId,
      updatedAt: serverTimestamp(),
    });
  }

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
