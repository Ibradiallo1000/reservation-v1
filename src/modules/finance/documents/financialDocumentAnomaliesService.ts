import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  doc,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type {
  FinancialDocumentDoc,
  FinancialDocumentSourceType,
  FinancialDocumentType,
} from "./financialDocuments.types";
import {
  applyFinancialDocumentFilters,
  isSignedAttachmentMissing,
  listFinancialDocuments,
} from "./financialDocumentsService";
import type {
  FinancialDocumentAnomaly,
  FinancialDocumentAnomalyAggregateRow,
  FinancialDocumentAnomalyComputation,
  FinancialDocumentAnomalyFilter,
  FinancialDocumentAnomalySeverity,
  FinancialDocumentAnomalyStatus,
  FinancialDocumentAnomalySummary,
  FinancialDocumentAnomalyType,
} from "./financialDocumentAnomalies.types";

type FinancialDocumentRow = FinancialDocumentDoc & { id: string };

type SourceSnapshot = {
  sourceType: FinancialDocumentSourceType;
  sourceId: string;
  companyId: string;
  agencyId: string | null;
  businessReference: string | null;
  amountPrincipal: number | null;
  actorUid: string | null;
  actorSummary: string | null;
  status: string | null;
  isFinalized: boolean;
  finalizedAtMs: number | null;
  metadata?: Record<string, unknown>;
};

type SourceMap = Map<string, SourceSnapshot>;
type SourceLoadResult = {
  rows: SourceMap;
  available: boolean;
};

type AnomalyOverrideDoc = {
  status: FinancialDocumentAnomalyStatus;
  resolutionNote?: string | null;
};

const STALE_DOCUMENT_THRESHOLD_HOURS = 48;
const STALE_DOCUMENT_THRESHOLD_MS = STALE_DOCUMENT_THRESHOLD_HOURS * 60 * 60 * 1000;

const MOBILE_MONEY_PROVIDERS = new Set(["wave", "orange", "moov", "sarali"]);
const PAYABLE_EXECUTION_DOCUMENT_TYPES = new Set<FinancialDocumentType>([
  "cash_disbursement",
  "supplier_payment_order",
]);

const SINGLE_DOCUMENT_TYPES = new Set<FinancialDocumentType>([
  "session_remittance",
  "accounting_remittance_receipt",
  "treasury_transfer",
  "bank_deposit_slip",
  "treasury_internal_transfer_slip",
  "local_expense_request",
  "maintenance_request",
  "purchase_order",
  "agency_daily_report",
  "monthly_consolidated_report",
  "mobile_money_validation_sheet",
]);

const FINISHED_SHIFT_STATUSES = new Set(["validated_agency", "validated"]);
const FINISHED_COURIER_STATUSES = new Set(["validated_agency", "validated"]);
const FINISHED_TRANSFER_STATUSES = new Set([
  "deposited_bank",
  "received_inter_agency",
  "executed",
  "rejected",
]);
const FINISHED_EXPENSE_STATUSES = new Set(["approved", "paid", "rejected"]);

const SAFE_MAX_DOCS = 1600;
const SAFE_MAX_SOURCES = 2200;
const SAFE_MAX_OVERRIDES = 4000;

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 180);
}

function normalizeSearch(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toOptionalNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function valueToMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (value instanceof Timestamp) return value.toMillis();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const asObj = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof asObj.toMillis === "function") {
      const ms = asObj.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof asObj.toDate === "function") {
      const date = asObj.toDate();
      return date instanceof Date ? date.getTime() : null;
    }
    if (typeof asObj.seconds === "number" && Number.isFinite(asObj.seconds)) {
      return asObj.seconds * 1000;
    }
  }
  return null;
}

function inWindow(ms: number | null, startMs: number | null, endMs: number | null): boolean {
  if (ms == null) return false;
  if (startMs != null && ms < startMs) return false;
  if (endMs != null && ms > endMs) return false;
  return true;
}

function sourceLookupKey(sourceType: FinancialDocumentSourceType, sourceId: string): string {
  return `${sourceType}::${sourceId}`;
}

function parseAgencyIdFromPath(path: string): string | null {
  const match = /\/agences\/([^/]+)\//.exec(path);
  return match?.[1] ?? null;
}

function actorSummaryFromDoc(docRow: FinancialDocumentRow): string | null {
  if (!Array.isArray(docRow.actors) || docRow.actors.length === 0) return null;
  const line = docRow.actors
    .map((actor) => `${actor.name} (${actor.role})`)
    .filter(Boolean)
    .join(", ")
    .trim();
  return line || null;
}

function detectAtFromDoc(docRow: FinancialDocumentRow): Date {
  const ms =
    valueToMillis(docRow.updatedAt) ??
    valueToMillis(docRow.occurredAt) ??
    valueToMillis(docRow.createdAt) ??
    Date.now();
  return new Date(ms);
}

function buildAnomalyId(params: {
  anomalyType: FinancialDocumentAnomalyType;
  documentType: FinancialDocumentType | null;
  sourceType: FinancialDocumentSourceType | null;
  businessReference: string | null;
  relatedDocumentId: string | null;
  suffix?: string | null;
}): string {
  const raw = [
    params.anomalyType,
    params.documentType ?? "na",
    params.sourceType ?? "na",
    params.businessReference ?? "na",
    params.relatedDocumentId ?? "na",
    params.suffix ?? "na",
  ]
    .map((part) => normalizeToken(part))
    .join("__");
  return raw.slice(0, 300);
}

function pickSeverityForType(type: FinancialDocumentAnomalyType): FinancialDocumentAnomalySeverity {
  if (
    type === "document_missing" ||
    type === "business_reference_mismatch" ||
    type === "duplicate_document" ||
    type === "signed_scan_missing"
  ) {
    return "critique";
  }
  if (type === "ready_not_printed") return "information";
  return "attention";
}

async function safeQueryDocs<T>(
  label: string,
  run: () => Promise<T>,
  fallback: T,
  options?: { suppressPermissionDenied?: boolean }
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "").toLowerCase()
        : "";
    const message =
      error && typeof error === "object" && "message" in error
        ? String((error as { message?: unknown }).message ?? "").toLowerCase()
        : String(error ?? "").toLowerCase();
    const isPermissionDenied =
      code === "permission-denied" ||
      code.endsWith("/permission-denied") ||
      message.includes("missing or insufficient permissions") ||
      message.includes("permission-denied");
    if (options?.suppressPermissionDenied && isPermissionDenied) {
      return fallback;
    }
    console.warn(`[financialDocumentAnomalies] ${label} unavailable`, error);
    return fallback;
  }
}

async function loadAgencyNames(companyId: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const snap = await safeQueryDocs(
    "agencies",
    () => getDocs(query(collection(db, "companies", companyId, "agences"), limit(1200))),
    null
  );
  if (!snap) return names;
  snap.docs.forEach((row) => {
    const data = row.data() as Record<string, unknown>;
    const label =
      String(data.nom ?? data.nomAgence ?? data.name ?? row.id).trim() || row.id;
    names.set(row.id, label);
  });
  return names;
}

async function loadShiftSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceMap> {
  const rows = new Map<string, SourceSnapshot>();
  const snap = await safeQueryDocs(
    "shift_sessions",
    () =>
      getDocs(
        query(
          collectionGroup(db, "shifts"),
          where("companyId", "==", companyId),
          limit(SAFE_MAX_SOURCES)
        )
      ),
    null
  );
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const rawStatus = normalizeSearch(data.status);
    if (!FINISHED_SHIFT_STATUSES.has(rawStatus)) return;
    const finalizedAtMs =
      valueToMillis(data.validatedAt) ??
      valueToMillis(data.validatedByCompanyAt) ??
      valueToMillis(data.closedAt) ??
      valueToMillis(data.endAt) ??
      valueToMillis(data.endTime) ??
      valueToMillis(data.updatedAt);
    if (!inWindow(finalizedAtMs, startMs, endMs)) return;
    const sourceId = String(data.id ?? docSnap.id).trim() || docSnap.id;
    const agencyId =
      String(data.agencyId ?? "").trim() || parseAgencyIdFromPath(docSnap.ref.path);
    const validationAudit = (data.validationAudit ?? {}) as { receivedCashAmount?: unknown };
    const amountPrincipal =
      toOptionalNumber(validationAudit.receivedCashAmount) ??
      toOptionalNumber(data.totalCash) ??
      toOptionalNumber(data.totalRevenue);
    const actorUid = String(data.userId ?? "").trim() || null;
    rows.set(sourceId, {
      sourceType: "shift_session",
      sourceId,
      companyId,
      agencyId: agencyId || null,
      businessReference: sourceId,
      amountPrincipal,
      actorUid,
      actorSummary: actorUid,
      status: String(data.status ?? "").trim() || null,
      isFinalized: true,
      finalizedAtMs,
      metadata: {
        totalCash: toOptionalNumber(data.totalCash),
        totalRevenue: toOptionalNumber(data.totalRevenue),
      },
    });
  });
  return rows;
}

async function loadCourierSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceLoadResult> {
  const rows = new Map<string, SourceSnapshot>();
  const snap = await safeQueryDocs(
    "courier_sessions",
    () =>
      getDocs(
        query(
          collectionGroup(db, "courierSessions"),
          where("companyId", "==", companyId),
          limit(SAFE_MAX_SOURCES)
        )
      ),
    null,
    { suppressPermissionDenied: true }
  );
  if (!snap) return { rows, available: false };
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const rawStatus = normalizeSearch(data.status);
    if (!FINISHED_COURIER_STATUSES.has(rawStatus)) return;
    const finalizedAtMs =
      valueToMillis(data.managerValidatedAt) ??
      valueToMillis(data.validatedAt) ??
      valueToMillis(data.closedAt) ??
      valueToMillis(data.updatedAt);
    if (!inWindow(finalizedAtMs, startMs, endMs)) return;
    const sourceId =
      String(data.sessionId ?? docSnap.id).trim() || String(docSnap.id).trim();
    const agencyId =
      String(data.agencyId ?? "").trim() || parseAgencyIdFromPath(docSnap.ref.path);
    const actorUid = String(data.agentId ?? "").trim() || null;
    rows.set(sourceId, {
      sourceType: "courier_session",
      sourceId,
      companyId,
      agencyId: agencyId || null,
      businessReference: sourceId,
      amountPrincipal: toOptionalNumber(data.validatedAmount),
      actorUid,
      actorSummary: actorUid,
      status: String(data.status ?? "").trim() || null,
      isFinalized: true,
      finalizedAtMs,
      metadata: {
        expectedAmount: toOptionalNumber(data.expectedAmount),
        validatedAmount: toOptionalNumber(data.validatedAmount),
      },
    });
  });
  return { rows, available: true };
}

async function loadTransferRequestSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceMap> {
  const rows = new Map<string, SourceSnapshot>();
  const snap = await safeQueryDocs(
    "treasury_transfer_requests",
    () =>
      getDocs(
        query(
          collection(db, "companies", companyId, "treasuryTransferRequests"),
          orderBy("createdAt", "desc"),
          limit(SAFE_MAX_SOURCES)
        )
      ),
    null
  );
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const status = normalizeSearch(data.status);
    if (!FINISHED_TRANSFER_STATUSES.has(status)) return;
    const finalizedAtMs =
      valueToMillis(data.depositConfirmedAt) ??
      valueToMillis(data.receivedAt) ??
      valueToMillis(data.executedAt) ??
      valueToMillis(data.managerDecisionAt) ??
      valueToMillis(data.updatedAt) ??
      valueToMillis(data.createdAt);
    if (!inWindow(finalizedAtMs, startMs, endMs)) return;
    const sourceId = docSnap.id;
    const agencyId = String(data.agencyId ?? "").trim() || null;
    const actorUid = String(data.initiatedBy ?? "").trim() || null;
    const businessReference =
      String(data.idempotencyKey ?? "").trim() || sourceId;
    rows.set(sourceId, {
      sourceType: "transfer_request",
      sourceId,
      companyId,
      agencyId,
      businessReference,
      amountPrincipal: toOptionalNumber(data.amount),
      actorUid,
      actorSummary: actorUid,
      status: String(data.status ?? "").trim() || null,
      isFinalized: true,
      finalizedAtMs,
      metadata: {
        status: String(data.status ?? "").trim(),
      },
    });
  });
  return rows;
}

async function loadInternalTransferSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceMap> {
  const rows = new Map<string, SourceSnapshot>();
  const collectionRef = collection(
    db,
    "companies",
    companyId,
    "financialTransactions"
  );
  const primary = await safeQueryDocs(
    "internal_transfers",
    () =>
      getDocs(
        query(
          collectionRef,
          where("referenceType", "==", "internal_transfer"),
          orderBy("createdAt", "desc"),
          limit(SAFE_MAX_SOURCES)
        )
      ),
    null
  );
  const snap =
    primary ??
    (await safeQueryDocs(
      "internal_transfers_fallback",
      () => getDocs(query(collectionRef, orderBy("createdAt", "desc"), limit(SAFE_MAX_SOURCES))),
      null
    ));
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    if (String(data.referenceType ?? "") !== "internal_transfer") return;
    const sourceId = String(data.referenceId ?? "").trim();
    if (!sourceId) return;
    const finalizedAtMs =
      valueToMillis(data.performedAt) ??
      valueToMillis(data.createdAt) ??
      valueToMillis(data.updatedAt);
    if (!inWindow(finalizedAtMs, startMs, endMs)) return;
    const actorUid =
      String((data.metadata as Record<string, unknown> | undefined)?.performedBy ?? "").trim() ||
      null;
    rows.set(sourceId, {
      sourceType: "internal_transfer",
      sourceId,
      companyId,
      agencyId: String(data.agencyId ?? "").trim() || null,
      businessReference: sourceId,
      amountPrincipal: Math.abs(toNumber(data.amount)),
      actorUid,
      actorSummary: actorUid,
      status: String(data.status ?? "").trim() || "confirmed",
      isFinalized: true,
      finalizedAtMs,
    });
  });
  return rows;
}

async function loadExpenseSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceMap> {
  const rows = new Map<string, SourceSnapshot>();
  const snap = await safeQueryDocs(
    "expenses",
    () =>
      getDocs(
        query(
          collection(db, "companies", companyId, "expenses"),
          orderBy("createdAt", "desc"),
          limit(SAFE_MAX_SOURCES)
        )
      ),
    null
  );
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const status = normalizeSearch(data.status);
    const finalizedAtMs =
      valueToMillis(data.paidAt) ??
      valueToMillis(data.rejectedAt) ??
      valueToMillis(data.approvedAt) ??
      valueToMillis(data.updatedAt) ??
      valueToMillis(data.createdAt);
    if (!inWindow(finalizedAtMs, startMs, endMs)) return;
    const sourceId = docSnap.id;
    const actorUid = String(data.createdBy ?? "").trim() || null;
    rows.set(sourceId, {
      sourceType: "expense",
      sourceId,
      companyId,
      agencyId: String(data.agencyId ?? "").trim() || null,
      businessReference: sourceId,
      amountPrincipal: toOptionalNumber(data.amount),
      actorUid,
      actorSummary: actorUid,
      status: String(data.status ?? "").trim() || null,
      isFinalized: FINISHED_EXPENSE_STATUSES.has(status),
      finalizedAtMs,
      metadata: {
        status: String(data.status ?? "").trim(),
        expenseCategory: String(data.expenseCategory ?? data.category ?? "").trim() || null,
      },
    });
  });
  return rows;
}

async function loadPayableSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceMap> {
  const rows = new Map<string, SourceSnapshot>();
  const snap = await safeQueryDocs(
    "payables",
    () =>
      getDocs(
        query(
          collection(db, "companies", companyId, "payables"),
          orderBy("createdAt", "desc"),
          limit(SAFE_MAX_SOURCES)
        )
      ),
    null
  );
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const createdAtMs = valueToMillis(data.createdAt);
    if (!inWindow(createdAtMs, startMs, endMs)) return;
    const sourceId = docSnap.id;
    const approvalStatus = normalizeSearch(data.approvalStatus);
    const payableStatus = normalizeSearch(data.status);
    const actorUid = String(data.createdBy ?? "").trim() || null;
    rows.set(sourceId, {
      sourceType: "payable",
      sourceId,
      companyId,
      agencyId: String(data.agencyId ?? "").trim() || null,
      businessReference: sourceId,
      amountPrincipal: toOptionalNumber(data.totalAmount),
      actorUid,
      actorSummary: actorUid,
      status: String(data.status ?? "").trim() || null,
      isFinalized:
        approvalStatus === "approved" ||
        approvalStatus === "rejected" ||
        payableStatus === "paid",
      finalizedAtMs:
        valueToMillis(data.approvedAt) ??
        valueToMillis(data.lastPaymentAt) ??
        createdAtMs,
      metadata: {
        category: String(data.category ?? "").trim() || null,
        approvalStatus: String(data.approvalStatus ?? "").trim() || null,
      },
    });
  });
  return rows;
}

async function loadFleetMaintenanceSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceMap> {
  const rows = new Map<string, SourceSnapshot>();
  const snap = await safeQueryDocs(
    "fleet_maintenance",
    () =>
      getDocs(
        query(
          collection(db, "companies", companyId, "fleetMaintenance"),
          orderBy("createdAt", "desc"),
          limit(SAFE_MAX_SOURCES)
        )
      ),
    null
  );
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const createdAtMs = valueToMillis(data.createdAt);
    if (!inWindow(createdAtMs, startMs, endMs)) return;
    const sourceId = docSnap.id;
    const actorUid = String(data.createdBy ?? "").trim() || null;
    rows.set(sourceId, {
      sourceType: "fleet_maintenance",
      sourceId,
      companyId,
      agencyId: String(data.agencyId ?? "").trim() || null,
      businessReference: sourceId,
      amountPrincipal: toOptionalNumber(data.costAmount),
      actorUid,
      actorSummary: actorUid,
      status: "created",
      isFinalized: true,
      finalizedAtMs: createdAtMs,
    });
  });
  return rows;
}

async function loadPaymentSources(
  companyId: string,
  startMs: number | null,
  endMs: number | null
): Promise<SourceMap> {
  const rows = new Map<string, SourceSnapshot>();
  const snap = await safeQueryDocs(
    "payments",
    () =>
      getDocs(
        query(
          collection(db, "companies", companyId, "payments"),
          orderBy("createdAt", "desc"),
          limit(Math.max(SAFE_MAX_SOURCES, 3000))
        )
      ),
    null
  );
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const finalizedAtMs =
      valueToMillis(data.validatedAt) ??
      valueToMillis(data.createdAt) ??
      valueToMillis(data.updatedAt);
    if (!inWindow(finalizedAtMs, startMs, endMs)) return;
    const sourceId = docSnap.id;
    const actorUid = String(data.validatedBy ?? "").trim() || null;
    const businessReference =
      String(data.reservationId ?? "").trim() || sourceId;
    rows.set(sourceId, {
      sourceType: "payment",
      sourceId,
      companyId,
      agencyId: String(data.agencyId ?? "").trim() || null,
      businessReference,
      amountPrincipal: toOptionalNumber(data.amount),
      actorUid,
      actorSummary: actorUid,
      status: String(data.status ?? "").trim() || null,
      isFinalized: ["validated", "rejected", "refunded"].includes(
        normalizeSearch(data.status)
      ),
      finalizedAtMs,
      metadata: {
        status: String(data.status ?? "").trim() || null,
        provider: String(data.provider ?? "").trim().toLowerCase() || null,
        channel: String(data.channel ?? "").trim().toLowerCase() || null,
      },
    });
  });
  return rows;
}

function createAnomalyCollector() {
  const store = new Map<string, FinancialDocumentAnomaly>();

  const push = (anomaly: Omit<FinancialDocumentAnomaly, "anomalyId" | "status"> & {
    status?: FinancialDocumentAnomalyStatus;
    suffix?: string | null;
  }) => {
    const anomalyId = buildAnomalyId({
      anomalyType: anomaly.anomalyType,
      documentType: anomaly.documentType,
      sourceType: anomaly.sourceType,
      businessReference: anomaly.businessReference,
      relatedDocumentId: anomaly.relatedDocumentId,
      suffix: anomaly.suffix ?? null,
    });
    if (store.has(anomalyId)) return;
    store.set(anomalyId, {
      anomalyId,
      ...anomaly,
      status: anomaly.status ?? "open",
    });
  };

  return {
    push,
    values: () => Array.from(store.values()),
  };
}

function applySeverityOrder(
  a: FinancialDocumentAnomalySeverity,
  b: FinancialDocumentAnomalySeverity
): number {
  const rank: Record<FinancialDocumentAnomalySeverity, number> = {
    critique: 0,
    attention: 1,
    information: 2,
  };
  return rank[a] - rank[b];
}

function buildSummary(anomalies: FinancialDocumentAnomaly[]): FinancialDocumentAnomalySummary {
  const open = anomalies.filter((row) => row.status === "open");
  const countByType = (type: FinancialDocumentAnomalyType) =>
    open.filter((row) => row.anomalyType === type).length;
  return {
    total: anomalies.length,
    open: open.length,
    resolved: anomalies.filter((row) => row.status === "resolved").length,
    ignored: anomalies.filter((row) => row.status === "ignored").length,
    critical: open.filter((row) => row.severity === "critique").length,
    attention: open.filter((row) => row.severity === "attention").length,
    information: open.filter((row) => row.severity === "information").length,
    documentsMissing: countByType("document_missing"),
    signedScanMissing: countByType("signed_scan_missing"),
    printedNotSigned: countByType("printed_not_signed"),
    signedNotArchived: countByType("signed_not_archived"),
    readyNotPrinted: countByType("ready_not_printed"),
  };
}

function buildAggregate(
  anomalies: FinancialDocumentAnomaly[],
  keyFn: (row: FinancialDocumentAnomaly) => string | null,
  labelFn: (key: string) => string
): FinancialDocumentAnomalyAggregateRow[] {
  const map = new Map<
    string,
    { total: number; open: number; critical: number }
  >();
  anomalies.forEach((row) => {
    const key = keyFn(row);
    if (!key) return;
    const current = map.get(key) ?? { total: 0, open: 0, critical: 0 };
    current.total += 1;
    if (row.status === "open") {
      current.open += 1;
      if (row.severity === "critique") current.critical += 1;
    }
    map.set(key, current);
  });
  return Array.from(map.entries())
    .map(([key, stats]) => ({
      key,
      label: labelFn(key),
      openCount: stats.open,
      totalCount: stats.total,
      criticalCount: stats.critical,
    }))
    .sort((a, b) => {
      if (b.openCount !== a.openCount) return b.openCount - a.openCount;
      if (b.criticalCount !== a.criticalCount) return b.criticalCount - a.criticalCount;
      return a.label.localeCompare(b.label, "fr");
    });
}

function parseDayTokenFromMs(ms: number): { dayToken: string; dayKey: string } {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return {
    dayToken: `${yyyy}${mm}${dd}`,
    dayKey: `${yyyy}-${mm}-${dd}`,
  };
}

function parseMonthKeyFromMs(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yyyy}-${mm}`;
}

function applyOverrideStatus(
  anomalies: FinancialDocumentAnomaly[],
  overrides: Map<string, AnomalyOverrideDoc>
): FinancialDocumentAnomaly[] {
  return anomalies.map((row) => {
    const override = overrides.get(row.anomalyId);
    if (!override) return row;
    if (override.status === "open") {
      return { ...row, status: "open", resolutionNote: null };
    }
    return {
      ...row,
      status: override.status,
      resolutionNote: override.resolutionNote ?? null,
    };
  });
}

async function loadAnomalyOverrides(companyId: string): Promise<Map<string, AnomalyOverrideDoc>> {
  const rows = new Map<string, AnomalyOverrideDoc>();
  const snap = await safeQueryDocs(
    "anomaly_overrides",
    () =>
      getDocs(
        query(
          collection(db, "companies", companyId, "financialDocumentAnomalyOverrides"),
          limit(SAFE_MAX_OVERRIDES)
        )
      ),
    null,
    { suppressPermissionDenied: true }
  );
  if (!snap) return rows;
  snap.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const status = String(data.status ?? "open").trim() as FinancialDocumentAnomalyStatus;
    if (status !== "open" && status !== "resolved" && status !== "ignored") return;
    rows.set(docSnap.id, {
      status,
      resolutionNote:
        data.resolutionNote == null ? null : String(data.resolutionNote),
    });
  });
  return rows;
}

export function applyFinancialDocumentAnomalyFilters(
  anomalies: FinancialDocumentAnomaly[],
  filters: FinancialDocumentAnomalyFilter
): FinancialDocumentAnomaly[] {
  const actorQuery = normalizeSearch(filters.actorQuery ?? "");
  const businessReferenceQuery = normalizeSearch(
    filters.businessReferenceQuery ?? filters.referenceQuery ?? ""
  );
  const startMs = valueToMillis(filters.periodStart ?? null);
  const endMs = valueToMillis(filters.periodEnd ?? null);

  return anomalies.filter((row) => {
    if (filters.agencyId && row.agencyId !== filters.agencyId) return false;
    if (
      filters.documentType &&
      filters.documentType !== "all" &&
      row.documentType !== filters.documentType
    ) {
      return false;
    }
    if (filters.severity && filters.severity !== "all" && row.severity !== filters.severity) {
      return false;
    }
    if (filters.anomalyType && filters.anomalyType !== "all" && row.anomalyType !== filters.anomalyType) {
      return false;
    }
    if (filters.status && filters.status !== "all" && row.status !== filters.status) return false;

    const detectedMs = row.detectedAt.getTime();
    if (startMs != null && detectedMs < startMs) return false;
    if (endMs != null && detectedMs > endMs + 86_399_999) return false;

    if (actorQuery && !normalizeSearch(row.actorSummary ?? "").includes(actorQuery)) return false;
    if (
      businessReferenceQuery &&
      !normalizeSearch(
        `${row.businessReference ?? ""} ${row.relatedDocumentNumber ?? ""}`
      ).includes(businessReferenceQuery)
    ) {
      return false;
    }
    return true;
  });
}

export async function listFinancialDocumentAnomalies(params: {
  companyId: string;
  documents?: FinancialDocumentRow[];
  limitCount?: number;
  filters?: FinancialDocumentAnomalyFilter;
}): Promise<FinancialDocumentAnomalyComputation> {
  const companyId = String(params.companyId ?? "").trim();
  if (!companyId) {
    return {
      anomalies: [],
      summary: buildSummary([]),
      byAgency: [],
      byDocumentType: [],
      byAnomalyType: [],
      byActor: [],
    };
  }

  const documents =
    params.documents ??
    (await listFinancialDocuments({
      companyId,
      limitCount: params.limitCount ?? SAFE_MAX_DOCS,
    }));

  const docForWindow = applyFinancialDocumentFilters(documents, {
    periodStart: params.filters?.periodStart ?? null,
    periodEnd: params.filters?.periodEnd ?? null,
    agencyId: params.filters?.agencyId ?? undefined,
    documentType: "all",
    status: "all",
  });

  const docTimes = docForWindow
    .map(
      (row) =>
        valueToMillis(row.occurredAt) ??
        valueToMillis(row.createdAt) ??
        valueToMillis(row.updatedAt)
    )
    .filter((x): x is number => x != null);

  const nowMs = Date.now();
  const startMs =
    valueToMillis(params.filters?.periodStart ?? null) ??
    (docTimes.length > 0 ? Math.min(...docTimes) : nowMs - 90 * 24 * 60 * 60 * 1000);
  const endMs =
    valueToMillis(params.filters?.periodEnd ?? null) ??
    (docTimes.length > 0 ? Math.max(...docTimes) : nowMs);

  const [
    sourceShift,
    sourceCourierResult,
    sourceTransferRequest,
    sourceInternalTransfer,
    sourceExpense,
    sourcePayable,
    sourceMaintenance,
    sourcePayment,
    anomalyOverrides,
    agencyNames,
  ] = await Promise.all([
    loadShiftSources(companyId, startMs, endMs),
    loadCourierSources(companyId, startMs, endMs),
    loadTransferRequestSources(companyId, startMs, endMs),
    loadInternalTransferSources(companyId, startMs, endMs),
    loadExpenseSources(companyId, startMs, endMs),
    loadPayableSources(companyId, startMs, endMs),
    loadFleetMaintenanceSources(companyId, startMs, endMs),
    loadPaymentSources(companyId, startMs, endMs),
    loadAnomalyOverrides(companyId),
    loadAgencyNames(companyId),
  ]);
  const sourceCourier = sourceCourierResult.rows;

  const sourceMaps: Partial<Record<FinancialDocumentSourceType, SourceMap>> = {
    shift_session: sourceShift,
    ...(sourceCourierResult.available ? { courier_session: sourceCourier } : {}),
    transfer_request: sourceTransferRequest,
    internal_transfer: sourceInternalTransfer,
    expense: sourceExpense,
    payable: sourcePayable,
    fleet_maintenance: sourceMaintenance,
    payment: sourcePayment,
  };
  const loadedSourceTypes = new Set<FinancialDocumentSourceType>(
    Object.keys(sourceMaps) as FinancialDocumentSourceType[]
  );

  const docsBySource = new Map<string, FinancialDocumentRow[]>();
  documents.forEach((docRow) => {
    const key = sourceLookupKey(docRow.sourceType, docRow.sourceId);
    const current = docsBySource.get(key) ?? [];
    current.push(docRow);
    docsBySource.set(key, current);
  });
  const payableLinkedDocumentTypes = new Map<string, Set<FinancialDocumentType>>();
  const registerPayableLinkedDoc = (
    payableIdRaw: string | null | undefined,
    documentType: FinancialDocumentType
  ) => {
    const payableId = normalizeToken(payableIdRaw ?? "");
    if (!payableId) return;
    const current = payableLinkedDocumentTypes.get(payableId) ?? new Set<FinancialDocumentType>();
    current.add(documentType);
    payableLinkedDocumentTypes.set(payableId, current);
  };
  documents.forEach((docRow) => {
    if (!PAYABLE_EXECUTION_DOCUMENT_TYPES.has(docRow.documentType)) return;
    const details = (docRow.details ?? {}) as Record<string, unknown>;
    if (docRow.sourceType === "payable_payment") {
      registerPayableLinkedDoc(docRow.sourceId, docRow.documentType);
    }
    registerPayableLinkedDoc(docRow.businessReference ?? null, docRow.documentType);
    registerPayableLinkedDoc(
      typeof details.depenseLieeId === "string" ? details.depenseLieeId : null,
      docRow.documentType
    );
    registerPayableLinkedDoc(
      typeof details.payableId === "string" ? details.payableId : null,
      docRow.documentType
    );
    registerPayableLinkedDoc(
      typeof details.fournisseurReference === "string"
        ? details.fournisseurReference
        : null,
      docRow.documentType
    );
  });

  const anomalies = createAnomalyCollector();

  const getSource = (
    sourceType: FinancialDocumentSourceType,
    sourceId: string
  ): SourceSnapshot | null => {
    const map = sourceMaps[sourceType];
    if (!map) return null;
    return map.get(sourceId) ?? null;
  };

  const hasDocument = (
    sourceType: FinancialDocumentSourceType,
    sourceId: string,
    documentType: FinancialDocumentType
  ): boolean => {
    const key = sourceLookupKey(sourceType, sourceId);
    return (docsBySource.get(key) ?? []).some((row) => row.documentType === documentType);
  };

  const pushDocAnomaly = (
    docRow: FinancialDocumentRow,
    anomalyType: FinancialDocumentAnomalyType,
    message: string,
    extra?: {
      severity?: FinancialDocumentAnomalySeverity;
      metadata?: Record<string, unknown>;
      suffix?: string | null;
      detectedAt?: Date;
    }
  ) => {
    anomalies.push({
      anomalyType,
      severity: extra?.severity ?? pickSeverityForType(anomalyType),
      message,
      documentType: docRow.documentType,
      sourceType: docRow.sourceType,
      businessReference: docRow.businessReference ?? docRow.sourceId,
      relatedDocumentId: docRow.id,
      relatedDocumentNumber: docRow.documentNumber,
      agencyId: docRow.agencyId ?? null,
      companyId,
      actorSummary: actorSummaryFromDoc(docRow),
      amountPrincipal: toOptionalNumber(docRow.amountTotal),
      detectedAt: extra?.detectedAt ?? detectAtFromDoc(docRow),
      metadata: extra?.metadata,
      suffix: extra?.suffix ?? null,
    });
  };

  documents.forEach((docRow) => {
    if (docRow.status === "ready_to_print") {
      pushDocAnomaly(
        docRow,
        "ready_not_printed",
        "Document pret a imprimer non imprime.",
        { severity: "information" }
      );
    }

    if (docRow.status === "printed") {
      pushDocAnomaly(
        docRow,
        "printed_not_signed",
        "Document imprime mais non signe.",
        { severity: "attention" }
      );
    }

    if (docRow.status === "signed" && isSignedAttachmentMissing(docRow)) {
      pushDocAnomaly(
        docRow,
        "signed_scan_missing",
        "Document marque signe sans scan/photo archive.",
        { severity: "critique" }
      );
    }

    if (docRow.status === "signed") {
      pushDocAnomaly(
        docRow,
        "signed_not_archived",
        "Document signe non archive.",
        { severity: "attention" }
      );
    }

    const source = getSource(docRow.sourceType, docRow.sourceId);
    if (
      source &&
      source.isFinalized &&
      source.finalizedAtMs != null &&
      (docRow.status === "draft" ||
        docRow.status === "ready_to_print" ||
        docRow.status === "printed") &&
      nowMs - source.finalizedAtMs > STALE_DOCUMENT_THRESHOLD_MS
    ) {
      pushDocAnomaly(
        docRow,
        "stale_document_state",
        `Flux finalise mais document bloque en etat ${docRow.status} depuis plus de ${STALE_DOCUMENT_THRESHOLD_HOURS}h.`,
        {
          severity: "attention",
          detectedAt: new Date(source.finalizedAtMs),
          metadata: {
            finalizedAt: source.finalizedAtMs,
            thresholdHours: STALE_DOCUMENT_THRESHOLD_HOURS,
          },
        }
      );
    }
  });

  documents.forEach((docRow) => {
    if (!loadedSourceTypes.has(docRow.sourceType)) return;
    const source = getSource(docRow.sourceType, docRow.sourceId);
    if (!source) {
      pushDocAnomaly(
        docRow,
        "business_reference_mismatch",
        "Flux source introuvable pour ce document.",
        { severity: "critique", suffix: "source_not_found" }
      );
      return;
    }

    const mismatches: string[] = [];
    if (source.agencyId && docRow.agencyId && source.agencyId !== docRow.agencyId) {
      mismatches.push(`agence(${docRow.agencyId} != ${source.agencyId})`);
    }
    const docAmount = toOptionalNumber(docRow.amountTotal);
    if (
      source.amountPrincipal != null &&
      docAmount != null &&
      Math.abs(source.amountPrincipal - docAmount) > 1
    ) {
      mismatches.push(
        `montant(${docAmount.toFixed(2)} != ${source.amountPrincipal.toFixed(2)})`
      );
    }
    if (source.businessReference && docRow.businessReference) {
      const srcRef = normalizeSearch(source.businessReference);
      const docRef = normalizeSearch(docRow.businessReference);
      if (srcRef && docRef && srcRef !== docRef) {
        mismatches.push("reference_metier");
      }
    }
    if (source.actorUid) {
      const hasActor = (docRow.actors ?? []).some(
        (actor) => String(actor.uid ?? "").trim() === source.actorUid
      );
      if (!hasActor) mismatches.push("acteur_principal");
    }

    if (mismatches.length > 0) {
      pushDocAnomaly(
        docRow,
        "business_reference_mismatch",
        `Incoherence detectee entre document et flux source: ${mismatches.join(", ")}.`,
        {
          severity: "critique",
          suffix: mismatches.join("_"),
          metadata: {
            mismatches,
            sourceAgencyId: source.agencyId,
            sourceAmount: source.amountPrincipal,
            sourceBusinessReference: source.businessReference,
          },
          detectedAt:
            source.finalizedAtMs != null
              ? new Date(source.finalizedAtMs)
              : detectAtFromDoc(docRow),
        }
      );
    }
  });

  const duplicateBuckets = new Map<string, FinancialDocumentRow[]>();
  documents
    .filter((docRow) => SINGLE_DOCUMENT_TYPES.has(docRow.documentType))
    .filter((docRow) => docRow.status !== "archived")
    .forEach((docRow) => {
      const key = `${docRow.documentType}::${docRow.sourceType}::${docRow.sourceId}`;
      const current = duplicateBuckets.get(key) ?? [];
      current.push(docRow);
      duplicateBuckets.set(key, current);
    });
  duplicateBuckets.forEach((rows) => {
    if (rows.length < 2) return;
    const anchor = rows[0];
    anomalies.push({
      anomalyType: "duplicate_document",
      severity: "critique",
      message: `${rows.length} documents actifs detectes pour le meme flux, un seul est attendu.`,
      documentType: anchor.documentType,
      sourceType: anchor.sourceType,
      businessReference: anchor.businessReference ?? anchor.sourceId,
      relatedDocumentId: anchor.id,
      relatedDocumentNumber: anchor.documentNumber,
      agencyId: anchor.agencyId ?? null,
      companyId,
      actorSummary: actorSummaryFromDoc(anchor),
      amountPrincipal: toOptionalNumber(anchor.amountTotal),
      detectedAt: detectAtFromDoc(anchor),
      metadata: {
        duplicateDocumentIds: rows.map((row) => row.id),
        duplicateNumbers: rows.map((row) => row.documentNumber),
      },
      suffix: rows.map((row) => row.id).join("_"),
    });
  });

  const pushMissingAnomaly = (paramsMissing: {
    documentType: FinancialDocumentType;
    sourceType: FinancialDocumentSourceType;
    sourceId: string;
    businessReference: string | null;
    agencyId: string | null;
    actorSummary: string | null;
    amountPrincipal: number | null;
    detectedAtMs: number | null;
    reason?: string | null;
  }) => {
    anomalies.push({
      anomalyType: "document_missing",
      severity: "critique",
      message: paramsMissing.reason
        ? `Flux finalise sans document attendu (${paramsMissing.reason}).`
        : "Flux finalise sans document attendu.",
      documentType: paramsMissing.documentType,
      sourceType: paramsMissing.sourceType,
      businessReference: paramsMissing.businessReference ?? paramsMissing.sourceId,
      relatedDocumentId: null,
      relatedDocumentNumber: null,
      agencyId: paramsMissing.agencyId,
      companyId,
      actorSummary: paramsMissing.actorSummary,
      amountPrincipal: paramsMissing.amountPrincipal,
      detectedAt: new Date(paramsMissing.detectedAtMs ?? nowMs),
      metadata: {
        expectedDocumentType: paramsMissing.documentType,
        sourceType: paramsMissing.sourceType,
      },
      suffix: `${paramsMissing.documentType}_${paramsMissing.sourceId}`,
    });
  };

  sourceShift.forEach((source) => {
    if (!hasDocument("shift_session", source.sourceId, "session_remittance")) {
      pushMissingAnomaly({
        documentType: "session_remittance",
        sourceType: "shift_session",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "session guichet validee",
      });
    }
    if (
      !hasDocument(
        "shift_session",
        source.sourceId,
        "accounting_remittance_receipt"
      )
    ) {
      pushMissingAnomaly({
        documentType: "accounting_remittance_receipt",
        sourceType: "shift_session",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "reception comptable guichet",
      });
    }
  });

  sourceCourier.forEach((source) => {
    if (!hasDocument("courier_session", source.sourceId, "session_remittance")) {
      pushMissingAnomaly({
        documentType: "session_remittance",
        sourceType: "courier_session",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "session courrier validee",
      });
    }
    if (
      !hasDocument(
        "courier_session",
        source.sourceId,
        "accounting_remittance_receipt"
      )
    ) {
      pushMissingAnomaly({
        documentType: "accounting_remittance_receipt",
        sourceType: "courier_session",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "reception comptable courrier",
      });
    }
  });

  sourceTransferRequest.forEach((source) => {
    const transferStatus = normalizeSearch(source.status);
    if (transferStatus === "deposited_bank" || transferStatus === "executed") {
      if (!hasDocument("transfer_request", source.sourceId, "bank_deposit_slip")) {
        pushMissingAnomaly({
          documentType: "bank_deposit_slip",
          sourceType: "transfer_request",
          sourceId: source.sourceId,
          businessReference: source.businessReference,
          agencyId: source.agencyId,
          actorSummary: source.actorSummary,
          amountPrincipal: source.amountPrincipal,
          detectedAtMs: source.finalizedAtMs,
          reason: "versement banque depose",
        });
      }
      if (!hasDocument("transfer_request", source.sourceId, "treasury_transfer")) {
        pushMissingAnomaly({
          documentType: "treasury_transfer",
          sourceType: "transfer_request",
          sourceId: source.sourceId,
          businessReference: source.businessReference,
          agencyId: source.agencyId,
          actorSummary: source.actorSummary,
          amountPrincipal: source.amountPrincipal,
          detectedAtMs: source.finalizedAtMs,
          reason: "ordre de sortie vers banque",
        });
      }
      return;
    }

    if (transferStatus !== "received_inter_agency") return;
    if (
      !hasDocument(
        "internal_transfer",
        source.sourceId,
        "treasury_internal_transfer_slip"
      )
    ) {
      pushMissingAnomaly({
        documentType: "treasury_internal_transfer_slip",
        sourceType: "internal_transfer",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "transfert inter-agence recu",
      });
    }
  });

  sourceInternalTransfer.forEach((source) => {
    if (
      !hasDocument(
        "internal_transfer",
        source.sourceId,
        "treasury_internal_transfer_slip"
      )
    ) {
      pushMissingAnomaly({
        documentType: "treasury_internal_transfer_slip",
        sourceType: "internal_transfer",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "transfert interne execute",
      });
    }
  });

  sourceExpense.forEach((source) => {
    if (normalizeSearch(source.status) !== "paid") return;
    if (!hasDocument("expense", source.sourceId, "cash_disbursement")) {
      pushMissingAnomaly({
        documentType: "cash_disbursement",
        sourceType: "expense",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "depense payee",
      });
    }
    if (
      source.agencyId &&
      !hasDocument("expense", source.sourceId, "local_expense_request")
    ) {
      pushMissingAnomaly({
        documentType: "local_expense_request",
        sourceType: "expense",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "depense locale payee",
      });
    }
  });

  sourcePayable.forEach((source) => {
    if (!hasDocument("payable", source.sourceId, "purchase_order")) {
      pushMissingAnomaly({
        documentType: "purchase_order",
        sourceType: "payable",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "payable cree",
      });
    }
    const category = normalizeSearch(source.metadata?.category ?? "");
    if (
      (category === "maintenance" || category === "parts") &&
      !hasDocument("payable", source.sourceId, "maintenance_request")
    ) {
      pushMissingAnomaly({
        documentType: "maintenance_request",
        sourceType: "payable",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "payable maintenance / pieces",
      });
    }

    const payableStatus = normalizeSearch(source.status);
    if (payableStatus !== "paid") return;
    const linkedDocTypes = payableLinkedDocumentTypes.get(normalizeToken(source.sourceId));
    const hasDisbursement = Boolean(linkedDocTypes?.has("cash_disbursement"));
    const hasSupplierOrder = Boolean(linkedDocTypes?.has("supplier_payment_order"));
    if (!hasDisbursement && !hasSupplierOrder) {
      pushMissingAnomaly({
        documentType: "supplier_payment_order",
        sourceType: "payable",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "payable paye sans bon de decaissement / ordre de paiement",
      });
    }
  });

  sourceMaintenance.forEach((source) => {
    if (!hasDocument("fleet_maintenance", source.sourceId, "maintenance_request")) {
      pushMissingAnomaly({
        documentType: "maintenance_request",
        sourceType: "fleet_maintenance",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "demande maintenance creee",
      });
    }
  });

  sourcePayment.forEach((source) => {
    const paymentStatus = normalizeSearch(source.status);
    const provider = normalizeSearch(source.metadata?.provider ?? "");
    if (paymentStatus !== "validated" || !MOBILE_MONEY_PROVIDERS.has(provider)) return;
    if (
      !hasDocument(
        "payment",
        source.sourceId,
        "mobile_money_validation_sheet"
      )
    ) {
      pushMissingAnomaly({
        documentType: "mobile_money_validation_sheet",
        sourceType: "payment",
        sourceId: source.sourceId,
        businessReference: source.businessReference,
        agencyId: source.agencyId,
        actorSummary: source.actorSummary,
        amountPrincipal: source.amountPrincipal,
        detectedAtMs: source.finalizedAtMs,
        reason: "paiement mobile money valide",
      });
    }
  });

  const expectedDailySourceIds = new Map<
    string,
    { agencyId: string; dayKey: string; finalizedAtMs: number }
  >();
  [...sourceShift.values(), ...sourceCourier.values()].forEach((source) => {
    if (!source.agencyId || source.finalizedAtMs == null) return;
    const day = parseDayTokenFromMs(source.finalizedAtMs);
    const sourceId = `${source.agencyId}_${day.dayToken}`;
    if (!expectedDailySourceIds.has(sourceId)) {
      expectedDailySourceIds.set(sourceId, {
        agencyId: source.agencyId,
        dayKey: day.dayKey,
        finalizedAtMs: source.finalizedAtMs,
      });
    }
  });
  expectedDailySourceIds.forEach((row, sourceId) => {
    if (!hasDocument("daily_stats", sourceId, "agency_daily_report")) {
      pushMissingAnomaly({
        documentType: "agency_daily_report",
        sourceType: "daily_stats",
        sourceId,
        businessReference: `${row.agencyId}/${row.dayKey}`,
        agencyId: row.agencyId,
        actorSummary: null,
        amountPrincipal: null,
        detectedAtMs: row.finalizedAtMs,
        reason: "rapport journalier attendu",
      });
    }
  });

  const expectedMonthKeys = new Set<string>();
  [
    ...sourceShift.values(),
    ...sourceCourier.values(),
    ...sourceTransferRequest.values(),
    ...sourceExpense.values(),
    ...sourcePayment.values(),
  ].forEach((source) => {
    if (source.finalizedAtMs == null) return;
    const monthKey = parseMonthKeyFromMs(source.finalizedAtMs);
    const monthEnd = new Date(`${monthKey}-28T23:59:59`).getTime() + 6 * 24 * 60 * 60 * 1000;
    if (monthEnd < nowMs - 24 * 60 * 60 * 1000) {
      expectedMonthKeys.add(monthKey);
    }
  });
  expectedMonthKeys.forEach((monthKey) => {
    if (!hasDocument("monthly_report", monthKey, "monthly_consolidated_report")) {
      pushMissingAnomaly({
        documentType: "monthly_consolidated_report",
        sourceType: "monthly_report",
        sourceId: monthKey,
        businessReference: monthKey,
        agencyId: null,
        actorSummary: null,
        amountPrincipal: null,
        detectedAtMs: nowMs,
        reason: "rapport mensuel consolide attendu",
      });
    }
  });

  const withOverrides = applyOverrideStatus(anomalies.values(), anomalyOverrides)
    .sort((a, b) => {
      const severitySort = applySeverityOrder(a.severity, b.severity);
      if (severitySort !== 0) return severitySort;
      return b.detectedAt.getTime() - a.detectedAt.getTime();
    });

  const filtered = applyFinancialDocumentAnomalyFilters(
    withOverrides,
    params.filters ?? {}
  );

  const docTypeLabel = (key: string) => key;
  const agencyLabel = (key: string) => agencyNames.get(key) ?? key;
  const anomalyTypeLabel = (key: string) => key;

  return {
    anomalies: filtered,
    summary: buildSummary(filtered),
    byAgency: buildAggregate(filtered, (row) => row.agencyId, agencyLabel).slice(0, 30),
    byDocumentType: buildAggregate(
      filtered,
      (row) => row.documentType,
      docTypeLabel
    ).slice(0, 30),
    byAnomalyType: buildAggregate(
      filtered,
      (row) => row.anomalyType,
      anomalyTypeLabel
    ).slice(0, 30),
    byActor: buildAggregate(
      filtered,
      (row) => (row.actorSummary ? row.actorSummary : null),
      (x) => x
    ).slice(0, 30),
  };
}

export async function setFinancialDocumentAnomalyStatus(params: {
  companyId: string;
  anomalyId: string;
  status: FinancialDocumentAnomalyStatus;
  resolutionNote?: string | null;
  updatedByUid?: string | null;
}): Promise<void> {
  const companyId = String(params.companyId ?? "").trim();
  const anomalyId = String(params.anomalyId ?? "").trim();
  if (!companyId || !anomalyId) {
    throw new Error("Parametres anomaly status invalides.");
  }
  const status = params.status;
  if (status !== "open" && status !== "resolved" && status !== "ignored") {
    throw new Error("Statut anomalie invalide.");
  }
  await setDoc(
    doc(db, "companies", companyId, "financialDocumentAnomalyOverrides", anomalyId),
    {
      status,
      resolutionNote: params.resolutionNote ?? null,
      updatedBy: params.updatedByUid ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
