// Phase C — Fleet maintenance (Enterprise only). Link maintenance to expense or payable.
import {
  collection,
  doc,
  getDoc,
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
import { upsertMaintenanceRequestDocument } from "@/modules/finance/documents/financialDocumentsService";

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
  if (shouldCreateExpense && !input.createdByRole) {
    throw new Error("createdByRole est requis pour créer la dépense de maintenance.");
  }

  const ref = doc(fleetMaintenanceRef(companyId));
  const now = Timestamp.now();
  let registration: string | null = null;
  try {
    const vehicleSnap = await getDoc(doc(db, "companies", companyId, "vehicles", input.vehicleId));
    if (vehicleSnap.exists()) {
      const vehicleData = vehicleSnap.data() as {
        immatriculation?: string;
        matricule?: string;
        registration?: string;
      };
      registration =
        String(
          vehicleData.immatriculation ??
            vehicleData.matricule ??
            vehicleData.registration ??
            ""
        ).trim() || null;
    }
  } catch {
    registration = null;
  }
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
  await upsertMaintenanceRequestDocument({
    companyId,
    agencyId: input.agencyId ?? null,
    sourceType: "fleet_maintenance",
    sourceId: ref.id,
    vehicle: input.vehicleId ?? null,
    registration,
    incidentType:
      input.costType === "credit"
        ? "approvisionnement"
        : "maintenance",
    urgency: "normale",
    requiredItems: input.description ?? null,
    estimatedAmount: shouldCreateExpense ? amount : null,
    currency: "XOF",
    proposedSupplier: null,
    requester: {
      uid: input.createdBy,
      role: input.createdByRole ?? "requester",
    },
    expectedValidation: "validation operationnelle et financiere",
    linkedExpenseId: input.linkedExpenseId ?? null,
    linkedPayableId: input.linkedPayableId ?? null,
    observations: "Demande maintenance/approvisionnement creee.",
    status: "draft",
    createdByUid: input.createdBy,
  }).catch((docError) => {
    console.error("[fleetMaintenance] echec creation document demande", {
      companyId,
      maintenanceId: ref.id,
      docError,
    });
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
      createdByRole: input.createdByRole as string,
      vehicleId: input.vehicleId,
      linkedMaintenanceId: ref.id,
    });
    await updateDoc(ref, {
      linkedExpenseId: expenseId,
      updatedAt: serverTimestamp(),
    });
    await upsertMaintenanceRequestDocument({
      companyId,
      agencyId: input.agencyId ?? null,
      sourceType: "fleet_maintenance",
      sourceId: ref.id,
      vehicle: input.vehicleId ?? null,
      registration,
      incidentType: "maintenance",
      urgency: "normale",
      requiredItems: input.description ?? null,
      estimatedAmount: amount,
      currency: "XOF",
      proposedSupplier: null,
      requester: {
        uid: input.createdBy,
        role: input.createdByRole ?? "requester",
      },
      expectedValidation: "depense de maintenance en cours",
      linkedExpenseId: expenseId,
      linkedPayableId: input.linkedPayableId ?? null,
      observations: "Depense de maintenance liee a la demande.",
      status: "ready_to_print",
      createdByUid: input.createdBy,
    }).catch((docError) => {
      console.error("[fleetMaintenance] echec maj document demande apres depense", {
        companyId,
        maintenanceId: ref.id,
        expenseId,
        docError,
      });
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

