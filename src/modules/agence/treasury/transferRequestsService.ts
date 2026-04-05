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

export const TRANSFER_INITIATOR_ROLES = ["agency_accountant", "admin_compagnie"] as const;
export const TRANSFER_MANAGER_ROLES = ["chefAgence", "superviseur", "admin_compagnie"] as const;

const INITIATOR_SET = new Set<string>(TRANSFER_INITIATOR_ROLES);
const MANAGER_SET = new Set<string>(TRANSFER_MANAGER_ROLES);

function requestsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${COLLECTION}`);
}

function requestRef(companyId: string, requestId: string) {
  return doc(db, `companies/${companyId}/${COLLECTION}/${requestId}`);
}

function canInitiateWithRoles(roles: string[]): boolean {
  return roles.some((r) => INITIATOR_SET.has((r ?? "").trim()));
}

function firstInitiatorRole(roles: string[]): string | null {
  for (const r of roles) {
    const t = (r ?? "").trim();
    if (INITIATOR_SET.has(t)) return t;
  }
  return null;
}

function canValidateWithRoles(roles: string[]): boolean {
  return roles.some((r) => MANAGER_SET.has((r ?? "").trim()));
}

function firstManagerRole(roles: string[]): string | null {
  for (const r of roles) {
    const t = (r ?? "").trim();
    if (MANAGER_SET.has(t)) return t;
  }
  return null;
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
  /** @deprecated Préférer `initiatedByRoles` si l’utilisateur a plusieurs rôles. */
  initiatedByRole?: string | null;
  /** Tous les rôles du token / profil ; au moins un doit être initiateur autorisé. */
  initiatedByRoles?: string[] | null;
}): Promise<string> {
  const roleList =
    params.initiatedByRoles?.length != null && params.initiatedByRoles.length > 0
      ? params.initiatedByRoles.map((r) => String(r ?? "").trim()).filter(Boolean)
      : params.initiatedByRole
        ? [String(params.initiatedByRole).trim()].filter(Boolean)
        : [];
  if (!canInitiateWithRoles(roleList)) {
    throw new Error("Seul le comptable agence peut initier un versement.");
  }
  const role = firstInitiatorRole(roleList);
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
    initiatedByRole: role ?? null,
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
  managerRoles?: string[] | null;
}): Promise<void> {
  const roleList =
    params.managerRoles?.length != null && params.managerRoles.length > 0
      ? params.managerRoles.map((r) => String(r ?? "").trim()).filter(Boolean)
      : params.managerRole
        ? [String(params.managerRole).trim()].filter(Boolean)
        : [];
  if (!canValidateWithRoles(roleList)) {
    throw new Error("Seul le chef d'agence peut valider ce versement.");
  }
  const role = firstManagerRole(roleList);
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

  try {
    await agencyDepositToBank({
      companyId: req.companyId,
      agencyCashAccountId: req.fromAccountId,
      companyBankAccountId: req.toAccountId,
      amount: req.amount,
      currency: req.currency,
      performedBy: params.managerId,
      performedByRole: role ?? null,
      idempotencyKey: req.idempotencyKey,
      description: req.description || "Versement caisse agence vers banque compagnie",
    });
  } catch (err) {
    console.error("[treasuryTransfer] agencyDepositToBank a échoué — demande reste en attente chef.", {
      companyId: params.companyId,
      requestId: params.requestId,
      err,
    });
    throw err;
  }

  try {
    await updateDoc(ref, {
      status: "executed",
      managerDecisionBy: params.managerId,
      managerDecisionAt: serverTimestamp(),
      managerDecisionReason: null,
      executedBy: params.managerId,
      executedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    console.error(
      "[treasuryTransfer] Échec mise à jour demande après versement ledger — vérifier cohérence manuellement.",
      { companyId: params.companyId, requestId: params.requestId, err }
    );
    throw err;
  }
}

export async function rejectTransferRequest(params: {
  companyId: string;
  requestId: string;
  managerId: string;
  managerRole?: string | null;
  managerRoles?: string[] | null;
  reason?: string | null;
}): Promise<void> {
  const roleList =
    params.managerRoles?.length != null && params.managerRoles.length > 0
      ? params.managerRoles.map((r) => String(r ?? "").trim()).filter(Boolean)
      : params.managerRole
        ? [String(params.managerRole).trim()].filter(Boolean)
        : [];
  if (!canValidateWithRoles(roleList)) {
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
