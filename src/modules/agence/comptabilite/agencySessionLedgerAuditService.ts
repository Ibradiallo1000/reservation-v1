/**
 * Audit financier complet (LECTURE SEULE) : relie sessions métier (shifts, courierSessions)
 * aux écritures `financialTransactions`, aux reçus `cashReceipts` et au solde compte caisse agence (`accounts`).
 *
 * Contraintes Teliya réelles :
 * - Les remises physiques : `applyRemittancePendingToAgencyCashInTransaction` met à jour les soldes ledger
 *   et crée une écriture `financialTransactions` type `remittance` (idempotente par shift / courier_session).
 *   La trace documentaire côté guichet inclut aussi `cashReceipts`.
 * - Les ventes guichet/courrier passent surtout par `payment_received` avec `referenceType: "payment"` et
 *   `metadata.sourceSessionId` / `metadata.courierSessionId` ou réservation → `createdInSessionId` / colis → `sessionId`.
 * - Le type `remittance_in` n’existe pas dans `FINANCIAL_TRANSACTION_TYPES` ; on accepte toutefois une chaîne
 *   legacy si présente en base, et on agrège les reçus caisse comme trace de remise.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import { isConfirmedTransactionStatus } from "@/modules/compagnie/treasury/financialTransactions";
import {
  agencyCashAccountDocId,
  agencyPendingCashAccountDocId,
  ledgerAccountDocRef,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import { shipmentRef } from "@/modules/logistics/domain/firestorePaths";
import { OPEN_SHIFT_STATUSES, type ShiftStatusValue } from "@/modules/agence/constants/sessionLifecycle";

const FINANCIAL_TX = "financialTransactions";
const ACCOUNTS = "accounts";
const PAGE_SIZE = 500;
const MAX_PAGES = 100;

/** Firestore `collection(db, ...segments)` attend un tuple non vide ; `string[]` seul casse le typage strict. */
function collectionRefFromSegments(segments: string[]) {
  return collection(db, ...(segments as [string, ...string[]]));
}
/** Tolérance comparaisons montants (FCFA). */
export const AUDIT_MONEY_EPSILON = 0.5;

export type UnifiedSessionType = "guichet" | "courrier";

export type UnifiedSession = {
  id: string;
  type: UnifiedSessionType;
  agentId?: string;
  expectedAmount: number;
  declaredAmount: number;
  discrepancy: number;
  status: string;
  createdAt?: number;
  closedAt?: number;
  validatedAt?: number;
};

export type SessionFinancialTraceStatus =
  | "OK"
  | "MISSING_TRANSACTION"
  | "AMOUNT_MISMATCH"
  | "OVER_RECORDED";

export type SessionFinancialTrace = {
  sessionId: string;
  sessionType: UnifiedSessionType;
  expectedAmount: number;
  declaredAmount: number;
  remittedAmount: number;
  transactionIds: string[];
  accountImpact: number;
  status: SessionFinancialTraceStatus;
  /** Somme des `payment_received` confirmés liés (trace ventes ledger, souvent → pending). */
  linkedSalesAmount: number;
  /** Écritures liées créditant la caisse physique agence (hors reçus). */
  linkedCashCreditAmount: number;
  /** Somme des `cashReceived` sur reçus guichet liés au shift (trace remise métier). */
  cashReceiptsAmount: number;
};

export type LedgerAuditAnomalyType = "missing_transaction" | "amount_mismatch" | "orphan_transaction";

export type LedgerAuditAnomaly = {
  type: LedgerAuditAnomalyType;
  sessionId?: string;
  transactionId?: string;
  message: string;
};

export type CashCycleComplianceIssueType = "double_count" | "missing_remittance" | "wrong_cash_update";

/** Audit lecture seule : respect du cycle ventes → sessions → remise validée → caisse physique (sans vente directe en caisse). */
export type CashCycleComplianceIssue = {
  type: CashCycleComplianceIssueType;
  description: string;
  sessionId?: string;
  transactionId?: string;
};

/**
 * Validation stricte du modèle : caisse = somme remises des sessions validées uniquement,
 * pas d’impact caisse sur sessions actives, pas de vente directe en caisse.
 * `problems` et `numbers` alignés sur la spec « modèle métier = source de vérité » (Firestore réel, lecture seule).
 */
export type StrictCashModelProblemType =
  | "double_count"
  | "missing_remittance"
  | "direct_cash_update"
  | "illegal_cash_injection"
  | "mismatch_session_link"
  | "validation_mismatch";

export type StrictCashModelProblem = {
  type: StrictCashModelProblemType;
  explanation: string;
  /** Présent quand l’anomalie est rattachée à une session ; absent pour écarts globaux ou transaction sans session résolue. */
  sessionId?: string;
};

export type StrictAgencyCashModelAuditReport = {
  companyId: string;
  agencyId: string;
  /**
   * `true` uniquement si : aucun `problem` après déduplication ; **aucune** trace session `SessionFinancialTrace.status !== "OK"` ;
   * données complètes (pas de cap) ; `|cashBalance − totalRemitted| ≤ epsilon`.
   * Si des anomalies subsistent au niveau session, `isValid` reste `false` même lorsque caisse == total remises.
   */
  isValid: boolean;
  problems: StrictCashModelProblem[];
  numbers: {
    totalSales: number;
    totalDeclared: number;
    /** Somme des `remittedAmount` des traces **uniquement** pour sessions validées (guichet validated_agency|validated, courrier VALIDATED). */
    totalRemitted: number;
    cashBalance: number;
  };
};

export type CashCycleComplianceReport = {
  companyId: string;
  agencyId: string;
  isSystemCorrect: boolean;
  issues: CashCycleComplianceIssue[];
  summary: {
    /** Somme des montants « attendus » en session (toutes sessions chargées). */
    totalSales: number;
    /** Somme des montants déclarés (normalisation guichet / courrier). */
    totalDeclared: number;
    /** Tracé remises : reçus caisse + écritures créditant la caisse agence, **sessions validées comptablement uniquement**. */
    totalRemitted: number;
    /** Solde `accounts` compte caisse physique agence. */
    cashBalance: number;
  };
  meta: {
    /** Sessions guichet actives (pending / active / paused) : exclues du cumul remises. */
    activeShiftCount: number;
    /** Sessions courrier PENDING / ACTIVE : exclues du cumul remises. */
    activeCourierCount: number;
    /** Séparateur : déclarations sur sessions encore actives (ne doivent pas alimenter la caisse). */
    totalDeclaredActiveSessions: number;
    /** Cumul remises tracées sur sessions **non** encore validées (fermé mais pas validé) — doit rester ~0 si la caisse n’est alimentée qu’après validation. */
    totalRemittedNonValidatedSessions: number;
    cashVsRemittedGap: number;
  };
};

export type AgencySessionLedgerAuditReport = {
  companyId: string;
  agencyId: string;
  totals: {
    totalExpected: number;
    totalDeclared: number;
    totalRemitted: number;
    totalAccountBalance: number;
  };
  gaps: {
    ecartSession: number;
    ecartRemittance: number;
    ecartAccount: number;
  };
  sessions: SessionFinancialTrace[];
  /** Sessions triées par gravité (critique d’abord), puis par écart décroissant. */
  sessionsBySeverity: SessionFinancialTrace[];
  anomalies: LedgerAuditAnomaly[];
  status: "OK" | "INCOHERENT";
  /** Résumés lisibles (bonus). */
  sessionSummaries: string[];
  meta: {
    shiftsLoaded: number;
    courierSessionsLoaded: number;
    financialTransactionsLoaded: number;
    cashReceiptsLoaded: number;
    financialTransactionsCapped: boolean;
    shiftsCapped: boolean;
    courierSessionsCapped: boolean;
    cashReceiptsCapped: boolean;
  };
};

function tsToMs(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "object" && v !== null && "toMillis" in v && typeof (v as Timestamp).toMillis === "function") {
    return (v as Timestamp).toMillis();
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function sessionKey(type: UnifiedSessionType, id: string): string {
  return `${type}:${id}`;
}

/** Règles guichet : expected = totalCash/amount, declared = audit ou clôture, discrepancy = ecart (signé). */
export function normalizeGuichetShiftToUnifiedSession(
  shiftId: string,
  raw: Record<string, unknown>
): UnifiedSession {
  const st = String(raw.status ?? "");
  const expectedAmount = Number(raw.totalCash ?? raw.amount ?? 0);
  let declaredAmount = 0;
  if (st === "validated_agency" || st === "validated") {
    const audit = raw.validationAudit as { receivedCashAmount?: number } | undefined;
    declaredAmount = Number(audit?.receivedCashAmount ?? 0);
  } else if (st === "closed") {
    declaredAmount = Number(raw.actualAmount ?? 0);
  }
  const discrepancy = Number(raw.ecart ?? 0);
  const agentId = String(raw.userId ?? "") || undefined;
  return {
    id: shiftId,
    type: "guichet",
    agentId,
    expectedAmount,
    declaredAmount,
    discrepancy,
    status: st,
    createdAt: tsToMs(raw.createdAt ?? raw.startTime ?? raw.startAt ?? raw.openedAt),
    closedAt: tsToMs(raw.closedAt ?? raw.endTime ?? raw.endAt),
    validatedAt: tsToMs(
      (raw.validationAudit as { validatedAt?: unknown } | undefined)?.validatedAt ?? raw.validatedAt
    ),
  };
}

/** Règles courrier : expected = amount|totalCash|attendu dérivé, declared = validatedAmount, discrepancy = difference. */
export function normalizeCourierSessionToUnifiedSession(
  sessionId: string,
  raw: Record<string, unknown>
): UnifiedSession {
  const st = String(raw.status ?? "");
  const validatedAmount = Number(raw.validatedAmount ?? 0);
  const difference = Number(raw.difference ?? 0);
  const legacyAmount = Number(raw.amount ?? raw.totalCash ?? 0);
  const expectedFromValidated =
    (st === "VALIDATED" || st === "VALIDATED_AGENCY") && (validatedAmount !== 0 || difference !== 0)
      ? validatedAmount - difference
      : 0;
  const expectedAmount = legacyAmount > 0 ? legacyAmount : expectedFromValidated;
  const declaredAmount = st === "VALIDATED" || st === "VALIDATED_AGENCY" ? validatedAmount : 0;
  const discrepancy = difference;
  const agentId = String(raw.agentId ?? "") || undefined;
  return {
    id: sessionId,
    type: "courrier",
    agentId,
    expectedAmount,
    declaredAmount,
    discrepancy,
    status: st,
    createdAt: tsToMs(raw.createdAt ?? raw.openedAt),
    closedAt: tsToMs(raw.closedAt),
    validatedAt: tsToMs(raw.validatedAt),
  };
}

function isRemittanceLikeTransaction(row: FinancialTransactionDoc): boolean {
  const t = String(row.type ?? "").toLowerCase();
  if (t === "remittance_in" || t.includes("remittance")) return true;
  return false;
}

const COURIER_OPEN_STATUSES = new Set(["PENDING", "ACTIVE"]);

function normalizeShiftStatusRaw(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

function isShiftConsideredActive(status: string): boolean {
  const x = normalizeShiftStatusRaw(status);
  return OPEN_SHIFT_STATUSES.includes(x as ShiftStatusValue);
}

function isCourierConsideredActive(status: string): boolean {
  return COURIER_OPEN_STATUSES.has(String(status ?? "").trim().toUpperCase());
}

function isGuichetValidatedForRemittance(status: string): boolean {
  const x = normalizeShiftStatusRaw(status);
  return x === "validated_agency" || x === "validated";
}

function isCourierValidatedForRemittance(status: string): boolean {
  const u = String(status ?? "").trim().toUpperCase();
  return u === "VALIDATED" || u === "VALIDATED_AGENCY";
}

/** Encaissement espèces guichet / courrier (hors ligne / mobile money) — aligné `agencyCashAuditService`. */
function isPaymentReceivedCashGuichetOrCourier(row: FinancialTransactionDoc): boolean {
  if (row.type !== "payment_received") return false;
  if (!isConfirmedTransactionStatus(row.status)) return false;
  const pm = String(row.paymentMethod ?? "").toLowerCase();
  if (pm === "mobile_money" || pm === "card") return false;
  if (pm !== "cash") return false;
  const ch = String(row.paymentChannel ?? "").toLowerCase();
  if (ch === "online" || ch === "en_ligne") return false;
  return true;
}

function sessionValidatedForRemittance(u: UnifiedSession): boolean {
  if (u.type === "guichet") return isGuichetValidatedForRemittance(u.status);
  return isCourierValidatedForRemittance(u.status);
}

function inferSessionKeyFromFinancialTransaction(
  row: FinancialTransactionDoc & { id: string },
  reservationShiftMap: Map<string, string>,
  shipmentCourierSessionMap: Map<string, string>
): string | null {
  const rt = String(row.referenceType ?? "");
  const refId = String(row.referenceId ?? "");

  if (rt === "shift" && refId) return sessionKey("guichet", refId);
  if (rt === "courier_session" && refId) return sessionKey("courrier", refId);

  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  if (typeof meta.courierSessionId === "string" && meta.courierSessionId.trim()) {
    return sessionKey("courrier", meta.courierSessionId.trim());
  }
  for (const k of ["sourceSessionId", "sessionId", "shiftId"] as const) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return sessionKey("guichet", v.trim());
  }

  const resId = String(row.reservationId ?? "").trim();
  if (resId) {
    if (reservationShiftMap.has(resId)) {
      return sessionKey("guichet", reservationShiftMap.get(resId)!);
    }
    if (shipmentCourierSessionMap.has(resId)) {
      return sessionKey("courrier", shipmentCourierSessionMap.get(resId)!);
    }
  }

  return null;
}

/** Pour relier une écriture au sous-chemin `cashReceipts` (guichet / shiftId). */
function extractShiftIdForCashReceiptLink(
  row: FinancialTransactionDoc,
  inferredSessionKey: string | null
): string | null {
  const rt = String(row.referenceType ?? "");
  const refId = String(row.referenceId ?? "").trim();
  if (rt === "shift" && refId) return refId;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  for (const k of ["shiftId", "sourceSessionId", "sessionId"] as const) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  if (inferredSessionKey?.startsWith("guichet:")) {
    return inferredSessionKey.slice("guichet:".length);
  }
  return null;
}

function classifySessionTrace(declaredAmount: number, remittedAmount: number): SessionFinancialTraceStatus {
  if (declaredAmount <= AUDIT_MONEY_EPSILON && remittedAmount <= AUDIT_MONEY_EPSILON) return "OK";
  if (remittedAmount <= AUDIT_MONEY_EPSILON) return "MISSING_TRANSACTION";
  if (remittedAmount > declaredAmount + AUDIT_MONEY_EPSILON) return "OVER_RECORDED";
  if (Math.abs(remittedAmount - declaredAmount) > AUDIT_MONEY_EPSILON) return "AMOUNT_MISMATCH";
  return "OK";
}

function traceSeverityRank(s: SessionFinancialTraceStatus): number {
  switch (s) {
    case "MISSING_TRANSACTION":
      return 3;
    case "AMOUNT_MISMATCH":
      return 2;
    case "OVER_RECORDED":
      return 1;
    default:
      return 0;
  }
}

function formatMoneyFr(n: number): string {
  return `${Math.round(n).toLocaleString("fr-FR")} FCFA`;
}

function buildReadableSummary(t: SessionFinancialTrace): string {
  const kind = t.sessionType === "guichet" ? "Guichet" : "Courrier";
  let detail = "";
  if (t.status === "MISSING_TRANSACTION") {
    detail = `${formatMoneyFr(t.declaredAmount)} déclaré / ${formatMoneyFr(t.remittedAmount)} tracé → transaction ou reçu manquant`;
  } else if (t.status === "AMOUNT_MISMATCH") {
    detail = `déclaré ${formatMoneyFr(t.declaredAmount)} ≠ tracé ${formatMoneyFr(t.remittedAmount)}`;
  } else if (t.status === "OVER_RECORDED") {
    detail = `sur-enregistrement : tracé ${formatMoneyFr(t.remittedAmount)} > déclaré ${formatMoneyFr(t.declaredAmount)}`;
  } else {
    detail = `OK — tracé ${formatMoneyFr(t.remittedAmount)}`;
  }
  return `${kind} ${t.sessionId.slice(0, 12)}… → attendu ${formatMoneyFr(t.expectedAmount)} / ${detail}`;
}

async function paginateFinancialTransactionsAgency(
  companyId: string,
  agencyId: string
): Promise<{ rows: Array<FinancialTransactionDoc & { id: string }>; capped: boolean }> {
  const col = collection(db, "companies", companyId, FINANCIAL_TX);
  const rows: Array<FinancialTransactionDoc & { id: string }> = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  let capped = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await getDocs(
      query(
        col,
        where("agencyId", "==", agencyId),
        orderBy("performedAt", "desc"),
        limit(PAGE_SIZE),
        ...(last ? [startAfter(last)] : [])
      )
    );
    if (snap.empty) break;
    snap.docs.forEach((d) => {
      rows.push({ id: d.id, ...(d.data() as FinancialTransactionDoc) });
    });
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) capped = true;
  }

  return { rows, capped };
}

async function paginateCollectionDocs(
  colPath: string[],
  orderField: string,
  descending: boolean
): Promise<{ docs: QueryDocumentSnapshot<DocumentData>[]; capped: boolean }> {
  const colRef = collectionRefFromSegments(colPath);
  const docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let last: QueryDocumentSnapshot<DocumentData> | undefined;
  let capped = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const snap = await getDocs(
      query(
        colRef,
        orderBy(orderField, descending ? "desc" : "asc"),
        limit(PAGE_SIZE),
        ...(last ? [startAfter(last)] : [])
      )
    );
    if (snap.empty) break;
    docs.push(...snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) capped = true;
  }

  return { docs, capped };
}

async function loadReservationShiftMap(
  companyId: string,
  agencyId: string,
  reservationIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(reservationIds.filter(Boolean))];
  for (const batch of chunks(unique, 25)) {
    await Promise.all(
      batch.map(async (id) => {
        try {
          const ref = doc(db, "companies", companyId, "agences", agencyId, "reservations", id);
          const snap = await getDoc(ref);
          if (!snap.exists()) return;
          const sid = (snap.data() as { createdInSessionId?: string }).createdInSessionId;
          if (typeof sid === "string" && sid.trim()) map.set(id, sid.trim());
        } catch {
          /* permission / manquant */
        }
      })
    );
  }
  return map;
}

async function loadShipmentCourierSessionMap(
  companyId: string,
  shipmentIds: string[]
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(shipmentIds.filter(Boolean))];
  for (const batch of chunks(unique, 25)) {
    await Promise.all(
      batch.map(async (id) => {
        try {
          const snap = await getDoc(shipmentRef(db, companyId, id));
          if (!snap.exists()) return;
          const sid = (snap.data() as { sessionId?: string }).sessionId;
          if (typeof sid === "string" && sid.trim()) map.set(id, sid.trim());
        } catch {
          /* ignore */
        }
      })
    );
  }
  return map;
}

async function loadCashReceiptsByShiftId(
  companyId: string,
  agencyId: string
): Promise<{
  byShift: Map<string, { total: number; ids: string[] }>;
  capped: boolean;
}> {
  const path = ["companies", companyId, "agences", agencyId, "cashReceipts"];
  let docs: QueryDocumentSnapshot<DocumentData>[] = [];
  let capped = false;
  try {
    const r = await paginateCollectionDocs(path, "createdAt", true);
    docs = r.docs;
    capped = r.capped;
  } catch {
    const snap = await getDocs(query(collectionRefFromSegments(path), limit(PAGE_SIZE)));
    docs = snap.docs;
    capped = snap.docs.length >= PAGE_SIZE;
  }
  const byShift = new Map<string, { total: number; ids: string[] }>();
  docs.forEach((d) => {
    const x = d.data() as Record<string, unknown>;
    const shiftId = String(x.shiftId ?? "").trim();
    if (!shiftId) return;
    const cash = Number(x.cashReceived ?? x.amount ?? 0);
    if (!Number.isFinite(cash) || cash <= 0) return;
    const cur = byShift.get(shiftId) ?? { total: 0, ids: [] as string[] };
    cur.total += cash;
    cur.ids.push(d.id);
    byShift.set(shiftId, cur);
  });
  return { byShift, capped };
}

export type AgencySessionLedgerAuditBundle = {
  report: AgencySessionLedgerAuditReport;
  ftRows: Array<FinancialTransactionDoc & { id: string }>;
  unified: UnifiedSession[];
  cashAccountDocId: string;
  pendingCashAccountId: string;
  reservationShiftMap: Map<string, string>;
  shipmentCourierMap: Map<string, string>;
  shiftIdSet: Set<string>;
  courierIdSet: Set<string>;
  /** Reçus guichet agrégés par `shiftId` (Firestore `cashReceipts`). */
  cashReceiptsByShift: Map<string, { total: number; ids: string[] }>;
};

/**
 * Cœur de l’audit (une passe Firestore) — réutilisable sans log console.
 */
async function buildAgencySessionLedgerAuditBundle(
  companyId: string,
  agencyId: string
): Promise<AgencySessionLedgerAuditBundle> {
  const cashAccountDocId = agencyCashAccountDocId(agencyId);
  const pendingCashAccountId = agencyPendingCashAccountDocId(agencyId);

  const shiftsPath = ["companies", companyId, "agences", agencyId, "shifts"];
  let shiftDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  let shiftsCapped = false;
  try {
    const r = await paginateCollectionDocs(shiftsPath, "updatedAt", true);
    shiftDocs = r.docs;
    shiftsCapped = r.capped;
  } catch {
    const r = await paginateCollectionDocs(shiftsPath, "createdAt", true);
    shiftDocs = r.docs;
    shiftsCapped = r.capped;
  }

  let courierDocs: QueryDocumentSnapshot<DocumentData>[] = [];
  let courierCapped = false;
  const courierPath = ["companies", companyId, "agences", agencyId, "courierSessions"];
  try {
    const r = await paginateCollectionDocs(courierPath, "updatedAt", true);
    courierDocs = r.docs;
    courierCapped = r.capped;
  } catch {
    const r = await paginateCollectionDocs(courierPath, "createdAt", true);
    courierDocs = r.docs;
    courierCapped = r.capped;
  }

  const { rows: ftRows, capped: ftCapped } = await paginateFinancialTransactionsAgency(companyId, agencyId);

  const { byShift: cashReceiptsByShift, capped: receiptsCapped } = await loadCashReceiptsByShiftId(
    companyId,
    agencyId
  );

  const unified: UnifiedSession[] = [
    ...shiftDocs.map((d) => normalizeGuichetShiftToUnifiedSession(d.id, d.data() as Record<string, unknown>)),
    ...courierDocs.map((d) =>
      normalizeCourierSessionToUnifiedSession(d.id, d.data() as Record<string, unknown>)
    ),
  ];

  const shiftIdSet = new Set(shiftDocs.map((d) => d.id));
  const courierIdSet = new Set(courierDocs.map((d) => d.id));

  const reservationIds: string[] = [];
  ftRows.forEach((row) => {
    const rid = String(row.reservationId ?? "").trim();
    if (rid) reservationIds.push(rid);
  });

  const [reservationShiftMap, shipmentCourierMap] = await Promise.all([
    loadReservationShiftMap(companyId, agencyId, reservationIds),
    loadShipmentCourierSessionMap(companyId, reservationIds),
  ]);

  const txBySession = new Map<string, Array<FinancialTransactionDoc & { id: string }>>();
  const orphanAnomalies: LedgerAuditAnomaly[] = [];

  for (const row of ftRows) {
    if (!isConfirmedTransactionStatus(row.status)) continue;

    const key = inferSessionKeyFromFinancialTransaction(row, reservationShiftMap, shipmentCourierMap);

    const rt = String(row.referenceType ?? "");
    const refId = String(row.referenceId ?? "");
    if (rt === "shift" && refId && !shiftIdSet.has(refId)) {
      orphanAnomalies.push({
        type: "orphan_transaction",
        transactionId: row.id,
        message: `Transaction référence shift "${refId}" introuvable dans les shifts chargés.`,
      });
    }
    if (rt === "courier_session" && refId && !courierIdSet.has(refId)) {
      orphanAnomalies.push({
        type: "orphan_transaction",
        transactionId: row.id,
        message: `Transaction référence courier_session "${refId}" introuvable dans les sessions chargées.`,
      });
    }

    if (isRemittanceLikeTransaction(row) && !key) {
      orphanAnomalies.push({
        type: "orphan_transaction",
        transactionId: row.id,
        message: `Écriture type "${row.type}" sans session résolue (orphan remittance-like).`,
      });
    }

    if (!key) continue;
    const list = txBySession.get(key) ?? [];
    list.push(row);
    txBySession.set(key, list);
  }

  const sessions: SessionFinancialTrace[] = unified.map((u) => {
    const key = sessionKey(u.type, u.id);
    const linked = txBySession.get(key) ?? [];

    let linkedSalesAmount = 0;
    let linkedCashCreditAmount = 0;
    /** Somme des écritures `remittance` confirmées (source de vérité ledger pour la remise). */
    let remittanceLedgerAmount = 0;
    let accountImpact = 0;
    const transactionIds: string[] = [];

    linked.forEach((row) => {
      transactionIds.push(row.id);
      const amt = Number(row.amount ?? 0);
      if (!Number.isFinite(amt)) return;
      const ok = isConfirmedTransactionStatus(row.status);
      const credit = String(row.creditAccountId ?? "");

      if (row.type === "payment_received" && amt > 0 && ok) {
        linkedSalesAmount += amt;
      }

      if (row.type === "remittance" && amt > 0 && ok) {
        remittanceLedgerAmount += amt;
        linkedCashCreditAmount += amt;
        accountImpact += amt;
      } else if (credit === cashAccountDocId && amt > 0 && ok) {
        linkedCashCreditAmount += amt;
        accountImpact += amt;
      } else if (isRemittanceLikeTransaction(row) && row.type !== "remittance" && amt > 0 && ok) {
        linkedCashCreditAmount += amt;
      }
    });

    const receipts = u.type === "guichet" ? cashReceiptsByShift.get(u.id) : undefined;
    const cashReceiptsAmount = receipts?.total ?? 0;
    const cashReceiptIds = receipts?.ids ?? [];

    /**
     * Remise tracée : si une écriture `remittance` existe, le total suit le journal uniquement (évite le double
     * comptage avec `cashReceipts`). Sinon reçus + crédits caisse (legacy / transitions).
     */
    const remittedAmount =
      remittanceLedgerAmount > 0 ? linkedCashCreditAmount : cashReceiptsAmount + linkedCashCreditAmount;
    const status = classifySessionTrace(u.declaredAmount, remittedAmount);

    return {
      sessionId: u.id,
      sessionType: u.type,
      expectedAmount: u.expectedAmount,
      declaredAmount: u.declaredAmount,
      remittedAmount,
      transactionIds: [...transactionIds, ...cashReceiptIds.map((id) => `cashReceipt:${id}`)],
      accountImpact,
      status,
      linkedSalesAmount,
      linkedCashCreditAmount,
      cashReceiptsAmount,
    };
  });

  const anomalies: LedgerAuditAnomaly[] = [...orphanAnomalies];

  sessions.forEach((t) => {
    if (t.status === "MISSING_TRANSACTION") {
      anomalies.push({
        type: "missing_transaction",
        sessionId: t.sessionId,
        message: `Session ${t.sessionType} ${t.sessionId} : déclaré ${formatMoneyFr(t.declaredAmount)} mais aucune trace transaction/reçu.`,
      });
    } else if (t.status === "AMOUNT_MISMATCH") {
      anomalies.push({
        type: "amount_mismatch",
        sessionId: t.sessionId,
        message: `Session ${t.sessionType} ${t.sessionId} : déclaré ${formatMoneyFr(t.declaredAmount)} ≠ tracé ${formatMoneyFr(t.remittedAmount)}.`,
      });
    } else if (t.status === "OVER_RECORDED") {
      anomalies.push({
        type: "amount_mismatch",
        sessionId: t.sessionId,
        message: `Session ${t.sessionType} ${t.sessionId} : sur-enregistrement tracé ${formatMoneyFr(t.remittedAmount)} > déclaré ${formatMoneyFr(t.declaredAmount)}.`,
      });
    }
  });

  const totalExpected = unified.reduce((s, u) => s + u.expectedAmount, 0);
  const totalDeclared = unified.reduce((s, u) => s + u.declaredAmount, 0);
  const totalRemitted = sessions.reduce((s, t) => s + t.remittedAmount, 0);

  let totalAccountBalance = 0;
  try {
    const accSnap = await getDoc(ledgerAccountDocRef(companyId, cashAccountDocId));
    if (accSnap.exists()) {
      totalAccountBalance = Number((accSnap.data() as { balance?: number }).balance ?? 0);
    }
  } catch {
    totalAccountBalance = 0;
  }

  const ecartSession = totalDeclared - totalExpected;
  const ecartRemittance = totalRemitted - totalDeclared;
  const ecartAccount = totalAccountBalance - totalRemitted;

  const sessionsBySeverity = [...sessions].sort((a, b) => {
    const dr = traceSeverityRank(b.status) - traceSeverityRank(a.status);
    if (dr !== 0) return dr;
    return (
      Math.abs(b.declaredAmount - b.remittedAmount) - Math.abs(a.declaredAmount - a.remittedAmount)
    );
  });

  const sessionSummaries = sessionsBySeverity.map(buildReadableSummary);

  const globalOk = anomalies.length === 0 && sessions.every((t) => t.status === "OK");

  const report: AgencySessionLedgerAuditReport = {
    companyId,
    agencyId,
    totals: {
      totalExpected,
      totalDeclared,
      totalRemitted,
      totalAccountBalance,
    },
    gaps: {
      ecartSession,
      ecartRemittance,
      ecartAccount,
    },
    sessions,
    sessionsBySeverity,
    anomalies,
    status: globalOk ? "OK" : "INCOHERENT",
    sessionSummaries,
    meta: {
      shiftsLoaded: shiftDocs.length,
      courierSessionsLoaded: courierDocs.length,
      financialTransactionsLoaded: ftRows.length,
      cashReceiptsLoaded: [...cashReceiptsByShift.values()].reduce((n, v) => n + v.ids.length, 0),
      financialTransactionsCapped: ftCapped,
      shiftsCapped,
      courierSessionsCapped: courierCapped,
      cashReceiptsCapped: receiptsCapped,
    },
  };

  return {
    report,
    ftRows,
    unified,
    cashAccountDocId,
    pendingCashAccountId,
    reservationShiftMap,
    shipmentCourierMap,
    shiftIdSet,
    courierIdSet,
    cashReceiptsByShift,
  };
}

function logAgencySessionLedgerAuditToConsole(report: AgencySessionLedgerAuditReport): void {
  console.group("AUDIT FINANCIER");
  console.log("Totals:", report.totals);
  console.log("Gaps:", report.gaps);
  console.log("Meta (pagination):", report.meta);
  console.table(
    report.sessionsBySeverity.map((t) => ({
      sessionId: t.sessionId,
      type: t.sessionType,
      expected: t.expectedAmount,
      declared: t.declaredAmount,
      remitted: t.remittedAmount,
      salesLedger: t.linkedSalesAmount,
      cashCredit: t.linkedCashCreditAmount,
      receipts: t.cashReceiptsAmount,
      accountImpact: t.accountImpact,
      status: t.status,
    }))
  );
  if (report.anomalies.length > 0) {
    console.warn("Anomalies:", report.anomalies);
  }
  console.groupEnd();
}

/**
 * Audit complet lecture seule : shifts + courierSessions + financialTransactions + cashReceipts + solde compte caisse.
 */
export async function runAgencySessionLedgerAudit(
  companyId: string,
  agencyId: string
): Promise<AgencySessionLedgerAuditReport> {
  const bundle = await buildAgencySessionLedgerAuditBundle(companyId, agencyId);
  logAgencySessionLedgerAuditToConsole(bundle.report);
  return bundle.report;
}

/**
 * Vérifie le cycle métier : ventes dans les sessions → remise uniquement après validation → caisse physique.
 * Lecture seule. S’appuie sur le même chargement paginé que `runAgencySessionLedgerAudit`.
 */
export async function runAgencyCashCycleComplianceAudit(
  companyId: string,
  agencyId: string
): Promise<CashCycleComplianceReport> {
  const bundle = await buildAgencySessionLedgerAuditBundle(companyId, agencyId);
  const {
    report,
    ftRows,
    unified,
    cashAccountDocId,
    pendingCashAccountId,
    reservationShiftMap,
    shipmentCourierMap,
  } = bundle;

  const issues: CashCycleComplianceIssue[] = [];
  const traceByKey = new Map<string, SessionFinancialTrace>();
  for (const t of report.sessions) {
    traceByKey.set(sessionKey(t.sessionType, t.sessionId), t);
  }

  for (const row of ftRows) {
    if (!isConfirmedTransactionStatus(row.status)) continue;
    if (!isPaymentReceivedCashGuichetOrCourier(row)) continue;
    const amt = Number(row.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= AUDIT_MONEY_EPSILON) continue;
    const credit = String(row.creditAccountId ?? "");
    if (credit !== cashAccountDocId) continue;

    const sk = inferSessionKeyFromFinancialTransaction(row, reservationShiftMap, shipmentCourierMap);
    const sessionIdForMsg = sk ? sk.replace(/^(guichet|courrier):/, "") : undefined;

    issues.push({
      type: "wrong_cash_update",
      transactionId: row.id,
      sessionId: sessionIdForMsg,
      description: `Vente espèces (payment_received, ${formatMoneyFr(amt)}) crédite directement le compte caisse physique — le modèle Teliya attend le pending (${pendingCashAccountId}) jusqu’à remise validée.`,
    });
  }

  let activeShiftCount = 0;
  let activeCourierCount = 0;
  let totalDeclaredActiveSessions = 0;
  let totalRemittedNonValidatedSessions = 0;
  let totalRemittedValidatedOnly = 0;

  const totalSales = unified.reduce((s, u) => s + u.expectedAmount, 0);
  const totalDeclaredAll = unified.reduce((s, u) => s + u.declaredAmount, 0);
  const cashBalance = report.totals.totalAccountBalance;

  for (const u of unified) {
    const key = sessionKey(u.type, u.id);
    const tr = traceByKey.get(key);
    if (!tr) continue;

    const guichetActive = u.type === "guichet" && isShiftConsideredActive(u.status);
    const courierActive = u.type === "courrier" && isCourierConsideredActive(u.status);
    const active = guichetActive || courierActive;
    if (guichetActive) activeShiftCount += 1;
    if (courierActive) activeCourierCount += 1;

    const validated = sessionValidatedForRemittance(u);

    if (active) {
      totalDeclaredActiveSessions += u.declaredAmount;
    }

    if (validated) {
      totalRemittedValidatedOnly += tr.remittedAmount;
    } else {
      totalRemittedNonValidatedSessions += tr.remittedAmount;
    }

    if (!validated && tr.remittedAmount > AUDIT_MONEY_EPSILON) {
      let ctx = "Session non validée comptablement";
      if (u.type === "guichet") {
        if (isShiftConsideredActive(u.status)) ctx = "Session guichet ouverte / en cours";
        else if (normalizeShiftStatusRaw(u.status) === "closed") {
          ctx = "Session guichet fermée (remise non encore validée)";
        }
      } else if (isCourierConsideredActive(u.status)) {
        ctx = "Session courrier ouverte";
      } else if (String(u.status ?? "").toUpperCase() === "CLOSED") {
        ctx = "Session courrier clôturée (non validée comptablement)";
      }
      issues.push({
        type: "wrong_cash_update",
        sessionId: u.id,
        description: `${ctx} : ${formatMoneyFr(
          tr.remittedAmount
        )} tracés comme remise / caisse — la caisse physique ne doit être alimentée qu’après validation de la remise.`,
      });
    }

    if (validated && u.declaredAmount > AUDIT_MONEY_EPSILON && tr.remittedAmount < u.declaredAmount - AUDIT_MONEY_EPSILON) {
      issues.push({
        type: "missing_remittance",
        sessionId: u.id,
        description: `Session validée : déclaré ${formatMoneyFr(u.declaredAmount)}, tracé remise/caisse ${formatMoneyFr(
          tr.remittedAmount
        )} — remise ou reçu manquant.`,
      });
    }

    if (validated && tr.status === "OVER_RECORDED") {
      issues.push({
        type: "double_count",
        sessionId: u.id,
        description: `Session validée : tracé ${formatMoneyFr(tr.remittedAmount)} > déclaré ${formatMoneyFr(
          u.declaredAmount
        )} — risque de double comptabilisation.`,
      });
    }
  }

  const cashVsRemittedGap = cashBalance - totalRemittedValidatedOnly;

  const issueKey = (i: CashCycleComplianceIssue) =>
    `${i.type}|${i.sessionId ?? ""}|${i.transactionId ?? ""}|${i.description.slice(0, 80)}`;
  const seen = new Set<string>();
  const deduped = issues.filter((i) => {
    const k = issueKey(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const out: CashCycleComplianceReport = {
    companyId,
    agencyId,
    isSystemCorrect: deduped.length === 0,
    issues: deduped,
    summary: {
      totalSales,
      totalDeclared: totalDeclaredAll,
      totalRemitted: totalRemittedValidatedOnly,
      cashBalance,
    },
    meta: {
      activeShiftCount,
      activeCourierCount,
      totalDeclaredActiveSessions,
      totalRemittedNonValidatedSessions,
      cashVsRemittedGap,
    },
  };

  console.group("AUDIT CYCLE COMPTABLE (lecture seule)");
  console.log("Ventes (montants attendus en sessions):", out.summary.totalSales);
  console.log("Déclarations (total déclaré, toutes sessions):", out.summary.totalDeclared);
  console.log("Remises tracées (sessions validées comptablement uniquement):", out.summary.totalRemitted);
  console.log("Caisse (solde accounts, caisse physique agence):", out.summary.cashBalance);
  console.log("Méta:", out.meta);
  if (deduped.length > 0) {
    console.warn("Écarts de cycle:", deduped);
  } else {
    console.log("Aucun écart de cycle détecté sur les règles automatiques.");
  }
  console.groupEnd();

  return out;
}

function strictProblemKey(p: StrictCashModelProblem): string {
  return `${p.type}|${p.sessionId ?? ""}|${p.explanation.slice(0, 120)}`;
}

/**
 * Audit **strict** du modèle métier caisse ↔ sessions (Firestore réel, aucune écriture).
 *
 * Règle `isValid` : aucun `problem` ; **toutes** les traces `SessionFinancialTrace` en `OK` ;
 * échantillon complet (pas de cap) ; `|cashBalance − numbers.totalRemitted| ≤ AUDIT_MONEY_EPSILON`.
 */
export async function runStrictAgencyCashModelAudit(
  companyId: string,
  agencyId: string
): Promise<StrictAgencyCashModelAuditReport> {
  const bundle = await buildAgencySessionLedgerAuditBundle(companyId, agencyId);
  const {
    report,
    ftRows,
    unified,
    cashAccountDocId,
    pendingCashAccountId,
    reservationShiftMap,
    shipmentCourierMap,
    cashReceiptsByShift,
  } = bundle;

  const problems: StrictCashModelProblem[] = [];
  const traceByKey = new Map<string, SessionFinancialTrace>();
  for (const t of report.sessions) {
    traceByKey.set(sessionKey(t.sessionType, t.sessionId), t);
  }

  const unifiedByKey = new Map<string, UnifiedSession>();
  for (const u of unified) {
    unifiedByKey.set(sessionKey(u.type, u.id), u);
  }

  for (const shiftId of cashReceiptsByShift.keys()) {
    const totalRcpt = cashReceiptsByShift.get(shiftId)?.total ?? 0;
    if (!Number.isFinite(totalRcpt) || totalRcpt <= AUDIT_MONEY_EPSILON) continue;
    const guichetKey = sessionKey("guichet", shiftId);
    const uShift = unifiedByKey.get(guichetKey);
    if (!uShift) {
      problems.push({
        type: "illegal_cash_injection",
        sessionId: shiftId,
        explanation: `Données cashReceipts Firestore (shiftId=${shiftId}, total reçu ${formatMoneyFr(
          totalRcpt
        )}) : aucune session guichet chargée avec cet id — réception incohérente ou shift hors périmètre.`,
      });
      continue;
    }
    if (!sessionValidatedForRemittance(uShift)) {
      problems.push({
        type: "illegal_cash_injection",
        sessionId: shiftId,
        explanation: `cashReceipts présents pour shiftId=${shiftId} (${formatMoneyFr(
          totalRcpt
        )}) alors que la session n’est pas validée comptablement (statut lu=${uShift.status}) — seules les sessions validées doivent lier remise/caisse.`,
      });
    }
  }

  for (const row of ftRows) {
    if (!isConfirmedTransactionStatus(row.status)) continue;
    if (!isPaymentReceivedCashGuichetOrCourier(row)) continue;
    const amt = Number(row.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= AUDIT_MONEY_EPSILON) continue;
    const credit = String(row.creditAccountId ?? "");
    if (credit !== cashAccountDocId) continue;

    const sk = inferSessionKeyFromFinancialTransaction(row, reservationShiftMap, shipmentCourierMap);
    const sessionIdForMsg = sk ? sk.replace(/^(guichet|courrier):/, "") : undefined;

    problems.push({
      type: "direct_cash_update",
      sessionId: sessionIdForMsg,
      explanation: `financialTransactions id=${row.id} : payment_received espèces ${formatMoneyFr(
        amt
      )} avec creditAccountId=compte caisse physique (${cashAccountDocId}) — interdit si la vente doit passer par pending (${pendingCashAccountId}) jusqu’à remise validée.`,
    });
  }

  for (const row of ftRows) {
    if (!isConfirmedTransactionStatus(row.status)) continue;
    if (row.type === "payment_received") continue;
    const amt = Number(row.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= AUDIT_MONEY_EPSILON) continue;
    const credit = String(row.creditAccountId ?? "");
    if (credit !== cashAccountDocId) continue;

    const inferKey = inferSessionKeyFromFinancialTransaction(row, reservationShiftMap, shipmentCourierMap);
    const uLinked = inferKey ? unifiedByKey.get(inferKey) : undefined;
    const hasValidatedSessionLink = !!(uLinked && sessionValidatedForRemittance(uLinked));

    const shiftId = extractShiftIdForCashReceiptLink(row, inferKey);
    const receiptTotal = shiftId ? (cashReceiptsByShift.get(shiftId)?.total ?? 0) : 0;
    const hasCashReceiptLink = receiptTotal > AUDIT_MONEY_EPSILON;

    if (!hasValidatedSessionLink && !hasCashReceiptLink) {
      const sid =
        shiftId ??
        (inferKey ? inferKey.replace(/^(guichet|courrier):/, "") : undefined);
      problems.push({
        type: "illegal_cash_injection",
        sessionId: sid,
        explanation: `financialTransactions id=${row.id} : crédit ${formatMoneyFr(
          amt
        )} sur compte caisse physique (${cashAccountDocId}) sans session validée liée (inférence clé=${inferKey ?? "∅"}) et sans cashReceipt Firestore pour le shiftId extrait (${shiftId ?? "∅"}).`,
      });
    }
  }

  for (const row of ftRows) {
    if (!isConfirmedTransactionStatus(row.status)) continue;
    const amt = Number(row.amount ?? 0);
    if (!Number.isFinite(amt) || amt <= AUDIT_MONEY_EPSILON) continue;
    const credit = String(row.creditAccountId ?? "");
    if (credit !== cashAccountDocId) continue;
    if (isPaymentReceivedCashGuichetOrCourier(row)) continue;

    const inferKey = inferSessionKeyFromFinancialTransaction(row, reservationShiftMap, shipmentCourierMap);
    if (!inferKey) continue;
    const tr = traceByKey.get(inferKey);
    if (!tr) continue;
    /** Une écriture ne peut créditer la caisse au-delà du cumul remise tracé pour la session liée. */
    if (amt > tr.remittedAmount + AUDIT_MONEY_EPSILON) {
      problems.push({
        type: "mismatch_session_link",
        sessionId: tr.sessionId,
        explanation: `financialTransactions id=${row.id} : crédit caisse ${formatMoneyFr(
          amt
        )} > remittedAmount agrégé session (${formatMoneyFr(tr.remittedAmount)}) pour ${inferKey}.`,
      });
    }
  }

  let totalValidatedRemittance = 0;
  const totalSales = unified.reduce((s, u) => s + u.expectedAmount, 0);
  const totalDeclared = unified.reduce((s, u) => s + u.declaredAmount, 0);
  const cashBalance = report.totals.totalAccountBalance;

  for (const u of unified) {
    const key = sessionKey(u.type, u.id);
    const tr = traceByKey.get(key);
    if (!tr) continue;

    const validated = sessionValidatedForRemittance(u);

    if (validated) {
      totalValidatedRemittance += tr.remittedAmount;
    }

    const guichetActive = u.type === "guichet" && isShiftConsideredActive(u.status);
    const courierActive = u.type === "courrier" && isCourierConsideredActive(u.status);
    const sessionActive = guichetActive || courierActive;

    const cashTouch =
      tr.remittedAmount > AUDIT_MONEY_EPSILON || tr.accountImpact > AUDIT_MONEY_EPSILON;

    if (!validated && cashTouch) {
      let ctx = "Session non validée comptablement";
      if (sessionActive) {
        ctx =
          u.type === "guichet"
            ? "Session guichet active (pending / active / paused)"
            : "Session courrier active (PENDING / ACTIVE)";
      } else if (u.type === "guichet" && normalizeShiftStatusRaw(u.status) === "closed") {
        ctx = "Session guichet fermée, remise non validée";
      } else if (String(u.status ?? "").toUpperCase() === "CLOSED") {
        ctx = "Session courrier clôturée, non validée comptablement";
      }
      problems.push({
        type: "direct_cash_update",
        sessionId: u.id,
        explanation: `${ctx} : remittedAmount=${formatMoneyFr(tr.remittedAmount)}, crédits ledger caisse liés (accountImpact)=${formatMoneyFr(
          tr.accountImpact
        )} — une session non validée ne doit pas avoir de trace remise ni d’impact sur le compte caisse.`,
      });
    }

    if (validated && u.declaredAmount > AUDIT_MONEY_EPSILON) {
      const hasCashReceipt =
        u.type === "guichet" &&
        (cashReceiptsByShift.get(u.id)?.total ?? 0) > AUDIT_MONEY_EPSILON;
      const hasLedgerCashToAgency = tr.accountImpact > AUDIT_MONEY_EPSILON;
      if (!hasCashReceipt && !hasLedgerCashToAgency) {
        problems.push({
          type: "missing_remittance",
          sessionId: u.id,
          explanation: `Session validée, déclaré ${formatMoneyFr(
            u.declaredAmount
          )} : aucun document cashReceipt Firestore pour ce shift et aucun crédit confirmé vers le compte caisse physique (accountImpact=0) parmi les écritures liées.`,
        });
      }
    }

    if (
      validated &&
      Math.abs(u.declaredAmount - tr.remittedAmount) > AUDIT_MONEY_EPSILON
    ) {
      problems.push({
        type: "validation_mismatch",
        sessionId: u.id,
        explanation: `Session validée : declaredAmount ${formatMoneyFr(
          u.declaredAmount
        )} ≠ remittedAmount (trace) ${formatMoneyFr(tr.remittedAmount)} (seuil ${AUDIT_MONEY_EPSILON} FCFA).`,
      });
    }

    if (validated && tr.status === "OVER_RECORDED") {
      problems.push({
        type: "double_count",
        sessionId: u.id,
        explanation: `Session validée : tracé remise/caisse ${formatMoneyFr(tr.remittedAmount)} > déclaré ${formatMoneyFr(
          u.declaredAmount
        )} — double comptabilisation possible sur les écritures/reçus liés.`,
      });
    }
  }

  const dataIncomplete =
    report.meta.financialTransactionsCapped ||
    report.meta.shiftsCapped ||
    report.meta.courierSessionsCapped ||
    report.meta.cashReceiptsCapped;

  if (dataIncomplete) {
    problems.push({
      type: "missing_remittance",
      explanation: `Chargement Firestore non exhaustif (meta: financialTransactionsCapped=${report.meta.financialTransactionsCapped}, shiftsCapped=${report.meta.shiftsCapped}, courierSessionsCapped=${report.meta.courierSessionsCapped}, cashReceiptsCapped=${report.meta.cashReceiptsCapped}) — l’égalité stricte cashBalance === numbers.totalRemitted n’est pas prouvable sur toute l’historique.`,
    });
  } else if (Math.abs(cashBalance - totalValidatedRemittance) > AUDIT_MONEY_EPSILON) {
    if (cashBalance > totalValidatedRemittance + AUDIT_MONEY_EPSILON) {
      problems.push({
        type: "missing_remittance",
        explanation: `Égalité stricte non respectée : cashBalance compte agency_cash ${formatMoneyFr(
          cashBalance
        )} > somme remises tracées sessions validées ${formatMoneyFr(totalValidatedRemittance)}.`,
      });
    } else {
      problems.push({
        type: "double_count",
        explanation: `Égalité stricte non respectée : cashBalance ${formatMoneyFr(
          cashBalance
        )} < somme remises tracées sessions validées ${formatMoneyFr(totalValidatedRemittance)} (sur-comptage remises ou autres causes).`,
      });
    }
  }

  const seen = new Set<string>();
  const deduped = problems.filter((p) => {
    const k = strictProblemKey(p);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const sessionTraceAnomaly = report.sessions.some((t) => t.status !== "OK");

  const out: StrictAgencyCashModelAuditReport = {
    companyId,
    agencyId,
    isValid: deduped.length === 0 && !sessionTraceAnomaly,
    problems: deduped,
    numbers: {
      totalSales,
      totalDeclared,
      totalRemitted: totalValidatedRemittance,
      cashBalance,
    },
  };

  console.group("AUDIT STRICT MODÈLE CAISSE (lecture seule)");
  console.log("numbers:", out.numbers);
  console.log("sessionTraceAnomaly (trace.status !== OK):", sessionTraceAnomaly);
  console.log("isValid:", out.isValid);
  if (deduped.length > 0) {
    console.warn("problems:", deduped);
  }
  console.groupEnd();

  return out;
}

export function explainSessionTracePublic(t: SessionFinancialTrace): string {
  return buildReadableSummary(t);
}
