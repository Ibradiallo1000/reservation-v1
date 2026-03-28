/**
 * Couche de sécurité — cohérence « caisse en attente de remise » (pending ledger).
 * Lecture / audit uniquement pour la réconciliation ; les écritures métier restent dans sessionService / validateCourierSession.
 */

import {
  collection,
  getDoc,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { agencyPendingCashAccountDocId, ledgerAccountDocRef } from "@/modules/compagnie/treasury/ledgerAccounts";
import { courierSessionsRef } from "@/modules/logistics/domain/courierSessionPaths";
import { getCourierSessionLedgerTotal } from "@/modules/logistics/services/courierSessionLedger";

/** Incrémenter lors d’un changement de règles métier pending / remise. */
export const PENDING_CASH_LEDGER_SYSTEM_VERSION = 1;

/** Données de session closes avant cette date (UTC) : considérées legacy pour l’audit (tolérance / signalement). */
export const PENDING_CASH_LEGACY_CUTOFF_MS = Date.parse("2026-03-24T00:00:00.000Z");

/** Seuil « pending anormalement élevé » (alerte chef). */
export const PENDING_CASH_HIGH_THRESHOLD_FCFA = 10_000_000;

/** Délai après clôture guichet sans validation comptable → alerte remise. */
export const PENDING_REMITTANCE_ALERT_HOURS = 8;

export type PendingCashRemittanceStatus = "full_remittance" | "partial_remittance";

export type PendingCashAuditAnomalyKind =
  | "pending_mismatch_sessions_vs_ledger"
  | "legacy_sessions_ignored";

export type PendingCashAuditAnomaly = {
  id: string;
  createdAtIso: string;
  kind: PendingCashAuditAnomalyKind;
  message: string;
  details: Record<string, unknown>;
  systemVersion: number;
  /** true si le calcul attendu a exclu ou marqué des sessions legacy */
  legacyContext: boolean;
};

function anomalyKey(companyId: string, agencyId: string) {
  return `teliya:pending-cash-audit:v${PENDING_CASH_LEDGER_SYSTEM_VERSION}:${companyId}:${agencyId}`;
}

export function recordPendingCashAuditAnomaly(
  companyId: string,
  agencyId: string,
  entry: Omit<PendingCashAuditAnomaly, "id" | "createdAtIso" | "systemVersion"> & { systemVersion?: number }
): PendingCashAuditAnomaly {
  const row: PendingCashAuditAnomaly = {
    id: `pca-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAtIso: new Date().toISOString(),
    systemVersion: entry.systemVersion ?? PENDING_CASH_LEDGER_SYSTEM_VERSION,
    kind: entry.kind,
    message: entry.message,
    details: entry.details,
    legacyContext: entry.legacyContext,
  };
  try {
    const raw = localStorage.getItem(anomalyKey(companyId, agencyId));
    const prev: PendingCashAuditAnomaly[] = raw ? JSON.parse(raw) : [];
    const next = [row, ...(Array.isArray(prev) ? prev : [])].slice(0, 200);
    localStorage.setItem(anomalyKey(companyId, agencyId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return row;
}

export function listPendingCashAuditAnomalies(companyId: string, agencyId: string): PendingCashAuditAnomaly[] {
  try {
    const raw = localStorage.getItem(anomalyKey(companyId, agencyId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function shiftClosedAtMs(s: Record<string, unknown>): number {
  const c = s.closedAt as { toMillis?: () => number } | undefined;
  const e = s.endAt as { toMillis?: () => number } | undefined;
  const cr = s.createdAt as { toMillis?: () => number } | undefined;
  return c?.toMillis?.() ?? e?.toMillis?.() ?? cr?.toMillis?.() ?? 0;
}

function isLegacyShiftForPending(s: Record<string, unknown>): boolean {
  const ms = shiftClosedAtMs(s);
  if (ms > 0 && ms < PENDING_CASH_LEGACY_CUTOFF_MS) return true;
  if (s.legacyPendingCash === true) return true;
  return false;
}

/** Plancher 1000 FCFA : petits écarts opérationnels / arrondis sans masquer les gros écarts (0,5 % au-delà). */
function reconTolerance(expected: number): number {
  return Math.max(1000, Math.abs(expected) * 0.005);
}

const PENDING_MISMATCH_NOTIFY_MS = 120_000;
let lastPendingMismatchNotify: { key: string; t: number } | null = null;

function notifyPendingMismatchOnce(
  companyId: string,
  agencyId: string,
  expectedFromSessions: number,
  actualPendingBalance: number,
  fn: () => void
): void {
  const key = `${companyId}|${agencyId}|${expectedFromSessions}|${actualPendingBalance}`;
  const now = Date.now();
  if (
    lastPendingMismatchNotify &&
    lastPendingMismatchNotify.key === key &&
    now - lastPendingMismatchNotify.t < PENDING_MISMATCH_NOTIFY_MS
  ) {
    return;
  }
  lastPendingMismatchNotify = { key, t: now };
  fn();
}

export type PendingCashReconciliationResult = {
  actualPendingBalance: number;
  expectedFromSessions: number;
  diff: number;
  mismatch: boolean;
  legacySessionCount: number;
  partialRemittanceShiftCount: number;
  pendingTooHigh: boolean;
  /** Sessions guichet clôturées non encore traitées par le comptable (hors legacy) */
  closedShiftCount: number;
  closedCourierCount: number;
  activeShiftCount: number;
  pausedShiftCount: number;
  openGuichetExpected: number;
};

function isSoldReservationStatus(statut: unknown): boolean {
  const s = String(statut ?? "").toLowerCase().trim();
  return s === "paye" || s === "payé" || s === "confirme" || s === "confirmé";
}

async function getOpenGuichetExpectedAmount(
  companyId: string,
  agencyId: string,
  sessionIds: string[]
): Promise<number> {
  if (sessionIds.length === 0) return 0;
  const reservationsRef = collection(db, "companies", companyId, "agences", agencyId, "reservations");
  let total = 0;
  // Firestore "in" supports up to 10 values.
  for (let i = 0; i < sessionIds.length; i += 10) {
    const chunk = sessionIds.slice(i, i + 10);
    const snap = await getDocs(
      query(
        reservationsRef,
        where("createdInSessionId", "in", chunk),
        limit(1000)
      )
    );
    for (const d of snap.docs) {
      const r = d.data() as Record<string, unknown>;
      const statut = String(r.statut ?? "").toLowerCase().trim();
      if (statut === "annule" || statut === "annulation_en_attente" || statut === "invalide") continue;
      if (!isSoldReservationStatus(r.statut)) continue;
      const canal = String(r.canal ?? "").toLowerCase();
      if (canal && canal !== "guichet") continue;
      total += Number(r.montant ?? 0) || 0;
    }
  }
  return total;
}

/**
 * Compare le solde ledger du compte pending avec la somme métier des montants encore « en attente de remise ».
 * Ne modifie pas Firestore.
 */
export async function reconcilePendingCashAgency(
  companyId: string,
  agencyId: string
): Promise<PendingCashReconciliationResult> {
  const pendingRef = ledgerAccountDocRef(companyId, agencyPendingCashAccountDocId(agencyId));
  const pendingSnap = await getDoc(pendingRef);
  const actualPendingBalance = pendingSnap.exists()
    ? Number((pendingSnap.data() as { balance?: number }).balance ?? 0)
    : 0;

  const shiftsRef = collection(db, "companies", companyId, "agences", agencyId, "shifts");
  const [activeSnap, pausedSnap, closedSnap, partialAgencySnap, partialValidatedSnap] = await Promise.all([
    getDocs(query(shiftsRef, where("status", "==", "active"), limit(80))),
    getDocs(query(shiftsRef, where("status", "==", "paused"), limit(80))),
    getDocs(query(shiftsRef, where("status", "==", "closed"), limit(300))),
    getDocs(query(shiftsRef, where("status", "==", "validated_agency"), limit(300))),
    getDocs(query(shiftsRef, where("status", "==", "validated"), limit(300))),
  ]);

  let expectedFromSessions = 0;
  let legacySessionCount = 0;
  let partialRemittanceShiftCount = 0;
  let closedShiftCount = 0;
  const activeShiftCount = activeSnap.size;
  const pausedShiftCount = pausedSnap.size;

  for (const d of closedSnap.docs) {
    const s = d.data() as Record<string, unknown>;
    if (isLegacyShiftForPending(s)) {
      legacySessionCount++;
      continue;
    }
    closedShiftCount++;
    expectedFromSessions += Number(s.totalCash ?? s.amount ?? 0);
  }

  for (const d of partialAgencySnap.docs) {
    const s = d.data() as Record<string, unknown>;
    if (isLegacyShiftForPending(s)) {
      legacySessionCount++;
      continue;
    }
    if (String(s.remittanceStatus ?? "") === "partial_remittance") {
      partialRemittanceShiftCount++;
      expectedFromSessions += Number(s.remittanceDiscrepancyAmount ?? 0);
    }
  }

  // Compatibilité: certaines sessions guichet partielles peuvent déjà être passées en
  // status "validated" tout en gardant une discrepancy en attente.
  for (const d of partialValidatedSnap.docs) {
    const s = d.data() as Record<string, unknown>;
    if (isLegacyShiftForPending(s)) {
      legacySessionCount++;
      continue;
    }
    if (String(s.remittanceStatus ?? "") === "partial_remittance") {
      partialRemittanceShiftCount++;
      expectedFromSessions += Number(s.remittanceDiscrepancyAmount ?? 0);
    }
  }

  const openSessionIds = [
    ...activeSnap.docs.map((d) => d.id),
    ...pausedSnap.docs.map((d) => d.id),
  ];
  const openGuichetExpected = await getOpenGuichetExpectedAmount(companyId, agencyId, openSessionIds);
  expectedFromSessions += openGuichetExpected;

  const cRef = courierSessionsRef(db, companyId, agencyId);
  const courierClosedSnap = await getDocs(query(cRef, where("status", "==", "CLOSED"), limit(200)));
  let closedCourierCount = 0;
  const courierTotals = await Promise.all(
    courierClosedSnap.docs.map(async (d) => {
      const data = d.data() as Record<string, unknown>;
      const created = (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
      if (created > 0 && created < PENDING_CASH_LEGACY_CUTOFF_MS) {
        return { legacy: true as const, total: 0 };
      }
      const total = await getCourierSessionLedgerTotal(companyId, d.id);
      return { legacy: false as const, total };
    })
  );
  for (const row of courierTotals) {
    if (row.legacy) {
      legacySessionCount++;
      continue;
    }
    closedCourierCount++;
    expectedFromSessions += row.total;
  }

  const courierValidatedSnap = await getDocs(query(cRef, where("status", "==", "VALIDATED"), limit(200)));
  for (const d of courierValidatedSnap.docs) {
    const data = d.data() as Record<string, unknown>;
    const created = (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
    if (created > 0 && created < PENDING_CASH_LEGACY_CUTOFF_MS) {
      legacySessionCount++;
      continue;
    }
    if (String(data.remittanceStatus ?? "") === "partial_remittance") {
      expectedFromSessions += Number(data.remittanceDiscrepancyAmount ?? 0);
    }
  }

  const diff = Math.abs(expectedFromSessions - actualPendingBalance);
  const tolerance = reconTolerance(expectedFromSessions);
  const mismatch = diff > tolerance;
  const pendingTooHigh = actualPendingBalance > PENDING_CASH_HIGH_THRESHOLD_FCFA;

  if (mismatch) {
    notifyPendingMismatchOnce(companyId, agencyId, expectedFromSessions, actualPendingBalance, () => {
      console.warn("[PendingCash] Reconciliation mismatch", {
        companyId,
        agencyId,
        expectedFromSessions,
        actualPendingBalance,
        diff,
        tolerance,
        legacySessionCount,
        systemVersion: PENDING_CASH_LEDGER_SYSTEM_VERSION,
        cutoffMs: PENDING_CASH_LEGACY_CUTOFF_MS,
      });
      recordPendingCashAuditAnomaly(companyId, agencyId, {
        kind: "pending_mismatch_sessions_vs_ledger",
        message: "Écart entre montant pending attendu (sessions) et solde ledger pending.",
        details: {
          expectedFromSessions,
          actualPendingBalance,
          diff,
          tolerance,
          closedShiftCount,
          closedCourierCount,
          partialRemittanceShiftCount,
          legacySessionCount,
        },
        legacyContext: legacySessionCount > 0,
      });
    });
  }

  if (legacySessionCount > 0 && !mismatch) {
    console.info("[PendingCash] Legacy sessions excluded or present in agency", {
      companyId,
      agencyId,
      legacySessionCount,
      cutoffMs: PENDING_CASH_LEGACY_CUTOFF_MS,
    });
  }

  if (pendingTooHigh) {
    console.warn("[PendingCash] Solde pending élevé", {
      actualPendingBalance,
      threshold: PENDING_CASH_HIGH_THRESHOLD_FCFA,
      companyId,
      agencyId,
    });
  }

  return {
    actualPendingBalance,
    expectedFromSessions,
    diff,
    mismatch,
    legacySessionCount,
    partialRemittanceShiftCount,
    pendingTooHigh,
    closedShiftCount,
    closedCourierCount,
    activeShiftCount,
    pausedShiftCount,
    openGuichetExpected,
  };
}

/** Horodatage pour tracer côté document quand la logique pending a été appliquée. */
export function pendingCashComplianceTimestamp(): Timestamp {
  return Timestamp.now();
}
