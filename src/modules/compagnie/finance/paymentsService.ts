// Phase C — Partial payment engine. Phase C1.1: threshold + payment proposals + anti-bypass.
import type { Transaction } from "firebase/firestore";
import { runTransaction, serverTimestamp, Timestamp, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { financialAccountRef } from "@/modules/compagnie/treasury/financialAccounts";
import type { ReferenceType } from "@/modules/compagnie/treasury/types";
import { createFinancialTransaction } from "@/modules/compagnie/treasury/financialTransactions";
import { ledgerDocIdFromFinancialAccountData } from "@/modules/compagnie/treasury/ledgerAccounts";
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
import {
  upsertCashDisbursementDocument,
  upsertSupplierPaymentOrderDocument,
} from "@/modules/finance/documents/financialDocumentsService";

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

async function syncPayableDisbursementDocument(params: {
  companyId: string;
  sourceType: "payable_payment" | "payment_proposal";
  sourceId: string;
  eventKey?: string | null;
  payableId: string;
  fromAccountId: string;
  amount: number;
  currency: string;
  requesterUid: string;
  requesterRole?: string | null;
  approverUid?: string | null;
  approverRole?: string | null;
  agencyId?: string | null;
  beneficiaryName?: string | null;
  reason?: string | null;
  validationLevel: string;
  status: "draft" | "ready_to_print" | "archived";
  observations?: string | null;
  executionDate?: unknown;
  createdByUid?: string | null;
}): Promise<void> {
  try {
    const accountSnap = await getDoc(financialAccountRef(params.companyId, params.fromAccountId));
    const accountData = accountSnap.exists()
      ? (accountSnap.data() as { accountName?: string; currency?: string; accountType?: string })
      : {};
    await upsertCashDisbursementDocument({
      companyId: params.companyId,
      agencyId: params.agencyId ?? null,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      eventKey: params.eventKey ?? null,
      requester: {
        uid: params.requesterUid,
        role: String(params.requesterRole ?? "requester").trim() || "requester",
      },
      approver: params.approverUid
        ? {
            uid: params.approverUid,
            role: String(params.approverRole ?? "validator").trim() || "validator",
          }
        : null,
      beneficiaryName: params.beneficiaryName ?? null,
      amount: Number(params.amount ?? 0),
      currency: String(accountData.currency ?? params.currency ?? "XOF"),
      expenseCategory: "supplier_payment",
      reason: params.reason ?? `Paiement fournisseur (${params.payableId})`,
      accountSourceLabel:
        String(accountData.accountName ?? "").trim() || params.fromAccountId,
      validationLevel: params.validationLevel,
      executionDate: params.executionDate ?? Timestamp.now(),
      observations: params.observations ?? null,
      status: params.status,
      createdByUid: params.createdByUid ?? params.requesterUid,
    });
    const modePaiement = String(accountData.accountType ?? "").includes("mobile")
      ? "mobile_money"
      : String(accountData.accountType ?? "").includes("bank")
        ? "virement_banque"
        : "cash";
    await upsertSupplierPaymentOrderDocument({
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      eventKey: params.eventKey ?? null,
      agenceId: params.agencyId ?? null,
      fournisseurNom: params.beneficiaryName ?? null,
      fournisseurTelephone: null,
      fournisseurAdresse: null,
      fournisseurReference: params.payableId,
      factureNumero: null,
      devisNumero: null,
      objetPaiement: params.reason ?? null,
      montantHT: null,
      montantTTC: Number(params.amount ?? 0),
      montantAPayer: Number(params.amount ?? 0),
      devise: String(accountData.currency ?? params.currency ?? "XOF"),
      modePaiement,
      sourcePaiement:
        String(accountData.accountName ?? "").trim() || params.fromAccountId,
      dateExecution: params.executionDate ?? Timestamp.now(),
      depenseLieeId: params.payableId,
      validationChefComptable: params.approverUid
        ? {
            uid: params.approverUid,
            role: params.approverRole ?? "validator",
          }
        : null,
      validationDirection: params.approverUid
        ? {
            uid: params.approverUid,
            role: params.approverRole ?? "validator",
          }
        : null,
      observations: params.observations ?? null,
      status: params.status,
      createdByUid: params.createdByUid ?? params.requesterUid,
    });
  } catch (docError) {
    console.error("[paymentsService] echec sync documents paiement fournisseur", {
      companyId: params.companyId,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      payableId: params.payableId,
      docError,
    });
  }
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
    await syncPayableDisbursementDocument({
      companyId: params.companyId,
      sourceType: "payment_proposal",
      sourceId: proposalId,
      payableId: params.payableId,
      fromAccountId: params.fromAccountId,
      amount,
      currency: params.currency,
      requesterUid: params.performedBy,
      requesterRole: params.performedByRole ?? "unknown",
      approverUid: null,
      approverRole: null,
      agencyId: payableData.agencyId ?? null,
      beneficiaryName: payableData.supplierName ?? null,
      reason: payableData.description ?? null,
      validationLevel: "pending_ceo_approval",
      status: "draft",
      observations: "Proposition de paiement en attente d'approbation CEO.",
      executionDate: Timestamp.now(),
      createdByUid: params.performedBy,
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
  try {
    const accSnap = await getDoc(financialAccountRef(params.companyId, params.fromAccountId));
    const acc = accSnap.exists()
      ? (accSnap.data() as { accountType?: string | null; agencyId?: string | null })
      : {};
    const debitId = ledgerDocIdFromFinancialAccountData(acc);
    if (debitId) {
      await createFinancialTransaction({
        companyId: params.companyId,
        type: "expense",
        expenseDebitLedgerDocId: debitId,
        source: String(acc.accountType ?? "").includes("mobile") ? "mobile_money" : String(acc.accountType ?? "").includes("bank") ? "bank" : "cash",
        amount,
        currency: params.currency,
        agencyId: payableData.agencyId ?? null,
        referenceType: REFERENCE_TYPE,
        referenceId: `${params.payableId}_${params.idempotencyKey}`,
        metadata: { payableId: params.payableId },
      });
    }
  } catch {
    /* keep payable state as source */
  }
  await syncPayableDisbursementDocument({
    companyId: params.companyId,
    sourceType: "payable_payment",
    sourceId: params.payableId,
    eventKey: params.idempotencyKey,
    payableId: params.payableId,
    fromAccountId: params.fromAccountId,
    amount,
    currency: params.currency,
    requesterUid: params.performedBy,
    requesterRole: params.performedByRole ?? "unknown",
    approverUid: payableData.approvedBy ?? null,
    approverRole: payableData.approvedByRole ?? null,
    agencyId: payableData.agencyId ?? null,
    beneficiaryName: payableData.supplierName ?? null,
    reason: payableData.description ?? null,
    validationLevel: "executed_direct",
    status: "ready_to_print",
    observations: "Paiement fournisseur execute.",
    executionDate: Timestamp.now(),
    createdByUid: params.performedBy,
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
      executedMovementId: null,
      approvalHistory: history,
    });
  });
  try {
    const proposalSnap = await getDoc(paymentProposalRef(params.companyId, params.proposalId));
    if (!proposalSnap.exists()) return;
    const p = proposalSnap.data() as PaymentProposalDoc;
    const accSnap = await getDoc(financialAccountRef(params.companyId, p.fromAccountId));
    const acc = accSnap.exists()
      ? (accSnap.data() as { accountType?: string | null; agencyId?: string | null })
      : {};
    const payableSnap = await getDoc(payableRef(params.companyId, p.payableId));
    const payableData = payableSnap.exists() ? (payableSnap.data() as PayableDoc) : null;
    const debitId = ledgerDocIdFromFinancialAccountData(acc);
    if (debitId) {
      await createFinancialTransaction({
        companyId: params.companyId,
        type: "expense",
        expenseDebitLedgerDocId: debitId,
        source: String(acc.accountType ?? "").includes("mobile") ? "mobile_money" : String(acc.accountType ?? "").includes("bank") ? "bank" : "cash",
        amount: Number(p.amount ?? 0),
        currency: p.currency,
        agencyId: p.agencyId ?? null,
        referenceType: REFERENCE_TYPE,
        referenceId: `${p.payableId}_ceo_${params.proposalId}`,
        metadata: { payableId: p.payableId, proposalId: params.proposalId },
      });
    }
    await syncPayableDisbursementDocument({
      companyId: params.companyId,
      sourceType: "payment_proposal",
      sourceId: params.proposalId,
      payableId: p.payableId,
      fromAccountId: p.fromAccountId,
      amount: Number(p.amount ?? 0),
      currency: p.currency,
      requesterUid: p.proposedBy,
      requesterRole: p.createdByRole ?? "requester",
      approverUid: params.approvedBy,
      approverRole: approvedByRole,
      agencyId: p.agencyId ?? null,
      beneficiaryName: payableData?.supplierName ?? null,
      reason: payableData?.description ?? null,
      validationLevel: "ceo_approved",
      status: "ready_to_print",
      observations: "Proposition de paiement approuvee et executee.",
      executionDate: Timestamp.now(),
      createdByUid: params.approvedBy,
    });
  } catch {
    /* ignore: approval already persisted */
  }
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
  const payableSnap = await getDoc(payableRef(params.companyId, proposal.payableId));
  const payableData = payableSnap.exists() ? (payableSnap.data() as PayableDoc) : null;
  await syncPayableDisbursementDocument({
    companyId: params.companyId,
    sourceType: "payment_proposal",
    sourceId: params.proposalId,
    payableId: proposal.payableId,
    fromAccountId: proposal.fromAccountId,
    amount: Number(proposal.amount ?? 0),
    currency: proposal.currency,
    requesterUid: proposal.proposedBy,
    requesterRole: proposal.createdByRole ?? "requester",
    approverUid: params.approvedBy,
    approverRole: approvedByRole,
    agencyId: proposal.agencyId ?? null,
    beneficiaryName: payableData?.supplierName ?? null,
    reason: payableData?.description ?? null,
    validationLevel: "ceo_rejected",
    status: "archived",
    observations: params.rejectionReason ?? "Proposition de paiement rejetee.",
    executionDate: Timestamp.now(),
    createdByUid: params.approvedBy,
  });
}
