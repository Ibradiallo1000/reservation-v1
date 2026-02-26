// Phase C — Partial payment engine. Phase C1.1: threshold + payment proposals + anti-bypass.
import type { Transaction } from "firebase/firestore";
import { runTransaction, serverTimestamp, Timestamp, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { financialAccountRef } from "@/modules/compagnie/treasury/financialAccounts";
import { recordMovementInTransaction } from "@/modules/compagnie/treasury/financialMovements";
import type { ReferenceType } from "@/modules/compagnie/treasury/types";
import { payableRef } from "./payablesService";
import type { PayableDoc, PayableStatus } from "./payablesTypes";
import { getFinancialSettings } from "./financialSettingsService";
import {
  createPaymentProposal,
  sumPaymentProposalsForPayableInLast24h,
  listProposalsInLast24hForCumulative,
  paymentProposalRef,
} from "./paymentProposalsService";
import type { PaymentProposalDoc, ApprovalHistoryEntry } from "./paymentProposalsTypes";

const REFERENCE_TYPE: ReferenceType = "payable_payment";

export interface PayPayableParams {
  companyId: string;
  payableId: string;
  /** Phase C2: any account type — agency_cash, company_bank, or company_mobile_money. */
  fromAccountId: string;
  amount: number;
  performedBy: string;
  performedByRole?: string | null;
  /** Idempotency: unique per payment (e.g. client UUID). Prevents double payment. */
  idempotencyKey: string;
  currency: string;
}

export type PayPayableResult =
  | { status: "executed" }
  | { status: "pending_ceo_approval"; proposalId: string };

function computeStatus(totalAmount: number, amountPaid: number): PayableStatus {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= totalAmount) return "paid";
  return "partially_paid";
}

/**
 * Execute payment in a transaction (no threshold check). Call only when threshold allows direct execution.
 */
async function executePaymentInTransaction(tx: Transaction, params: PayPayableParams, payable: PayableDoc): Promise<void> {
  const amount = Number(params.amount);
  const accountRef = financialAccountRef(params.companyId, params.fromAccountId);
  const accountSnap = await tx.get(accountRef);
  if (!accountSnap.exists()) throw new Error("Compte source introuvable.");
  const balance = Number((accountSnap.data() as { currentBalance?: number }).currentBalance ?? 0);
  if (balance < amount) throw new Error("Solde insuffisant sur le compte source.");

  const referenceId = `${params.payableId}_${params.idempotencyKey}`;
  await recordMovementInTransaction(tx, {
    companyId: params.companyId,
    fromAccountId: params.fromAccountId,
    toAccountId: null,
    amount,
    currency: params.currency,
    movementType: "payable_payment",
    referenceType: REFERENCE_TYPE,
    referenceId,
    agencyId: payable.agencyId,
    performedBy: params.performedBy,
    performedByRole: params.performedByRole ?? null,
    notes: `Paiement fournisseur: ${payable.supplierName} - ${payable.description}`.slice(0, 200),
  });

  const newAmountPaid = Number(payable.amountPaid ?? 0) + amount;
  const totalAmount = Number(payable.totalAmount ?? 0);
  const newRemaining = totalAmount - newAmountPaid;
  const now = Timestamp.now();
  const payableRefDoc = payableRef(params.companyId, params.payableId);
  tx.update(payableRefDoc, {
    amountPaid: newAmountPaid,
    remainingAmount: newRemaining,
    status: computeStatus(totalAmount, newAmountPaid),
    lastPaymentAt: now,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Pay (partially or fully) a payable.
 * If amount > paymentApprovalThreshold OR cumulative (same payable, last 24h) > threshold → create proposal, return pending_ceo_approval.
 * Otherwise execute in transaction and return executed.
 */
export async function payPayable(params: PayPayableParams): Promise<PayPayableResult> {
  const amount = Number(params.amount);
  if (amount <= 0) throw new Error("Le montant doit être strictement positif.");

  const settings = await getFinancialSettings(params.companyId);
  const threshold = settings.paymentApprovalThreshold;

  const payableSnap = await getDoc(payableRef(params.companyId, params.payableId));
  if (!payableSnap.exists()) throw new Error("Compte à payer introuvable.");
  const payableData = payableSnap.data() as PayableDoc;
  const agencyId = payableData.agencyId ?? "";

  const [sumIn24hPayable, cumulativeMaps] = await Promise.all([
    sumPaymentProposalsForPayableInLast24h(params.companyId, params.payableId),
    listProposalsInLast24hForCumulative(params.companyId),
  ]);
  const cumulativePayable = sumIn24hPayable + amount;
  const sumAgency24h = cumulativeMaps.byAgency.get(agencyId) ?? 0;
  const sumUser24h = cumulativeMaps.byProposedBy.get(params.performedBy) ?? 0;
  const cumulativeAgency = sumAgency24h + amount;
  const cumulativeUser = sumUser24h + amount;

  const requireCeo =
    amount > threshold ||
    cumulativePayable > threshold ||
    cumulativeAgency > threshold ||
    cumulativeUser > threshold;

  if (requireCeo) {
    if (payableData.approvalStatus !== "approved") throw new Error("Seuls les comptes approuvés peuvent être payés.");
    const remaining = Number(payableData.remainingAmount ?? 0);
    if (remaining < amount) throw new Error("Montant supérieur au solde restant dû.");
    const proposalId = await createPaymentProposal({
      companyId: params.companyId,
      payableId: params.payableId,
      fromAccountId: params.fromAccountId,
      amount,
      currency: params.currency,
      agencyId: payableData.agencyId ?? "",
      proposedBy: params.performedBy,
      createdByRole: params.performedByRole ?? "unknown",
      idempotencyKey: params.idempotencyKey,
    });
    return { status: "pending_ceo_approval", proposalId };
  }

  await runTransaction(db, async (tx) => {
    const payableRefDoc = payableRef(params.companyId, params.payableId);
    const payableSnap = await tx.get(payableRefDoc);
    if (!payableSnap.exists()) throw new Error("Compte à payer introuvable.");
    const payable = payableSnap.data() as PayableDoc;
    if (payable.approvalStatus !== "approved") throw new Error("Seuls les comptes approuvés peuvent être payés.");
    const remaining = Number(payable.remainingAmount ?? 0);
    if (remaining < amount) throw new Error("Montant supérieur au solde restant dû.");
    await executePaymentInTransaction(tx, params, payable);
  });

  return { status: "executed" };
}

export interface ApprovePaymentProposalParams {
  companyId: string;
  proposalId: string;
  approvedBy: string;
  approvedByRole?: string;
}

/**
 * CEO approves a payment proposal: execute the payment in a transaction and mark proposal approved.
 * C1.2: rejects if proposal expired; updates approvedByRole and approvalHistory.
 */
export async function approvePaymentProposal(params: ApprovePaymentProposalParams): Promise<void> {
  const approvedByRole = params.approvedByRole ?? "admin_compagnie";
  await runTransaction(db, async (tx) => {
    const proposalRef = paymentProposalRef(params.companyId, params.proposalId);
    const proposalSnap = await tx.get(proposalRef);
    if (!proposalSnap.exists()) throw new Error("Proposition de paiement introuvable.");
    const proposal = proposalSnap.data() as PaymentProposalDoc;
    if (proposal.approvalStatus !== "pending") throw new Error("Cette proposition a déjà été traitée.");
    const now = Timestamp.now();
    const expiresAtMs = proposal.expiresAt?.toMillis?.();
    if (expiresAtMs != null && now.toMillis() > expiresAtMs) throw new Error("Proposal expired");

    const amount = Number(proposal.amount);
    const payableRefDoc = payableRef(params.companyId, proposal.payableId);
    const payableSnap = await tx.get(payableRefDoc);
    if (!payableSnap.exists()) throw new Error("Compte à payer introuvable.");
    const payable = payableSnap.data() as PayableDoc;
    if (Number(payable.remainingAmount ?? 0) < amount) throw new Error("Solde restant insuffisant sur le compte à payer.");

    const accountRef = financialAccountRef(params.companyId, proposal.fromAccountId);
    const accountSnap = await tx.get(accountRef);
    if (!accountSnap.exists()) throw new Error("Compte source introuvable.");
    const balance = Number((accountSnap.data() as { currentBalance?: number }).currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur le compte source.");

    const referenceId = `${proposal.payableId}_ceo_${params.proposalId}`;
    const movementId = await recordMovementInTransaction(tx, {
      companyId: params.companyId,
      fromAccountId: proposal.fromAccountId,
      toAccountId: null,
      amount,
      currency: proposal.currency,
      movementType: "payable_payment",
      referenceType: REFERENCE_TYPE,
      referenceId,
      agencyId: proposal.agencyId,
      performedBy: params.approvedBy,
      performedByRole: "admin_compagnie",
      notes: `Paiement approuvé CEO: ${payable.supplierName} - ${payable.description}`.slice(0, 200),
    });

    const newAmountPaid = Number(payable.amountPaid ?? 0) + amount;
    const totalAmount = Number(payable.totalAmount ?? 0);
    tx.update(payableRefDoc, {
      amountPaid: newAmountPaid,
      remainingAmount: totalAmount - newAmountPaid,
      status: computeStatus(totalAmount, newAmountPaid),
      lastPaymentAt: now,
      updatedAt: serverTimestamp(),
    });

    const history: ApprovalHistoryEntry[] = Array.isArray(proposal.approvalHistory)
      ? [...proposal.approvalHistory]
      : [];
    history.push({
      action: "approved",
      by: params.approvedBy,
      role: approvedByRole,
      timestamp: now,
    });
    tx.update(proposalRef, {
      approvalStatus: "approved",
      approvedBy: params.approvedBy,
      approvedAt: serverTimestamp(),
      approvedByRole,
      executedMovementId: movementId,
      approvalHistory: history,
    });
  });
}

export interface RejectPaymentProposalParams {
  companyId: string;
  proposalId: string;
  approvedBy: string;
  approvedByRole?: string;
  rejectionReason?: string | null;
}

/**
 * CEO rejects a payment proposal. No financial impact. C1.2: rejectionReason, approvalHistory.
 */
export async function rejectPaymentProposal(params: RejectPaymentProposalParams): Promise<void> {
  const ref = paymentProposalRef(params.companyId, params.proposalId);
  const proposalSnap = await getDoc(ref);
  if (!proposalSnap.exists()) throw new Error("Proposition de paiement introuvable.");
  const proposal = proposalSnap.data() as PaymentProposalDoc;
  if (proposal.approvalStatus !== "pending") throw new Error("Cette proposition a déjà été traitée.");
  const history: ApprovalHistoryEntry[] = Array.isArray(proposal.approvalHistory)
    ? [...proposal.approvalHistory]
    : [];
  const approvedByRole = params.approvedByRole ?? "admin_compagnie";
  history.push({
    action: "rejected",
    by: params.approvedBy,
    role: approvedByRole,
    timestamp: Timestamp.now(),
  });
  await updateDoc(ref, {
    approvalStatus: "rejected",
    approvedBy: params.approvedBy,
    approvedAt: serverTimestamp(),
    approvedByRole,
    rejectionReason: params.rejectionReason ?? null,
    approvalHistory: history,
  });
}
