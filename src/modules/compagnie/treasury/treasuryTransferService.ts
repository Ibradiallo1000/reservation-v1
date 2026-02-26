// Phase C2 — Treasury transfer engine. All flows through financialMovements; no balance mutation without movement.
import { runTransaction, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { financialAccountRef } from "./financialAccounts";
import {
  recordMovementInTransaction,
  ensureUniqueReferenceKeyInTransaction,
  uniqueReferenceKey,
} from "./financialMovements";
import type { FinancialAccountType } from "./types";

export interface TransferBetweenAccountsParams {
  companyId: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  currency: string;
  performedBy: string;
  performedByRole?: string | null;
  idempotencyKey: string;
  description?: string | null;
}

/**
 * WAVE 6: Agency cannot transfer directly to another agency cash. Inter-agency flows must pass through company bank.
 */
function validateNoDirectAgencyCashToAgencyCash(
  fromType: FinancialAccountType,
  fromAgencyId: string | null,
  toType: FinancialAccountType,
  toAgencyId: string | null
): void {
  if (fromType !== "agency_cash" || toType !== "agency_cash") return;
  if (fromAgencyId && toAgencyId && fromAgencyId !== toAgencyId) {
    throw new Error(
      "Les transferts entre caisses d'agences différentes doivent passer par la banque compagnie."
    );
  }
}

/**
 * Internal transfer: two movements (debit source, credit destination), same business reference.
 * Idempotent per idempotencyKey.
 */
export async function transferBetweenAccounts(
  params: TransferBetweenAccountsParams
): Promise<void> {
  const amount = Number(params.amount);
  if (amount <= 0) throw new Error("Le montant doit être strictement positif.");
  if (params.fromAccountId === params.toAccountId) {
    throw new Error("Le compte source et le compte destination doivent être différents.");
  }

  await runTransaction(db, async (tx) => {
    const fromRef = financialAccountRef(params.companyId, params.fromAccountId);
    const toRef = financialAccountRef(params.companyId, params.toAccountId);
    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);
    if (!fromSnap.exists()) throw new Error("Compte source introuvable.");
    if (!toSnap.exists()) throw new Error("Compte destination introuvable.");

    const fromData = fromSnap.data() as { accountType?: string; agencyId?: string | null; currentBalance?: number; currency?: string };
    const toData = toSnap.data() as { accountType?: string; agencyId?: string | null };
    const fromType = (fromData.accountType ?? "") as FinancialAccountType;
    const toType = (toData.accountType ?? "") as FinancialAccountType;
    const fromAgencyId = fromData.agencyId ?? null;
    const toAgencyId = toData.agencyId ?? null;

    validateNoDirectAgencyCashToAgencyCash(fromType, fromAgencyId, toType, toAgencyId);

    const balance = Number(fromData.currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur le compte source.");
    const currency = params.currency || (fromData.currency ?? "");

    const transferKey = uniqueReferenceKey("internal_transfer", params.idempotencyKey);
    await ensureUniqueReferenceKeyInTransaction(tx, params.companyId, transferKey);

    const agencyId = fromAgencyId ?? toAgencyId ?? "";
    const notes = (params.description ?? "Transfert interne").slice(0, 200);

    await recordMovementInTransaction(tx, {
      companyId: params.companyId,
      fromAccountId: params.fromAccountId,
      toAccountId: null,
      amount,
      currency,
      movementType: "internal_transfer",
      referenceType: "internal_transfer",
      referenceId: `${params.idempotencyKey}_debit`,
      agencyId,
      performedBy: params.performedBy,
      performedByRole: params.performedByRole ?? null,
      notes,
      entryType: "debit",
    });
    await recordMovementInTransaction(tx, {
      companyId: params.companyId,
      fromAccountId: null,
      toAccountId: params.toAccountId,
      amount,
      currency,
      movementType: "internal_transfer",
      referenceType: "internal_transfer",
      referenceId: `${params.idempotencyKey}_credit`,
      agencyId,
      performedBy: params.performedBy,
      performedByRole: params.performedByRole ?? null,
      notes,
      entryType: "credit",
    });
  });
}

// --- WAVE 3: Deposit & withdrawal flows (single movement each, debit one account + credit another) ---

export interface AgencyDepositToBankParams {
  companyId: string;
  agencyCashAccountId: string;
  companyBankAccountId: string;
  amount: number;
  currency: string;
  performedBy: string;
  performedByRole?: string | null;
  idempotencyKey: string;
  description?: string | null;
}

/** Agency deposit to company bank: debit agency_cash, credit company_bank. referenceType: agency_deposit. */
export async function agencyDepositToBank(params: AgencyDepositToBankParams): Promise<void> {
  const amount = Number(params.amount);
  if (amount <= 0) throw new Error("Le montant doit être strictement positif.");

  await runTransaction(db, async (tx) => {
    const fromRef = financialAccountRef(params.companyId, params.agencyCashAccountId);
    const toRef = financialAccountRef(params.companyId, params.companyBankAccountId);
    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);
    if (!fromSnap.exists()) throw new Error("Compte caisse agence introuvable.");
    if (!toSnap.exists()) throw new Error("Compte banque compagnie introuvable.");
    const fromData = fromSnap.data() as { agencyId?: string | null; currentBalance?: number };
    const balance = Number(fromData.currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur la caisse agence.");

    await recordMovementInTransaction(tx, {
      companyId: params.companyId,
      fromAccountId: params.agencyCashAccountId,
      toAccountId: params.companyBankAccountId,
      amount,
      currency: params.currency,
      movementType: "deposit_to_bank",
      referenceType: "agency_deposit",
      referenceId: params.idempotencyKey,
      agencyId: fromData.agencyId ?? "",
      performedBy: params.performedBy,
      performedByRole: params.performedByRole ?? null,
      notes: (params.description ?? "Dépôt agence vers banque").slice(0, 200),
    });
  });
}

export interface BankWithdrawalToAgencyParams {
  companyId: string;
  companyBankAccountId: string;
  agencyCashAccountId: string;
  amount: number;
  currency: string;
  performedBy: string;
  performedByRole?: string | null;
  idempotencyKey: string;
  description?: string | null;
}

/** Bank withdrawal to agency cash: debit company_bank, credit agency_cash. referenceType: bank_withdrawal. */
export async function bankWithdrawalToAgency(params: BankWithdrawalToAgencyParams): Promise<void> {
  const amount = Number(params.amount);
  if (amount <= 0) throw new Error("Le montant doit être strictement positif.");

  await runTransaction(db, async (tx) => {
    const fromRef = financialAccountRef(params.companyId, params.companyBankAccountId);
    const toRef = financialAccountRef(params.companyId, params.agencyCashAccountId);
    const toSnap = await tx.get(toRef);
    const fromSnap = await tx.get(fromRef);
    if (!fromSnap.exists()) throw new Error("Compte banque compagnie introuvable.");
    if (!toSnap.exists()) throw new Error("Compte caisse agence introuvable.");
    const balance = Number((fromSnap.data() as { currentBalance?: number }).currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur le compte banque.");
    const toData = toSnap.data() as { agencyId?: string | null };

    await recordMovementInTransaction(tx, {
      companyId: params.companyId,
      fromAccountId: params.companyBankAccountId,
      toAccountId: params.agencyCashAccountId,
      amount,
      currency: params.currency,
      movementType: "withdrawal_from_bank",
      referenceType: "bank_withdrawal",
      referenceId: params.idempotencyKey,
      agencyId: toData.agencyId ?? "",
      performedBy: params.performedBy,
      performedByRole: params.performedByRole ?? null,
      notes: (params.description ?? "Retrait banque vers caisse agence").slice(0, 200),
    });
  });
}

export interface MobileToBankTransferParams {
  companyId: string;
  mobileMoneyAccountId: string;
  companyBankAccountId: string;
  amount: number;
  currency: string;
  performedBy: string;
  performedByRole?: string | null;
  idempotencyKey: string;
  description?: string | null;
}

/** Mobile money to bank: debit company_mobile_money, credit company_bank. referenceType: mobile_to_bank. */
export async function mobileToBankTransfer(params: MobileToBankTransferParams): Promise<void> {
  const amount = Number(params.amount);
  if (amount <= 0) throw new Error("Le montant doit être strictement positif.");

  await runTransaction(db, async (tx) => {
    const fromRef = financialAccountRef(params.companyId, params.mobileMoneyAccountId);
    const toRef = financialAccountRef(params.companyId, params.companyBankAccountId);
    const fromSnap = await tx.get(fromRef);
    const toSnap = await tx.get(toRef);
    if (!fromSnap.exists()) throw new Error("Compte mobile money introuvable.");
    if (!toSnap.exists()) throw new Error("Compte banque compagnie introuvable.");
    const balance = Number((fromSnap.data() as { currentBalance?: number }).currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur le compte mobile money.");

    await recordMovementInTransaction(tx, {
      companyId: params.companyId,
      fromAccountId: params.mobileMoneyAccountId,
      toAccountId: params.companyBankAccountId,
      amount,
      currency: params.currency,
      movementType: "internal_transfer",
      referenceType: "mobile_to_bank",
      referenceId: params.idempotencyKey,
      agencyId: "",
      performedBy: params.performedBy,
      performedByRole: params.performedByRole ?? null,
      notes: (params.description ?? "Virement mobile money vers banque").slice(0, 200),
    });
  });
}

export interface MobileExpenseParams {
  companyId: string;
  mobileMoneyAccountId: string;
  amount: number;
  currency: string;
  performedBy: string;
  performedByRole?: string | null;
  idempotencyKey: string;
  expenseReferenceId: string;
  description?: string | null;
}

/** Direct expense from mobile money: debit company_mobile_money, no credit (expense reference). referenceType: mobile_expense. */
export async function recordMobileExpense(params: MobileExpenseParams): Promise<void> {
  const amount = Number(params.amount);
  if (amount <= 0) throw new Error("Le montant doit être strictement positif.");

  await runTransaction(db, async (tx) => {
    const fromRef = financialAccountRef(params.companyId, params.mobileMoneyAccountId);
    const fromSnap = await tx.get(fromRef);
    if (!fromSnap.exists()) throw new Error("Compte mobile money introuvable.");
    const balance = Number((fromSnap.data() as { currentBalance?: number }).currentBalance ?? 0);
    if (balance < amount) throw new Error("Solde insuffisant sur le compte mobile money.");

    await recordMovementInTransaction(tx, {
      companyId: params.companyId,
      fromAccountId: params.mobileMoneyAccountId,
      toAccountId: null,
      amount,
      currency: params.currency,
      movementType: "expense_payment",
      referenceType: "mobile_expense",
      referenceId: params.idempotencyKey,
      agencyId: "",
      performedBy: params.performedBy,
      performedByRole: params.performedByRole ?? null,
      notes: (params.description ?? `Dépense mobile - ref: ${params.expenseReferenceId}`).slice(0, 200),
    });
  });
}
