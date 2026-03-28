// Treasury transfer engine — aligned on ledger financialTransactions/accounts.
import { Timestamp, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { financialAccountRef } from "./financialAccounts";
import type { FinancialAccountType } from "./types";
import { createFinancialTransaction } from "./financialTransactions";
import { ledgerDocIdFromFinancialAccountData } from "./ledgerAccounts";

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

  const fromSnap = await getDoc(financialAccountRef(params.companyId, params.fromAccountId));
  const toSnap = await getDoc(financialAccountRef(params.companyId, params.toAccountId));
  if (!fromSnap.exists()) throw new Error("Compte source introuvable.");
  if (!toSnap.exists()) throw new Error("Compte destination introuvable.");
  const fromData = fromSnap.exists()
    ? (fromSnap.data() as { accountType?: string; agencyId?: string | null })
    : {};
  const toData = toSnap.exists()
    ? (toSnap.data() as { accountType?: string; agencyId?: string | null })
    : {};
  const fromType = (fromData.accountType ?? "") as FinancialAccountType;
  const toType = (toData.accountType ?? "") as FinancialAccountType;
  validateNoDirectAgencyCashToAgencyCash(fromType, fromData.agencyId ?? null, toType, toData.agencyId ?? null);
  const dId = ledgerDocIdFromFinancialAccountData(fromData);
  const cId = ledgerDocIdFromFinancialAccountData(toData);
  if (dId && cId) {
    await createFinancialTransaction({
      companyId: params.companyId,
      type: "transfer",
      transferRoute: "internal_pair",
      transferDebitLedgerDocId: dId,
      transferCreditLedgerDocId: cId,
      source: "mixed",
      amount,
      currency: params.currency,
      agencyId: (fromData.agencyId as string | undefined) ?? (toData.agencyId as string | undefined) ?? null,
      referenceType: "internal_transfer",
      referenceId: params.idempotencyKey,
      metadata: { fromAccountId: params.fromAccountId, toAccountId: params.toAccountId },
    });
  }
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

  const fromSnap = await getDoc(financialAccountRef(params.companyId, params.agencyCashAccountId));
  const aid = (fromSnap.data() as { agencyId?: string | null } | undefined)?.agencyId;
  if (aid) {
    await createFinancialTransaction({
      companyId: params.companyId,
      type: "transfer",
      transferRoute: "agency_cash_to_company_bank",
      source: "bank",
      amount,
      currency: params.currency,
      agencyId: aid,
      referenceType: "agency_deposit",
      referenceId: params.idempotencyKey,
      metadata: {
        fromAccountId: params.agencyCashAccountId,
        toAccountId: params.companyBankAccountId,
      },
    });
  }
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

  const toSnap = await getDoc(financialAccountRef(params.companyId, params.agencyCashAccountId));
  const aid = (toSnap.data() as { agencyId?: string | null } | undefined)?.agencyId;
  if (aid) {
    await createFinancialTransaction({
      companyId: params.companyId,
      type: "bank_withdrawal",
      source: "bank",
      amount,
      currency: params.currency,
      agencyId: aid,
      referenceType: "bank_withdrawal",
      referenceId: params.idempotencyKey,
      metadata: {
        fromAccountId: params.companyBankAccountId,
        toAccountId: params.agencyCashAccountId,
      },
    });
  }
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

  const fromSnap = await getDoc(financialAccountRef(params.companyId, params.mobileMoneyAccountId));
  const fromData = fromSnap.exists()
    ? (fromSnap.data() as { accountType?: string; agencyId?: string | null })
    : {};
  const dId = ledgerDocIdFromFinancialAccountData(fromData);
  if (dId) {
    await createFinancialTransaction({
      companyId: params.companyId,
      type: "transfer",
      transferRoute: "ledger_debit_to_company_bank",
      transferDebitLedgerDocId: dId,
      source: "mobile_money",
      amount,
      currency: params.currency,
      agencyId: fromData.agencyId ?? null,
      referenceType: "mobile_to_bank",
      referenceId: params.idempotencyKey,
      metadata: {
        fromAccountId: params.mobileMoneyAccountId,
        toAccountId: params.companyBankAccountId,
      },
    });
  }
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

  const fromSnap = await getDoc(financialAccountRef(params.companyId, params.mobileMoneyAccountId));
  const fromData = fromSnap.exists()
    ? (fromSnap.data() as { accountType?: string; agencyId?: string | null })
    : {};
  const dId = ledgerDocIdFromFinancialAccountData(fromData);
  if (!dId) throw new Error("Compte mobile money introuvable.");
  await createFinancialTransaction({
    companyId: params.companyId,
    type: "expense",
    expenseDebitLedgerDocId: dId,
    source: "mobile_money",
    amount,
    currency: params.currency,
    agencyId: fromData.agencyId ?? null,
    referenceType: "mobile_expense",
    referenceId: params.idempotencyKey,
    metadata: {
      expenseReferenceId: params.expenseReferenceId,
      notes: (params.description ?? `Dépense mobile - ref: ${params.expenseReferenceId}`).slice(0, 200),
    },
  });
}
