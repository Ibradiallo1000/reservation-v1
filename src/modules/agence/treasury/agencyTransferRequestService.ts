import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { agencyDepositToBank } from "@/modules/compagnie/treasury/treasuryTransferService";

const AGENCY_TRANSFER_REQUESTS_COLLECTION = "agencyTransferRequests";

export type AgencyTransferRequestStatus =
  | "pending_manager"
  | "processing"
  | "approved"
  | "rejected";

export type AgencyTransferRequestDoc = {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description: string;
  status: AgencyTransferRequestStatus;
  requestedBy: string;
  requestedByRole: string | null;
  requestedAt: Timestamp;
  approvedBy: string | null;
  approvedByRole: string | null;
  approvedAt: Timestamp | null;
  rejectedBy: string | null;
  rejectedByRole: string | null;
  rejectedAt: Timestamp | null;
  rejectionReason: string | null;
  executionError: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
};

function transferRequestsRef(companyId: string) {
  return collection(db, "companies", companyId, AGENCY_TRANSFER_REQUESTS_COLLECTION);
}

function transferRequestRef(companyId: string, requestId: string) {
  return doc(db, "companies", companyId, AGENCY_TRANSFER_REQUESTS_COLLECTION, requestId);
}

export async function createAgencyTransferRequest(params: {
  companyId: string;
  agencyId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  description?: string;
  requestedBy: string;
  requestedByRole?: string | null;
}): Promise<string> {
  const ref = doc(transferRequestsRef(params.companyId));
  const now = Timestamp.now();
  await setDoc(ref, {
    companyId: params.companyId,
    agencyId: params.agencyId,
    fromAccountId: params.fromAccountId,
    toAccountId: params.toAccountId,
    amount: Number(params.amount) || 0,
    currency: params.currency,
    description: (params.description ?? "").trim(),
    status: "pending_manager",
    requestedBy: params.requestedBy,
    requestedByRole: params.requestedByRole ?? null,
    requestedAt: now,
    approvedBy: null,
    approvedByRole: null,
    approvedAt: null,
    rejectedBy: null,
    rejectedByRole: null,
    rejectedAt: null,
    rejectionReason: null,
    executionError: null,
    createdAt: now,
    updatedAt: now,
  } satisfies AgencyTransferRequestDoc);
  return ref.id;
}

export async function listAgencyTransferRequests(
  companyId: string,
  agencyId: string,
  options?: { statuses?: AgencyTransferRequestStatus[]; limitCount?: number }
): Promise<(AgencyTransferRequestDoc & { id: string })[]> {
  const statuses = options?.statuses ?? ["pending_manager"];
  const q = query(
    transferRequestsRef(companyId),
    where("agencyId", "==", agencyId),
    where("status", "in", statuses.slice(0, 10)),
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AgencyTransferRequestDoc) }));
}

export async function approveAgencyTransferRequest(params: {
  companyId: string;
  requestId: string;
  approvedBy: string;
  approvedByRole?: string | null;
}): Promise<void> {
  const ref = transferRequestRef(params.companyId, params.requestId);
  let reqData: AgencyTransferRequestDoc | null = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Demande de versement introuvable.");
    const data = snap.data() as AgencyTransferRequestDoc;
    if (data.status !== "pending_manager") {
      throw new Error("Cette demande n'est plus en attente de validation.");
    }
    reqData = data;
    tx.update(ref, {
      status: "processing",
      approvedBy: params.approvedBy,
      approvedByRole: params.approvedByRole ?? null,
      updatedAt: serverTimestamp(),
      executionError: null,
    });
  });

  if (!reqData) throw new Error("Impossible de charger la demande.");

  try {
    await agencyDepositToBank({
      companyId: params.companyId,
      agencyCashAccountId: reqData.fromAccountId,
      companyBankAccountId: reqData.toAccountId,
      amount: reqData.amount,
      currency: reqData.currency,
      performedBy: params.approvedBy,
      performedByRole: params.approvedByRole ?? null,
      idempotencyKey: `transfer_request_${params.requestId}`,
      description: reqData.description || "Versement validé chef d'agence",
    });

    await updateDoc(ref, {
      status: "approved",
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      executionError: null,
    });
  } catch (error) {
    await updateDoc(ref, {
      status: "pending_manager",
      executionError:
        error instanceof Error ? error.message.slice(0, 280) : "Erreur execution versement.",
      updatedAt: serverTimestamp(),
    });
    throw error;
  }
}

export async function rejectAgencyTransferRequest(params: {
  companyId: string;
  requestId: string;
  rejectedBy: string;
  rejectedByRole?: string | null;
  reason?: string | null;
}): Promise<void> {
  const ref = transferRequestRef(params.companyId, params.requestId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Demande de versement introuvable.");
  const data = snap.data() as AgencyTransferRequestDoc;
  if (data.status !== "pending_manager") {
    throw new Error("Cette demande n'est plus en attente de validation.");
  }
  await updateDoc(ref, {
    status: "rejected",
    rejectedBy: params.rejectedBy,
    rejectedByRole: params.rejectedByRole ?? null,
    rejectedAt: serverTimestamp(),
    rejectionReason: (params.reason ?? "").trim() || null,
    updatedAt: serverTimestamp(),
  });
}
