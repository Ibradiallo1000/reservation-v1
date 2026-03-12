import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { agencyDepositToBank } from "@/modules/compagnie/treasury/treasuryTransferService";

export type TransferRequestStatus =
  | "pending_manager"
  | "approved"
  | "rejected"
  | "executed";

export type TransferRequestDoc = {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description: string | null;
  status: TransferRequestStatus;
  initiatedBy: string;
  initiatedByRole: string | null;
  managerDecisionBy: string | null;
  managerDecisionAt: Timestamp | null;
  managerDecisionReason: string | null;
  executedBy: string | null;
  executedAt: Timestamp | null;
  idempotencyKey: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

const COLLECTION = "treasuryTransferRequests";

const INITIATOR_ROLES = ["agency_accountant", "admin_compagnie"];
const MANAGER_ROLES = ["chefAgence", "superviseur", "admin_compagnie"];

function requestsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${COLLECTION}`);
}

function requestRef(companyId: string, requestId: string) {
  return doc(db, `companies/${companyId}/${COLLECTION}/${requestId}`);
}

function canInitiate(role?: string | null): boolean {
  return INITIATOR_ROLES.includes((role ?? "").trim());
}

function canValidate(role?: string | null): boolean {
  return MANAGER_ROLES.includes((role ?? "").trim());
}

export async function createTransferRequest(params: {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description?: string | null;
  initiatedBy: string;
  initiatedByRole?: string | null;
}): Promise<string> {
  const role = params.initiatedByRole ?? null;
  if (!canInitiate(role)) {
    throw new Error("Seul le comptable agence peut initier un versement.");
  }
  const amount = Number(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Montant invalide.");
  }
  const ref = doc(requestsRef(params.companyId));
  const now = Timestamp.now();
  const payload: TransferRequestDoc = {
    companyId: params.companyId,
    agencyId: params.agencyId,
    fromAccountId: params.fromAccountId,
    toAccountId: params.toAccountId,
    amount,
    currency: params.currency,
    description: params.description?.trim() || null,
    status: "pending_manager",
    initiatedBy: params.initiatedBy,
    initiatedByRole: role,
    managerDecisionBy: null,
    managerDecisionAt: null,
    managerDecisionReason: null,
    executedBy: null,
    executedAt: null,
    idempotencyKey: `agency_transfer_req_${ref.id}`,
    createdAt: now,
    updatedAt: now,
  };
  await setDoc(ref, payload);
  return ref.id;
}

export async function listTransferRequests(
  companyId: string,
  options?: {
    agencyId?: string;
    status?: TransferRequestStatus;
    statusIn?: TransferRequestStatus[];
    limitCount?: number;
  }
): Promise<(TransferRequestDoc & { id: string })[]> {
  const constraints: ReturnType<typeof where>[] = [];
  if (options?.agencyId) constraints.push(where("agencyId", "==", options.agencyId));
  if (options?.statusIn && options.statusIn.length > 0) {
    constraints.push(where("status", "in", options.statusIn.slice(0, 10)));
  } else if (options?.status) {
    constraints.push(where("status", "==", options.status));
  }
  const q = query(
    requestsRef(companyId),
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 50)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TransferRequestDoc) }));
}

export async function approveTransferRequest(params: {
  companyId: string;
  requestId: string;
  managerId: string;
  managerRole?: string | null;
}): Promise<void> {
  const role = params.managerRole ?? null;
  if (!canValidate(role)) {
    throw new Error("Seul le chef d'agence peut valider ce versement.");
  }
  const ref = requestRef(params.companyId, params.requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Demande introuvable.");
  const req = snap.data() as TransferRequestDoc;
  if (req.status !== "pending_manager") {
    throw new Error("Cette demande n'est plus en attente de validation.");
  }
  if (req.initiatedBy === params.managerId) {
    throw new Error("L'initiateur ne peut pas valider sa propre demande.");
  }

  await updateDoc(ref, {
    status: "approved",
    managerDecisionBy: params.managerId,
    managerDecisionAt: serverTimestamp(),
    managerDecisionReason: null,
    updatedAt: serverTimestamp(),
  });

  await agencyDepositToBank({
    companyId: req.companyId,
    agencyCashAccountId: req.fromAccountId,
    companyBankAccountId: req.toAccountId,
    amount: req.amount,
    currency: req.currency,
    performedBy: params.managerId,
    performedByRole: role,
    idempotencyKey: req.idempotencyKey,
    description: req.description || "Versement caisse agence vers banque compagnie",
  });

  await updateDoc(ref, {
    status: "executed",
    executedBy: params.managerId,
    executedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectTransferRequest(params: {
  companyId: string;
  requestId: string;
  managerId: string;
  managerRole?: string | null;
  reason?: string | null;
}): Promise<void> {
  const role = params.managerRole ?? null;
  if (!canValidate(role)) {
    throw new Error("Seul le chef d'agence peut refuser ce versement.");
  }
  const ref = requestRef(params.companyId, params.requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Demande introuvable.");
  const req = snap.data() as TransferRequestDoc;
  if (req.status !== "pending_manager") {
    throw new Error("Cette demande n'est plus en attente de validation.");
  }
  await updateDoc(ref, {
    status: "rejected",
    managerDecisionBy: params.managerId,
    managerDecisionAt: serverTimestamp(),
    managerDecisionReason: params.reason?.trim() || null,
    updatedAt: serverTimestamp(),
  });
}
