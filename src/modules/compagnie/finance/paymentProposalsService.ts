// Phase C1.1 — Payment proposals: create, list pending, list for payable in last 24h (anti-bypass).
// C1.2: expiration, audit trail, cumulative by agency / proposedBy.
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
import type {
  PaymentProposalDoc,
  PaymentProposalApprovalStatus,
  ApprovalHistoryEntry,
} from "./paymentProposalsTypes";
import {
  PAYMENT_PROPOSALS_COLLECTION,
  PROPOSAL_EXPIRATION_DAYS,
} from "./paymentProposalsTypes";

const PROPOSALS_REF = (companyId: string) =>
  collection(db, "companies", companyId, PAYMENT_PROPOSALS_COLLECTION);

export function paymentProposalRef(companyId: string, proposalId: string) {
  return doc(db, "companies", companyId, PAYMENT_PROPOSALS_COLLECTION, proposalId);
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export interface CreatePaymentProposalParams {
  companyId: string;
  payableId: string;
  fromAccountId: string;
  amount: number;
  currency: string;
  agencyId: string;
  proposedBy: string;
  createdByRole: string;
  idempotencyKey: string;
}

/** Create a payment proposal (pending CEO approval). No ledger movement. C1.2: expiresAt, approvalHistory. */
export async function createPaymentProposal(params: CreatePaymentProposalParams): Promise<string> {
  const ref = doc(PROPOSALS_REF(params.companyId));
  const now = Timestamp.now();
  const expiresAt = Timestamp.fromMillis(
    now.toMillis() + PROPOSAL_EXPIRATION_DAYS * 24 * 60 * 60 * 1000
  );
  const historyEntry: ApprovalHistoryEntry = {
    action: "proposed",
    by: params.proposedBy,
    role: params.createdByRole,
    timestamp: now,
  };
  await setDoc(ref, {
    payableId: params.payableId,
    fromAccountId: params.fromAccountId,
    amount: Number(params.amount),
    currency: params.currency,
    agencyId: params.agencyId,
    proposedBy: params.proposedBy,
    proposedAt: now,
    approvalStatus: "pending" as PaymentProposalApprovalStatus,
    idempotencyKey: params.idempotencyKey,
    expiresAt,
    createdByRole: params.createdByRole,
    approvalHistory: [historyEntry],
  });
  return ref.id;
}

/** Mark a proposal as expired (transactionally safe single update). */
export async function markProposalExpired(
  companyId: string,
  proposalId: string
): Promise<void> {
  const ref = paymentProposalRef(companyId, proposalId);
  await updateDoc(ref, {
    approvalStatus: "expired" as PaymentProposalApprovalStatus,
  });
}

/** List proposals with approvalStatus === "pending". C1.2: marks expired proposals and returns only non-expired. */
export async function listPendingPaymentProposals(
  companyId: string,
  options?: { limitCount?: number }
): Promise<(PaymentProposalDoc & { id: string })[]> {
  const q = query(
    PROPOSALS_REF(companyId),
    where("approvalStatus", "==", "pending"),
    orderBy("proposedAt", "desc"),
    limit(options?.limitCount ?? 100)
  );
  const snap = await getDocs(q);
  const nowMs = Date.now();
  const expirationMs = PROPOSAL_EXPIRATION_DAYS * 24 * 60 * 60 * 1000;
  const result: (PaymentProposalDoc & { id: string })[] = [];
  for (const d of snap.docs) {
    const data = d.data() as PaymentProposalDoc;
    const proposedAtMs = data.proposedAt?.toMillis?.() ?? 0;
    const expiresAtMs = data.expiresAt?.toMillis?.() ?? proposedAtMs + expirationMs;
    if (nowMs > expiresAtMs) {
      try {
        await markProposalExpired(companyId, d.id);
      } catch {
        // Permission denied if non-CEO; still exclude from list
      }
      continue;
    }
    result.push({ id: d.id, ...data });
  }
  return result;
}

/** Sum of proposal amounts for the same payable in the last 24h (pending only). Used for anti-bypass. */
export async function sumPaymentProposalsForPayableInLast24h(
  companyId: string,
  payableId: string
): Promise<number> {
  const since = Timestamp.fromMillis(Date.now() - TWENTY_FOUR_HOURS_MS);
  const q = query(
    PROPOSALS_REF(companyId),
    where("payableId", "==", payableId),
    where("proposedAt", ">=", since),
    where("approvalStatus", "==", "pending"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.reduce((sum, d) => sum + (Number((d.data() as PaymentProposalDoc).amount) ?? 0), 0);
}

/** Proposals in last 24h with status pending or approved (for cumulative anti-bypass). Compute sums in memory. */
export async function listProposalsInLast24hForCumulative(
  companyId: string
): Promise<{ byAgency: Map<string, number>; byProposedBy: Map<string, number> }> {
  const since = Timestamp.fromMillis(Date.now() - TWENTY_FOUR_HOURS_MS);
  const q = query(
    PROPOSALS_REF(companyId),
    where("proposedAt", ">=", since),
    limit(200)
  );
  const snap = await getDocs(q);
  const byAgency = new Map<string, number>();
  const byProposedBy = new Map<string, number>();
  for (const d of snap.docs) {
    const data = d.data() as PaymentProposalDoc;
    const status = data.approvalStatus;
    if (status !== "pending" && status !== "approved") continue;
    const amount = Number(data.amount) ?? 0;
    const agencyId = data.agencyId ?? "";
    const proposedBy = data.proposedBy ?? "";
    byAgency.set(agencyId, (byAgency.get(agencyId) ?? 0) + amount);
    byProposedBy.set(proposedBy, (byProposedBy.get(proposedBy) ?? 0) + amount);
  }
  return { byAgency, byProposedBy };
}

export type { PaymentProposalDoc, PaymentProposalApprovalStatus };
