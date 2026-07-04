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
import { listComptaEncaissementsInRange } from "@/modules/agence/comptabilite/comptaEncaissementsService";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import type {
  AgencyCashStatementCategory,
  AgencyCashStatementFilter,
  AgencyCashStatementResult,
  AgencyCashStatementRow,
  AgencyCashStatementSummary,
} from "./agencyCashStatementTypes";

const MAX_ROWS = 5000;
const STATEMENT_CACHE_TTL_MS = 30_000;

type AgencyCashStatementMode = "accountant" | "manager";

type AgencyCashStatementLoadOptions = {
  mode?: AgencyCashStatementMode;
  includeLegacyLedger?: boolean;
  tolerateSecondarySourceErrors?: boolean;
};

type CacheEntry = {
  loadedAt: number;
  promise: Promise<AgencyCashStatementResult>;
};

const statementCache = new Map<string, CacheEntry>();

function cacheKey(params: {
  companyId: string;
  agencyId: string;
  from: Date;
  to: Date;
  options?: AgencyCashStatementLoadOptions;
}): string {
  const mode = params.options?.mode ?? "accountant";
  const includeLegacyLedger = params.options?.includeLegacyLedger ?? mode === "accountant";
  const tolerateSecondarySourceErrors =
    params.options?.tolerateSecondarySourceErrors ?? mode === "manager";
  return [
    params.companyId,
    params.agencyId,
    params.from.toISOString(),
    params.to.toISOString(),
    mode,
    includeLegacyLedger ? "legacy" : "no-legacy",
    tolerateSecondarySourceErrors ? "tolerant" : "strict",
  ].join("|");
}

function isPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === "permission-denied" || message.toLowerCase().includes("permission");
}

async function traceStatementRead<T>(params: {
  operation: string;
  path: string;
  companyId: string;
  agencyId: string;
  read: Promise<T>;
}): Promise<T> {
  const context = {
    operation: params.operation,
    path: params.path,
    companyId: params.companyId,
    agencyId: params.agencyId,
  };
  console.info("[agencyCashStatement][read]", { ...context, status: "start" });
  try {
    const result = await params.read;
    console.info("[agencyCashStatement][read]", { ...context, status: "success" });
    return result;
  } catch (error) {
    console.error("[agencyCashStatement][read]", {
      ...context,
      status: "error",
      code: (error as { code?: string } | null)?.code ?? null,
      error,
    });
    throw error;
  }
}

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

function normalizeComptaEncaissementDate(value: unknown): Date | null {
  return timestampToDate(value);
}

export function agencyCashStatementRowMatchesFilter(
  row: AgencyCashStatementRow,
  filter: AgencyCashStatementFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "entries") return row.entry > 0;
  if (filter === "exits") return row.exit > 0;
  if (filter === "expenses") return row.category === "expense";
  if (filter === "transfers") return row.category === "transfer";
  return row.category === "validation";
}

export function buildAgencyCashStatementSummary(
  result: AgencyCashStatementResult,
  filter: AgencyCashStatementFilter = "all"
): AgencyCashStatementSummary {
  const rows = result.rows.filter((row) => agencyCashStatementRowMatchesFilter(row, filter));
  const totals = rows.reduce(
    (sum, row) => ({
      totalEntries: sum.totalEntries + row.entry,
      totalExits: sum.totalExits + row.exit,
    }),
    { totalEntries: 0, totalExits: 0 }
  );

  return {
    ...totals,
    net: totals.totalEntries - totals.totalExits,
    currentBalance: result.currentBalance,
    currency: result.currency,
    rows,
    transactionsCapped: result.transactionsCapped,
    legacyCapped: result.legacyCapped,
    unavailableSources: result.unavailableSources,
  };
}

export async function loadAgencyCashStatement(params: {
  companyId: string;
  agencyId: string;
  from: Date;
  to: Date;
}, options: AgencyCashStatementLoadOptions = {}): Promise<AgencyCashStatementResult> {
  const { companyId, agencyId, from, to } = params;
  const mode = options.mode ?? "accountant";
  const includeLegacyLedger = options.includeLegacyLedger ?? mode === "accountant";
  const tolerateSecondarySourceErrors = options.tolerateSecondarySourceErrors ?? mode === "manager";
  const cashAccountId = agencyCashAccountDocId(agencyId);
  const cashAccountRef = ledgerAccountDocRef(companyId, cashAccountId);
  const fromTimestamp = Timestamp.fromDate(from);
  const toTimestamp = Timestamp.fromDate(to);

  const rangeToExclusive = new Date(to.getTime() + 1);
  const unavailableSources: string[] = [];

  const [transactions, cashAccountSnapshot, legacyDocs, comptaEncaissements] = await Promise.all([
    traceStatementRead({
      operation: "list_financial_transactions",
      path: `companies/${companyId}/financialTransactions`,
      companyId,
      agencyId,
      read: listFinancialTransactionsByPeriod(
        companyId,
        fromTimestamp,
        toTimestamp,
        agencyId
      ),
    }).catch((error) => {
      if (!tolerateSecondarySourceErrors || !isPermissionDenied(error)) throw error;
      unavailableSources.push("financialTransactions");
      return [] as Array<FinancialTransactionDoc & { id: string }>;
    }),
    traceStatementRead({
      operation: "get_agency_cash_account",
      path: cashAccountRef.path,
      companyId,
      agencyId,
      read: getDoc(cashAccountRef),
    }),
    includeLegacyLedger
      ? traceStatementRead({
          operation: "list_agency_cash_ledger",
          path: `${cashAccountRef.path}/ledger`,
          companyId,
          agencyId,
          read: getDocs(
            query(
              collection(cashAccountRef, "ledger"),
              where("createdAt", ">=", fromTimestamp),
              where("createdAt", "<=", toTimestamp),
              orderBy("createdAt", "asc"),
              limit(MAX_ROWS)
            )
          ),
        })
          .then((snapshot) => snapshot.docs)
          .catch((error) => {
            if (!tolerateSecondarySourceErrors || !isPermissionDenied(error)) throw error;
            unavailableSources.push("legacyLedger");
            return [];
          })
      : Promise.resolve([]),
    traceStatementRead({
      operation: "list_compta_encaissements",
      path: `companies/${companyId}/agences/${agencyId}/comptaEncaissements`,
      companyId,
      agencyId,
      read: listComptaEncaissementsInRange(
        companyId,
        agencyId,
        from,
        rangeToExclusive,
        MAX_ROWS
      ),
    }).catch((error) => {
      if (!tolerateSecondarySourceErrors || !isPermissionDenied(error)) throw error;
      unavailableSources.push("comptaEncaissements");
      return [];
    }),
  ]);

  const transactionRows = transactions
    .map((row) => normalizeFinancialTransaction(row.id, row, cashAccountId))
    .filter((row): row is AgencyCashStatementRow => row != null)
    .filter((row) => row.category !== "validation");

  const validationReferences = new Set(
    comptaEncaissements
      .map((row) => String(row.sessionId ?? "").trim())
      .filter(Boolean)
  );

  const comptaRows: AgencyCashStatementRow[] = comptaEncaissements
    .map((row): AgencyCashStatementRow | null => {
      const amount = Math.abs(Number(row.montant ?? 0));
      const date = normalizeComptaEncaissementDate(row.createdAt);
      if (!date || !Number.isFinite(amount) || amount <= 0) return null;
      return {
        id: `compta-${row.id}`,
        date,
        reference: row.sessionId || row.id,
        category: "validation",
        typeLabel: "Validation de poste",
        label: row.source === "courrier" ? "Remise courrier validée" : "Remise de caisse validée",
        entry: amount,
        exit: 0,
        status: "posted",
        source: "comptaEncaissements",
      };
    })
    .filter((row): row is AgencyCashStatementRow => row != null);

  const legacyRows: AgencyCashStatementRow[] = [];
  for (const legacyDoc of legacyDocs) {
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
    rows: [...transactionRows, ...comptaRows, ...legacyRows].sort(
      (a, b) => b.date.getTime() - a.date.getTime()
    ),
    currentBalance: Number.isFinite(currentBalance) ? currentBalance : 0,
    currency,
    transactionsCapped: transactions.length >= MAX_ROWS,
    legacyCapped: legacyDocs.length >= MAX_ROWS || comptaEncaissements.length >= MAX_ROWS,
    unavailableSources,
  };
}

export function loadAgencyCashStatementCached(
  params: {
    companyId: string;
    agencyId: string;
    from: Date;
    to: Date;
  },
  options: { force?: boolean } & AgencyCashStatementLoadOptions = {}
): Promise<AgencyCashStatementResult> {
  const { force, ...loadOptions } = options;
  const key = cacheKey({ ...params, options: loadOptions });
  const cached = statementCache.get(key);
  const now = Date.now();
  if (!force && cached && now - cached.loadedAt < STATEMENT_CACHE_TTL_MS) {
    return cached.promise;
  }

  const promise = loadAgencyCashStatement(params, loadOptions).catch((error) => {
    statementCache.delete(key);
    throw error;
  });
  statementCache.set(key, { loadedAt: now, promise });
  return promise;
}
