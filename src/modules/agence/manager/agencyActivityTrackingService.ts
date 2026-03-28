/**
 * Couche « contrôle d'activité » : visibilité sessions / agents (hors logique comptable / ledger).
 */

import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { fetchAgencyStaffProfile } from "@/modules/agence/services/agencyStaffProfileService";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";

export const ACTIVITY_DISCREPANCY_EPSILON = 0.5;

/** Seuils gravité (même unité que les montants en agence, ex. FCFA). */
export const DISCREPANCY_SEVERITY_LOW_BELOW = 2000;
export const DISCREPANCY_SEVERITY_MEDIUM_UP_TO = 10_000;

/** Délai clôture → validation comptable au-delà duquel on suggère une validation tardive. */
export const LATE_VALIDATION_HINT_MS = 24 * 60 * 60 * 1000;

export type DiscrepancyType = "missing_cash" | "over_cash" | "unknown";

export type DiscrepancySeverity = "low" | "medium" | "high";

export type RootCauseHint =
  | "late_validation"
  | "partial_remittance"
  | "missing_remittance"
  | "manual_override"
  | "unknown";

/** Contexte cause racine (lecture seule, dérivé des champs session). */
export type AgencySessionDiscrepancyContext = {
  discrepancyType: DiscrepancyType;
  discrepancyAmount: number;
  explanationHint: string;
  severity: DiscrepancySeverity;
  rootCauseHint: RootCauseHint;
};

export type SessionTimelineEvent =
  | "created"
  | "closed"
  | "validated_by_accountant"
  | "validated_by_manager"
  | "exception_flagged"
  | "suspended";

export type SessionTimelineEntry = {
  event: SessionTimelineEvent;
  at: number | null;
};

export type AgentDiscrepancyTrend = "improving" | "stable" | "worsening";

export type AgencySessionHistoryRow = {
  sessionId: string;
  agentId: string;
  agentName: string;
  type: "guichet" | "courrier";
  totalExpected: number;
  totalDeclared: number;
  discrepancy: number;
  status: string;
  createdAt: number | null;
  closedAt: number | null;
  /** Présent uniquement si écart significatif — aide à la compréhension métier. */
  discrepancyContext?: AgencySessionDiscrepancyContext;
  timeline: SessionTimelineEntry[];
};

export type AgentPerformanceRow = {
  agentId: string;
  agentName: string;
  totalSessions: number;
  totalExpected: number;
  totalDeclared: number;
  /** Somme des écarts (toutes sessions du filtre). */
  totalDiscrepancy: number;
  status: "OK" | "WARNING";
  /** Sessions (période filtrée) avec écart significatif */
  discrepancySessionCount: number;
  /** Horodatage (ms) de la dernière session avec écart dans le périmètre agrégé. */
  lastDiscrepancyDate: number | null;
  /** Moyenne des écarts sur les seules sessions en litige (0 si aucune). */
  averageDiscrepancy: number;
  trend: AgentDiscrepancyTrend;
};

export type AgencyActivityFilters = {
  dateFromMs?: number | null;
  dateToMs?: number | null;
  agentId?: string | null;
  type?: "all" | "guichet" | "courrier";
};

function tsToMs(v: unknown): number | null {
  if (v == null) return null;
  if (v instanceof Timestamp) return v.toMillis();
  if (typeof v === "object" && v !== null && "toMillis" in v && typeof (v as Timestamp).toMillis === "function") {
    return (v as Timestamp).toMillis();
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  return null;
}

/** Écart « métier » guichet pour alertes / performance (champs déjà sur le shift). */
export function guichetShiftBusinessDiscrepancy(shift: Record<string, unknown>): number {
  const partial = Number(shift.remittanceDiscrepancyAmount ?? 0);
  if (partial > ACTIVITY_DISCREPANCY_EPSILON) return partial;
  const st = String(shift.status ?? "");
  if (st === "validated_agency" || st === "validated") {
    const audit = shift.validationAudit as { computedDifference?: number } | undefined;
    return Math.abs(Number(audit?.computedDifference ?? 0));
  }
  if (st === "closed" && shift.hasDiscrepancy) {
    return Math.abs(Number(shift.ecart ?? 0));
  }
  return 0;
}

/** Écart « métier » courrier (documents session uniquement). */
export function courierSessionBusinessDiscrepancy(row: Record<string, unknown>): number {
  const st = String(row.status ?? "");
  if (st !== "VALIDATED") return 0;
  const partial = Number(row.remittanceDiscrepancyAmount ?? 0);
  if (partial > ACTIVITY_DISCREPANCY_EPSILON) return partial;
  return Math.abs(Number(row.difference ?? 0));
}

function sortTimelineEntries(entries: SessionTimelineEntry[]): SessionTimelineEntry[] {
  return [...entries].sort((a, b) => {
    const ta = a.at ?? Number.MAX_SAFE_INTEGER;
    const tb = b.at ?? Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    const order: SessionTimelineEvent[] = [
      "created",
      "closed",
      "suspended",
      "validated_by_accountant",
      "validated_by_manager",
      "exception_flagged",
    ];
    return order.indexOf(a.event) - order.indexOf(b.event);
  });
}

function pushIfStep(
  entries: SessionTimelineEntry[],
  event: SessionTimelineEvent,
  at: number | null,
  condition: boolean
): void {
  if (!condition) return;
  entries.push({ event, at });
}

function buildGuichetTimeline(s: Record<string, unknown>): SessionTimelineEntry[] {
  const entries: SessionTimelineEntry[] = [];
  const createdAt =
    tsToMs(s.createdAt ?? s.startTime ?? s.startAt) ??
    (typeof s.openedAt === "number" ? Number(s.openedAt) : tsToMs(s.openedAt));
  entries.push({ event: "created", at: createdAt });

  const st = String(s.status ?? "");
  const closedAt = tsToMs(s.closedAt ?? s.endTime ?? s.endAt);
  const audit = s.validationAudit as { validatedAt?: unknown } | undefined;
  const accountantAt = tsToMs(audit?.validatedAt ?? (st === "validated_agency" || st === "validated" ? s.validatedAt : null));

  pushIfStep(
    entries,
    "closed",
    closedAt,
    st === "closed" || st === "validated_agency" || st === "validated"
  );

  pushIfStep(entries, "suspended", tsToMs(s.suspendedAt), Boolean(s.suspendedAt));

  pushIfStep(entries, "validated_by_accountant", accountantAt, st === "validated_agency" || st === "validated");

  const managerAt = tsToMs(s.managerValidatedAt ?? s.validatedByCompanyAt);
  pushIfStep(entries, "validated_by_manager", managerAt, st === "validated");

  const hasEx = Boolean(s.hasDiscrepancy) || Boolean(s.discrepancyFlagged);
  const partial = String(s.remittanceStatus ?? "") === "partial_remittance";
  const bizDisc = guichetShiftBusinessDiscrepancy(s) > ACTIVITY_DISCREPANCY_EPSILON;
  const exceptionAt =
    tsToMs(s.discrepancyFlaggedAt) ?? closedAt ?? accountantAt ?? managerAt ?? tsToMs(s.validatedAt);
  pushIfStep(entries, "exception_flagged", exceptionAt, hasEx || partial || bizDisc);

  return sortTimelineEntries(entries);
}

function buildCourierTimeline(s: Record<string, unknown>): SessionTimelineEntry[] {
  const entries: SessionTimelineEntry[] = [];
  entries.push({ event: "created", at: tsToMs(s.createdAt ?? s.openedAt) });

  const st = String(s.status ?? "");
  const closedAt = tsToMs(s.closedAt);
  const validatedAt = tsToMs(s.validatedAt);

  pushIfStep(entries, "closed", closedAt, st === "CLOSED" || st === "VALIDATED");

  pushIfStep(entries, "suspended", tsToMs(s.suspendedAt), Boolean(s.suspendedAt));

  pushIfStep(entries, "validated_by_accountant", validatedAt, st === "VALIDATED");

  const managerAt = tsToMs(s.managerValidatedAt ?? s.validatedByCompanyAt);
  pushIfStep(entries, "validated_by_manager", managerAt, managerAt != null);

  const partial = String(s.remittanceStatus ?? "") === "partial_remittance";
  const bizDisc = courierSessionBusinessDiscrepancy(s) > ACTIVITY_DISCREPANCY_EPSILON;
  const exceptionAt = validatedAt ?? closedAt;
  pushIfStep(entries, "exception_flagged", exceptionAt, st === "VALIDATED" && (partial || bizDisc));

  return sortTimelineEntries(entries);
}

function discrepancySeverity(amount: number): DiscrepancySeverity {
  const a = Math.abs(amount);
  if (a < DISCREPANCY_SEVERITY_LOW_BELOW) return "low";
  if (a <= DISCREPANCY_SEVERITY_MEDIUM_UP_TO) return "medium";
  return "high";
}

function formatFcfaHint(amount: number): string {
  return `${Math.round(Math.abs(amount)).toLocaleString("fr-FR")} FCFA`;
}

function buildActionableExplanationHint(
  discrepancyType: DiscrepancyType,
  discrepancyAmount: number,
  isGuichet: boolean
): string {
  const amt = formatFcfaHint(discrepancyAmount);
  if (discrepancyType === "missing_cash") {
    return isGuichet
      ? `${amt} manquants. Causes possibles : sous-déclaration à la clôture, perte ou erreur de caisse, pièce comptable en attente. Vérifiez le rapport guichet, la remise et l’historique des billets.`
      : `${amt} manquants au regard du total attendu. Causes possibles : colis non saisi, erreur de comptage à la validation ou décalage de période. Contrôlez les colis rattachés à cette session.`;
  }
  if (discrepancyType === "over_cash") {
    return isGuichet
      ? `${amt} en surplus. Causes possibles : double saisie, trop-perçu non annulé ou confusion de liasse. Croisez avec le rapport de session et la caisse physique.`
      : `${amt} en surplus. Causes possibles : double encaissement ou montant de validation supérieur au réel. Revérifiez les montants saisis à la validation.`;
  }
  return isGuichet
    ? `Écart de ${amt} : rapprochez clôture guichet, remise agence et éventuelles dérogations (override) dans le rapport.`
    : `Écart de ${amt} sur la session courrier : ouvrez le détail de validation et la liste des colis rattachés.`;
}

function inferRootCauseHint(
  raw: Record<string, unknown>,
  kind: "guichet" | "courrier",
  row: Pick<AgencySessionHistoryRow, "discrepancy" | "totalExpected" | "totalDeclared" | "status">
): RootCauseHint {
  const overrideConfirmed = Boolean(raw.discrepancyOverrideConfirmed);
  const overrideBy = raw.discrepancyOverrideBy != null;
  if (overrideConfirmed || overrideBy) return "manual_override";

  if (String(raw.remittanceStatus ?? "") === "partial_remittance") return "partial_remittance";

  const closedMs =
    kind === "guichet"
      ? tsToMs(raw.closedAt ?? raw.endTime ?? raw.endAt)
      : tsToMs(raw.closedAt);

  if (kind === "guichet") {
    const st = String(raw.status ?? "");
    const audit = raw.validationAudit as { validatedAt?: unknown } | undefined;
    const accountantValidatedMs = tsToMs(audit?.validatedAt);
    if (st === "closed" && row.totalExpected > ACTIVITY_DISCREPANCY_EPSILON && accountantValidatedMs == null) {
      return "missing_remittance";
    }
    if (
      closedMs != null &&
      accountantValidatedMs != null &&
      accountantValidatedMs - closedMs >= LATE_VALIDATION_HINT_MS
    ) {
      return "late_validation";
    }
  } else {
    const st = String(raw.status ?? "");
    const valMs = tsToMs(raw.validatedAt);
    if (st === "CLOSED" && row.totalExpected > ACTIVITY_DISCREPANCY_EPSILON && valMs == null) {
      return "missing_remittance";
    }
    if (closedMs != null && valMs != null && valMs - closedMs >= LATE_VALIDATION_HINT_MS) {
      return "late_validation";
    }
  }

  return "unknown";
}

/**
 * Contexte d'écart : montant, gravité, piste opérationnelle (lecture seule).
 * Passer `raw` et `kind` pour `rootCauseHint` et une aide contextualisée.
 */
export function buildSessionDiscrepancyContext(
  row: Pick<AgencySessionHistoryRow, "totalExpected" | "totalDeclared" | "discrepancy" | "type" | "status">,
  raw?: Record<string, unknown>,
  kind?: "guichet" | "courrier"
): AgencySessionDiscrepancyContext | undefined {
  if (row.discrepancy <= ACTIVITY_DISCREPANCY_EPSILON) return undefined;

  const delta = row.totalDeclared - row.totalExpected;
  const isGuichet = row.type === "guichet";

  let discrepancyType: DiscrepancyType;
  let discrepancyAmount: number;

  if (delta < -ACTIVITY_DISCREPANCY_EPSILON) {
    discrepancyType = "missing_cash";
    discrepancyAmount = Math.abs(delta);
  } else if (delta > ACTIVITY_DISCREPANCY_EPSILON) {
    discrepancyType = "over_cash";
    discrepancyAmount = delta;
  } else {
    discrepancyType = "unknown";
    discrepancyAmount = row.discrepancy;
  }

  const severity = discrepancySeverity(Math.max(discrepancyAmount, row.discrepancy));
  const explanationHint = buildActionableExplanationHint(discrepancyType, discrepancyAmount, isGuichet);

  const rootCauseHint =
    raw && kind ? inferRootCauseHint(raw, kind, row) : "unknown";

  return {
    discrepancyType,
    discrepancyAmount,
    explanationHint,
    severity,
    rootCauseHint,
  };
}

function computeAgentDiscrepancyTrend(agentSessions: AgencySessionHistoryRow[]): AgentDiscrepancyTrend {
  const sorted = [...agentSessions].sort(
    (a, b) => (b.closedAt ?? b.createdAt ?? 0) - (a.closedAt ?? a.createdAt ?? 0)
  );

  if (sorted.length < 6) return "stable";

  const last3 = sorted.slice(0, 3);
  const prev3 = sorted.slice(3, 6);
  const meanDisc = (arr: AgencySessionHistoryRow[]) =>
    arr.length ? arr.reduce((sum, x) => sum + x.discrepancy, 0) / arr.length : 0;

  const mLast = meanDisc(last3);
  const mPrev = meanDisc(prev3);

  if (mLast + 1 < mPrev) return "improving";
  if (mLast > mPrev + 1) return "worsening";
  return "stable";
}

export function filterAgencyActivityRows(rows: AgencySessionHistoryRow[], f?: AgencyActivityFilters): AgencySessionHistoryRow[] {
  if (!f) return rows;
  return rows.filter((r) => {
    if (f.type && f.type !== "all" && r.type !== f.type) return false;
    if (f.agentId && r.agentId !== f.agentId) return false;
    const t = r.closedAt ?? r.createdAt;
    if (f.dateFromMs != null && t != null && t < f.dateFromMs) return false;
    if (f.dateToMs != null && t != null && t > f.dateToMs) return false;
    if ((f.dateFromMs != null || f.dateToMs != null) && t == null) return false;
    return true;
  });
}

function mapGuichetShift(
  id: string,
  s: Record<string, unknown>,
  agentNameById: Map<string, string>
): AgencySessionHistoryRow {
  const agentId = String(s.userId ?? "");
  const fromDoc = s.userName != null ? String(s.userName).trim() : "";
  const resolved = (agentNameById.get(agentId) || "").trim();
  const agentName =
    fromDoc || resolved || (agentId ? `${agentId.slice(0, 8)}…` : "—");

  const totalExpected = Number(s.totalCash ?? s.amount ?? 0);
  const st = String(s.status ?? "");
  let totalDeclared = 0;
  if (st === "validated_agency" || st === "validated") {
    const audit = s.validationAudit as { receivedCashAmount?: number } | undefined;
    totalDeclared = Number(audit?.receivedCashAmount ?? 0);
  } else if (st === "closed") {
    totalDeclared = Number(s.actualAmount ?? 0);
  }

  const discrepancy = guichetShiftBusinessDiscrepancy(s);
  const createdAt = tsToMs(s.createdAt ?? s.startTime ?? s.startAt) ?? tsToMs(s.openedAt);
  const closedAt = tsToMs(s.closedAt ?? s.endTime ?? s.endAt);
  const timeline = buildGuichetTimeline(s);

  const base: AgencySessionHistoryRow = {
    sessionId: id,
    agentId,
    agentName,
    type: "guichet",
    totalExpected,
    totalDeclared,
    discrepancy,
    status: st,
    createdAt,
    closedAt,
    timeline,
  };
  const discrepancyContext = buildSessionDiscrepancyContext(base, s, "guichet");
  return discrepancyContext ? { ...base, discrepancyContext } : base;
}

function mapCourierSession(
  id: string,
  s: Record<string, unknown>,
  agentNameById: Map<string, string>
): AgencySessionHistoryRow {
  const agentId = String(s.agentId ?? "");
  const code = String(s.agentCode ?? "").trim();
  const resolved = (agentNameById.get(agentId) || "").trim();
  const agentName = resolved || (code ? `Courrier ${code}` : agentId ? `${agentId.slice(0, 8)}…` : "—");

  const st = String(s.status ?? "");
  const validatedAmount = Number(s.validatedAmount ?? 0);
  const difference = Number(s.difference ?? 0);

  let totalExpected = 0;
  let totalDeclared = 0;
  let discrepancy = 0;

  if (st === "VALIDATED") {
    totalDeclared = validatedAmount;
    totalExpected = validatedAmount - difference;
    discrepancy = courierSessionBusinessDiscrepancy(s);
  } else {
    totalExpected = Number(s.expectedAmount ?? 0);
    totalDeclared = 0;
    discrepancy = 0;
  }

  const createdAt = tsToMs(s.createdAt ?? s.openedAt);
  const closedAt = tsToMs(s.closedAt);
  const timeline = buildCourierTimeline(s);

  const base: AgencySessionHistoryRow = {
    sessionId: id,
    agentId,
    agentName,
    type: "courrier",
    totalExpected,
    totalDeclared,
    discrepancy,
    status: st,
    createdAt,
    closedAt,
    timeline,
  };
  const discrepancyContext = buildSessionDiscrepancyContext(base, s, "courrier");
  return discrepancyContext ? { ...base, discrepancyContext } : base;
}

async function loadRawActivityRows(companyId: string, agencyId: string): Promise<AgencySessionHistoryRow[]> {
  const base = `companies/${companyId}/agences/${agencyId}`;
  const shiftsRef = collection(db, `${base}/shifts`);

  const [shiftSnap, courierSnap] = await Promise.all([
    getDocs(query(shiftsRef, orderBy("updatedAt", "desc"), limit(500))).catch(() =>
      getDocs(query(shiftsRef, limit(300)))
    ),
    getDocs(query(courierSessionsRef(db, companyId, agencyId), orderBy("updatedAt", "desc"), limit(500))).catch(
      () => getDocs(query(courierSessionsRef(db, companyId, agencyId), limit(300)))
    ),
  ]);

  const shiftRows: Array<{ id: string } & Record<string, unknown>> = shiftSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  }));
  const courierRows: Array<{ id: string } & Record<string, unknown>> = courierSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  }));

  const uidSet = new Set<string>();
  shiftRows.forEach((r) => {
    const id = String(r.userId ?? "");
    if (id) uidSet.add(id);
  });
  courierRows.forEach((r) => {
    const id = String(r.agentId ?? "");
    if (id) uidSet.add(id);
  });

  const agentNameById = new Map<string, string>();
  await Promise.all(
    [...uidSet].map(async (uid) => {
      try {
        const p = await fetchAgencyStaffProfile(companyId, agencyId, uid);
        if (p.name?.trim()) agentNameById.set(uid, p.name.trim());
      } catch {
        /* ignore */
      }
    })
  );

  const mapped: AgencySessionHistoryRow[] = [
    ...shiftRows.map((r) => mapGuichetShift(r.id, r, agentNameById)),
    ...courierRows.map((r) => mapCourierSession(r.id, r, agentNameById)),
  ];

  mapped.sort((a, b) => {
    const ta = a.closedAt ?? a.createdAt ?? 0;
    const tb = b.closedAt ?? b.createdAt ?? 0;
    return tb - ta;
  });

  return mapped;
}

/** Chargement brut (trie récent en premier) — filtrer côté UI avec {@link filterAgencyActivityRows}. */
export async function loadAgencyActivityRows(companyId: string, agencyId: string): Promise<AgencySessionHistoryRow[]> {
  return loadRawActivityRows(companyId, agencyId);
}

/**
 * Historique unifié guichet + courrier (lecture seule).
 */
export async function getAgencySessionsHistory(
  companyId: string,
  agencyId: string,
  filters?: AgencyActivityFilters
): Promise<AgencySessionHistoryRow[]> {
  const raw = await loadRawActivityRows(companyId, agencyId);
  return filterAgencyActivityRows(raw, filters);
}

export function aggregateAgentPerformance(rows: AgencySessionHistoryRow[]): AgentPerformanceRow[] {
  const byAgent = new Map<
    string,
    {
      agentName: string;
      totalSessions: number;
      totalExpected: number;
      totalDeclared: number;
      totalDiscrepancy: number;
      discrepancySessionCount: number;
      sessions: AgencySessionHistoryRow[];
    }
  >();

  rows.forEach((r) => {
    if (!r.agentId) return;
    const cur = byAgent.get(r.agentId) ?? {
      agentName: r.agentName,
      totalSessions: 0,
      totalExpected: 0,
      totalDeclared: 0,
      totalDiscrepancy: 0,
      discrepancySessionCount: 0,
      sessions: [] as AgencySessionHistoryRow[],
    };
    cur.agentName = r.agentName || cur.agentName;
    cur.totalSessions += 1;
    cur.totalExpected += r.totalExpected;
    cur.totalDeclared += r.totalDeclared;
    cur.totalDiscrepancy += r.discrepancy;
    cur.sessions.push(r);
    if (r.discrepancy > ACTIVITY_DISCREPANCY_EPSILON) cur.discrepancySessionCount += 1;
    byAgent.set(r.agentId, cur);
  });

  const out: AgentPerformanceRow[] = [];
  byAgent.forEach((v, agentId) => {
    const hasLitige = v.discrepancySessionCount >= 1;
    const litigeRows = v.sessions.filter((r) => r.discrepancy > ACTIVITY_DISCREPANCY_EPSILON);
    const lastDiscrepancyDate =
      litigeRows.length > 0
        ? Math.max(...litigeRows.map((r) => r.closedAt ?? r.createdAt ?? 0))
        : null;

    const averageDiscrepancy =
      litigeRows.length > 0
        ? litigeRows.reduce((sum, r) => sum + r.discrepancy, 0) / litigeRows.length
        : 0;

    const trend = computeAgentDiscrepancyTrend(v.sessions);

    out.push({
      agentId,
      agentName: v.agentName,
      totalSessions: v.totalSessions,
      totalExpected: v.totalExpected,
      totalDeclared: v.totalDeclared,
      totalDiscrepancy: v.totalDiscrepancy,
      status: hasLitige ? "WARNING" : "OK",
      discrepancySessionCount: v.discrepancySessionCount,
      lastDiscrepancyDate,
      averageDiscrepancy,
      trend,
    });
  });

  return out.sort((a, b) => b.totalDiscrepancy - a.totalDiscrepancy || b.discrepancySessionCount - a.discrepancySessionCount);
}

/**
 * Agrégat par agent (mêmes filtres que l'historique). Enchaîne un chargement Firestore : pour l'UI, préférer
 * `getAgencySessionsHistory` + `aggregateAgentPerformance` pour une seule lecture.
 */
export async function getAgentPerformance(
  companyId: string,
  agencyId: string,
  filters?: AgencyActivityFilters
): Promise<AgentPerformanceRow[]> {
  const sessions = await getAgencySessionsHistory(companyId, agencyId, filters);
  return aggregateAgentPerformance(sessions);
}
