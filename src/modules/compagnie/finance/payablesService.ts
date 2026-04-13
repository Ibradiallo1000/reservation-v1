// Phase C — Payables service. No cash movement at creation; ledger only on payment.
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
import type { PayableDoc, PayableDocCreate, PayableStatus, ApprovalStatus } from "./payablesTypes";
import { PAYABLES_COLLECTION } from "./payablesTypes";
import {
  upsertMaintenanceRequestDocument,
  upsertPurchaseOrderDocument,
} from "@/modules/finance/documents/financialDocumentsService";

function payablesRef(companyId: string) {
  return collection(db, `companies/${companyId}/${PAYABLES_COLLECTION}`);
}

export function payableRef(companyId: string, payableId: string) {
  return doc(db, `companies/${companyId}/${PAYABLES_COLLECTION}/${payableId}`);
}

function computeStatus(totalAmount: number, amountPaid: number): PayableStatus {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= totalAmount) return "paid";
  return "partially_paid";
}

function shouldCreateMaintenanceRequestFromPayableCategory(
  category: string
): boolean {
  return category === "maintenance" || category === "parts";
}

async function syncPurchaseOrderDocument(params: {
  companyId: string;
  payableId: string;
  payable: PayableDoc;
  status: "draft" | "ready_to_print" | "archived";
  actorUid?: string | null;
}): Promise<void> {
  try {
    await upsertPurchaseOrderDocument({
      companyId: params.companyId,
      sourceId: params.payableId,
      agenceOuService: params.payable.agencyId ?? "service_central",
      fournisseurNom: params.payable.supplierName ?? null,
      fournisseurTelephone: null,
      referenceDemande: params.payableId,
      listeArticles: params.payable.description ?? null,
      quantites: null,
      prixUnitaires: null,
      totalPrevisionnel: Number(params.payable.totalAmount ?? 0),
      delaiSouhaite:
        params.payable.dueDate == null
          ? null
          : String(params.payable.dueDate),
      responsableCommande: {
        uid: params.payable.createdBy,
        role: "requester",
      },
      validationFinanciere: params.payable.approvedBy
        ? {
            uid: params.payable.approvedBy,
            role: params.payable.approvedByRole ?? "validator",
          }
        : null,
      observations: params.payable.description ?? null,
      status: params.status,
      createdByUid: params.actorUid ?? params.payable.createdBy ?? null,
    });
  } catch (docError) {
    console.error("[payables] echec sync bon de commande", {
      companyId: params.companyId,
      payableId: params.payableId,
      docError,
    });
  }
}

/** Create payable (pending approval). No ledger movement. */
export async function createPayable(
  companyId: string,
  input: PayableDocCreate
): Promise<string> {
  if (input.category === "other") {
    throw new Error("La categorie 'Autre' doit passer par une depense directe, pas par un payable fournisseur.");
  }
  const ref = doc(payablesRef(companyId));
  const totalAmount = Number(input.totalAmount) || 0;
  const now = Timestamp.now();
  const data: Omit<PayableDoc, "updatedAt"> & { updatedAt: ReturnType<typeof serverTimestamp> } = {
    supplierId: input.supplierId ?? null,
    supplierName: input.supplierName,
    vehicleId: input.vehicleId ?? null,
    agencyId: input.agencyId,
    category: input.category,
    description: input.description,
    totalAmount,
    amountPaid: 0,
    remainingAmount: totalAmount,
    status: "pending",
    dueDate: input.dueDate ?? null,
    createdBy: input.createdBy,
    approvalStatus: "pending",
    createdAt: now,
    lastPaymentAt: null,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  await syncPurchaseOrderDocument({
    companyId,
    payableId: ref.id,
    payable: data as PayableDoc,
    status: "draft",
    actorUid: input.createdBy,
  });
  if (shouldCreateMaintenanceRequestFromPayableCategory(input.category)) {
    try {
      await upsertMaintenanceRequestDocument({
        companyId,
        agencyId: input.agencyId ?? null,
        sourceType: "payable",
        sourceId: ref.id,
        vehicle: input.vehicleId ?? null,
        registration: null,
        incidentType:
          input.category === "parts"
            ? "approvisionnement_pieces"
            : "maintenance",
        urgency: "normale",
        requiredItems: input.description ?? null,
        estimatedAmount: totalAmount,
        currency: "XOF",
        proposedSupplier: input.supplierName ?? null,
        requester: {
          uid: input.createdBy,
          role: "requester",
        },
        expectedValidation: "validation comptable / direction",
        linkedExpenseId: null,
        linkedPayableId: ref.id,
        observations: "Demande d'approvisionnement en attente de validation.",
        status: "draft",
        createdByUid: input.createdBy,
      });
    } catch (docError) {
      console.error("[payables] echec creation demande maintenance/approvisionnement", {
        companyId,
        payableId: ref.id,
        docError,
      });
    }
  }
  return ref.id;
}

/** Approve payable (company_accountant | financial_director | admin_compagnie). */
export async function approvePayable(
  companyId: string,
  payableId: string,
  approvedBy: string,
  approvedByRole?: string | null
): Promise<void> {
  const ref = payableRef(companyId, payableId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Compte a payer introuvable.");
  const payable = snap.data() as PayableDoc;
  await updateDoc(ref, {
    approvalStatus: "approved" as ApprovalStatus,
    approvedBy,
    approvedAt: serverTimestamp(),
    approvedByRole: approvedByRole ?? null,
    updatedAt: serverTimestamp(),
  });
  await syncPurchaseOrderDocument({
    companyId,
    payableId,
    payable: {
      ...payable,
      approvedBy,
      approvedByRole: approvedByRole ?? null,
    } as PayableDoc,
    status: "ready_to_print",
    actorUid: approvedBy,
  });
  if (shouldCreateMaintenanceRequestFromPayableCategory(payable.category)) {
    try {
      await upsertMaintenanceRequestDocument({
        companyId,
        agencyId: payable.agencyId ?? null,
        sourceType: "payable",
        sourceId: payableId,
        vehicle: payable.vehicleId ?? null,
        registration: null,
        incidentType:
          payable.category === "parts"
            ? "approvisionnement_pieces"
            : "maintenance",
        urgency: "normale",
        requiredItems: payable.description ?? null,
        estimatedAmount: Number(payable.totalAmount ?? 0),
        currency: "XOF",
        proposedSupplier: payable.supplierName ?? null,
        requester: {
          uid: payable.createdBy,
          role: "requester",
        },
        expectedValidation: "validation approuvee",
        linkedExpenseId: null,
        linkedPayableId: payableId,
        observations: "Demande approuvee - peut etre executee.",
        status: "ready_to_print",
        createdByUid: approvedBy,
      });
    } catch (docError) {
      console.error("[payables] echec maj demande approvisionnement (approval)", {
        companyId,
        payableId,
        docError,
      });
    }
  }
}

/** Reject payable. */
export async function rejectPayable(
  companyId: string,
  payableId: string,
  approvedBy: string,
  approvedByRole?: string | null
): Promise<void> {
  const ref = payableRef(companyId, payableId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Compte a payer introuvable.");
  const payable = snap.data() as PayableDoc;
  await updateDoc(ref, {
    approvalStatus: "rejected" as ApprovalStatus,
    approvedBy,
    approvedAt: serverTimestamp(),
    approvedByRole: approvedByRole ?? null,
    updatedAt: serverTimestamp(),
  });
  await syncPurchaseOrderDocument({
    companyId,
    payableId,
    payable: {
      ...payable,
      approvedBy,
      approvedByRole: approvedByRole ?? null,
    } as PayableDoc,
    status: "archived",
    actorUid: approvedBy,
  });
  if (shouldCreateMaintenanceRequestFromPayableCategory(payable.category)) {
    try {
      await upsertMaintenanceRequestDocument({
        companyId,
        agencyId: payable.agencyId ?? null,
        sourceType: "payable",
        sourceId: payableId,
        vehicle: payable.vehicleId ?? null,
        registration: null,
        incidentType:
          payable.category === "parts"
            ? "approvisionnement_pieces"
            : "maintenance",
        urgency: "normale",
        requiredItems: payable.description ?? null,
        estimatedAmount: Number(payable.totalAmount ?? 0),
        currency: "XOF",
        proposedSupplier: payable.supplierName ?? null,
        requester: {
          uid: payable.createdBy,
          role: "requester",
        },
        expectedValidation: "rejetee",
        linkedExpenseId: null,
        linkedPayableId: payableId,
        observations: "Demande refusee.",
        status: "archived",
        createdByUid: approvedBy,
      });
    } catch (docError) {
      console.error("[payables] echec maj demande approvisionnement (reject)", {
        companyId,
        payableId,
        docError,
      });
    }
  }
}

/** List payables by agency. */
export async function listPayablesByAgency(
  companyId: string,
  agencyId: string,
  options?: { status?: PayableStatus; limitCount?: number }
): Promise<(PayableDoc & { id: string })[]> {
  const ref = payablesRef(companyId);
  const constraints: ReturnType<typeof where>[] = [where("agencyId", "==", agencyId)];
  if (options?.status) constraints.push(where("status", "==", options.status));
  const q = query(
    ref,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayableDoc & { id: string }));
}

/** List payables by status (company-wide). */
export async function listPayablesByStatus(
  companyId: string,
  status: PayableStatus,
  options?: { agencyId?: string; limitCount?: number }
): Promise<(PayableDoc & { id: string })[]> {
  const ref = payablesRef(companyId);
  const constraints: ReturnType<typeof where>[] = [where("status", "==", status)];
  if (options?.agencyId) constraints.push(where("agencyId", "==", options.agencyId));
  const q = query(
    ref,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayableDoc & { id: string }));
}

/** List all payables with remainingAmount > 0 (pending + partially_paid). */
export async function listUnpaidPayables(
  companyId: string,
  options?: { limitCount?: number }
): Promise<(PayableDoc & { id: string })[]> {
  const [pending, partial] = await Promise.all([
    listPayablesByStatus(companyId, "pending", { limitCount: options?.limitCount ?? 200 }),
    listPayablesByStatus(companyId, "partially_paid", { limitCount: options?.limitCount ?? 200 }),
  ]);
  const byId = new Map<string, PayableDoc & { id: string }>();
  pending.forEach((p) => byId.set(p.id, p));
  partial.forEach((p) => byId.set(p.id, p));
  return Array.from(byId.values());
}

export type { PayableDoc, PayableDocCreate, PayableStatus, ApprovalStatus };
