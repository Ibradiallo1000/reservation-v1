import {
  collection,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  isConfirmedTransactionStatus,
  listFinancialTransactionsByPeriod,
} from "@/modules/compagnie/treasury/financialTransactions";
import {
  agencyCashAccountDocId,
  ledgerAccountDocRef,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import type {
  AgencyCashStatementCategory,
  AgencyCashStatementResult,
  AgencyCashStatementRow,
} from "./agencyCashStatementTypes";

const MAX_ROWS = 5000;

function timestampToDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const date = (value as { toDate?: () => Date }).toDate?.();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  return null;
}

function transactionCategory(
  row: FinancialTransactionDoc,
  isEntry: boolean
): AgencyCashStatementCategory {
  if (row.type === "remittance") return "validation";
  if (row.type === "expense") return "expense";
  if (row.type === "transfer" || row.type === "transfer_to_bank") return "transfer";
  return isEntry ? "entry" : "exit";
}

function categoryLabel(category: AgencyCashStatementCategory): string {
  if (category === "validation") return "Validation de poste";
  if (category === "expense") return "Dépense";
  if (category === "transfer") return "Transfert";
  if (category === "entry") return "Entrée";
  return "Sortie";
}

function transactionLabel(
  row: FinancialTransactionDoc,
  category: AgencyCashStatementCategory
): string {
  const metadata = row.metadata ?? {};
  const description =
    typeof metadata.description === "string" ? metadata.description.trim() : "";
  const context = typeof metadata.context === "string" ? metadata.context.trim() : "";
  if (description) return description;
  if (context) return context;
  if (category === "validation") return "Remise de caisse validée";
  if (category === "expense") return "Dépense caisse agence";
  if (category === "transfer") return "Transfert caisse agence vers banque";
  if (row.type === "bank_withdrawal") return "Approvisionnement depuis une banque";
  if (row.type === "refund") return "Remboursement";
  if (row.type === "payment_received") return "Encaissement";
  return categoryLabel(category);
}

function normalizeFinancialTransaction(
  id: string,
  row: FinancialTransactionDoc,
  cashAccountId: string
): AgencyCashStatementRow | null {
  if (!isConfirmedTransactionStatus(row.status)) return null;
  const amount = Math.abs(Number(row.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const isEntry = row.creditAccountId === cashAccountId;
  const isExit = row.debitAccountId === cashAccountId;
  if (!isEntry && !isExit) return null;

  const date = timestampToDate(row.performedAt) ?? timestampToDate(row.createdAt);
  if (!date) return null;
  const category = transactionCategory(row, isEntry);

  return {
    id: `financial-${id}`,
    date,
    reference: row.referenceId || id,
    category,
    typeLabel: categoryLabel(category),
    label: transactionLabel(row, category),
    entry: isEntry ? amount : 0,
    exit: isExit ? amount : 0,
    status: row.status || "confirmed",
    source: "financialTransactions",
  };
}

export async function loadAgencyCashStatement(params: {
  companyId: string;
  agencyId: string;
  from: Date;
  to: Date;
}): Promise<AgencyCashStatementResult> {
  const { companyId, agencyId, from, to } = params;
  const cashAccountId = agencyCashAccountDocId(agencyId);
  const cashAccountRef = ledgerAccountDocRef(companyId, cashAccountId);
  const fromTimestamp = Timestamp.fromDate(from);
  const toTimestamp = Timestamp.fromDate(to);

  const [transactions, cashAccountSnapshot, legacySnapshot] = await Promise.all([
    listFinancialTransactionsByPeriod(
      companyId,
      fromTimestamp,
      toTimestamp,
      agencyId
    ),
    getDoc(cashAccountRef),
    getDocs(
      query(
        collection(cashAccountRef, "ledger"),
        where("createdAt", ">=", fromTimestamp),
        where("createdAt", "<=", toTimestamp),
        orderBy("createdAt", "asc"),
        limit(MAX_ROWS)
      )
    ),
  ]);

  const transactionRows = transactions
    .map((row) => normalizeFinancialTransaction(row.id, row, cashAccountId))
    .filter((row): row is AgencyCashStatementRow => row != null);

  const validationReferences = new Set(
    transactions
      .filter((row) => row.type === "remittance")
      .map((row) => String(row.referenceId ?? "").trim())
      .filter(Boolean)
  );

  const legacyRows: AgencyCashStatementRow[] = [];
  for (const legacyDoc of legacySnapshot.docs) {
    const data = legacyDoc.data() as Record<string, unknown>;
    const shiftId = String(data.shiftId ?? "").trim();
    if (shiftId && validationReferences.has(shiftId)) continue;
    const date = timestampToDate(data.createdAt);
    const amount = Math.abs(Number(data.amount ?? 0));
    if (!date || !Number.isFinite(amount) || amount <= 0) continue;
    if (String(data.type ?? "") !== "cash_in") continue;

    legacyRows.push({
      id: `legacy-${legacyDoc.id}`,
      date,
      reference: shiftId || legacyDoc.id,
      category: "validation",
      typeLabel: "Validation de poste",
      label: "Remise de caisse validée",
      entry: amount,
      exit: 0,
      status: String(data.status ?? "posted"),
      source: "legacyLedger",
    });
  }

  const cashData = cashAccountSnapshot.exists()
    ? (cashAccountSnapshot.data() as Record<string, unknown>)
    : null;
  const currentBalance = Number(cashData?.balance ?? 0);
  const currency =
    typeof cashData?.currency === "string" && cashData.currency.trim()
      ? cashData.currency.trim()
      : "XOF";

  return {
    rows: [...transactionRows, ...legacyRows].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    ),
    currentBalance: Number.isFinite(currentBalance) ? currentBalance : 0,
    currency,
    transactionsCapped: transactions.length >= MAX_ROWS,
    legacyCapped: legacySnapshot.size >= MAX_ROWS,
  };
}

