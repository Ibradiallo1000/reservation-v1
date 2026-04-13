/**
 * Courier session service — aligné guichet : PENDING → ACTIVE → CLOSED → VALIDATED_AGENCY → VALIDATED.
 * Totaux théoriques : exclusivement via financialTransactions (getCourierSessionLedgerTotal).
 */

import {
  doc,
  setDoc,
  getDocs,
  query,
  where,
  limit,
  runTransaction,
  serverTimestamp,
  getDoc,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { CourierSession, CourierSessionStatus } from "../domain/courierSession.types";
import { courierSessionsRef, courierSessionRef } from "../domain/courierSessionPaths";
import {
  updateDailyStatsOnCourierSessionValidatedByAgency,
  updateDailyStatsOnCourierSessionValidatedByCompany,
  revertDailyStatsOnCourierSessionAgencyValidation,
  formatDateForDailyStats,
  dailyStatsTimezoneFromAgencyData,
} from "@/modules/agence/aggregates/dailyStats";
import { authorizeActorInAgency } from "@/modules/agence/services/sessionService";
import {
  updateAgencyLiveStateOnCourierSessionActivated,
  updateAgencyLiveStateOnCourierSessionClosed,
  updateAgencyLiveStateOnCourierSessionValidated,
  updateAgencyLiveStateOnCourierSessionAgencyValidationReverted,
} from "@/modules/agence/aggregates/agencyLiveState";
import { getCourierSessionLedgerTotal } from "./courierSessionLedger";
import {
  applyRemittancePendingToAgencyCashInTransaction,
  reverseRemittancePendingToAgencyCashInTransaction,
} from "@/modules/compagnie/treasury/financialTransactions";
import {
  PENDING_CASH_LEDGER_SYSTEM_VERSION,
  type PendingCashRemittanceStatus,
} from "@/modules/agence/comptabilite/pendingCashSafety";
import {
  writeComptaEncaissementInTransaction,
  courierComptaEncaissementDocRef,
} from "@/modules/agence/comptabilite/comptaEncaissementsService";
import { logAgentHistoryEvent } from "@/modules/agence/services/agentHistoryService";
import {
  getSessionRemittanceDocumentId,
  upsertAccountingRemittanceReceiptDocument,
  upsertSessionRemittanceDocument,
} from "@/modules/finance/documents/financialDocumentsService";

const OPEN_STATUSES: CourierSessionStatus[] = ["PENDING", "ACTIVE"];

function toTimestampOrNull(value: Date | Timestamp | string | number | null | undefined): Timestamp | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === "number" && Number.isFinite(value)) return Timestamp.fromMillis(value);
  if (typeof value === "string") {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return Timestamp.fromMillis(ms);
  }
  return null;
}

/** Returns existing open session id for this agent, or null. */
export async function getOpenCourierSessionId(
  companyId: string,
  agencyId: string,
  agentId: string
): Promise<string | null> {
  const col = courierSessionsRef(db, companyId, agencyId);
  const q = query(col, where("agentId", "==", agentId), limit(20));
  const snap = await getDocs(q);
  const open = snap.docs
    .filter((d) => OPEN_STATUSES.includes((d.data() as CourierSession).status))
    .sort((a, b) => {
      const aT = (a.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      const bT = (b.data().createdAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
      return bT - aT;
    });
  return open.length > 0 ? open[0].id : null;
}

/**
 * Agent creates a session → PENDING.
 * Fails if agent already has an open (PENDING or ACTIVE) session.
 */
export async function createCourierSession(params: {
  companyId: string;
  agencyId: string;
  agentId: string;
  agentCode: string;
}): Promise<string> {
  const existing = await getOpenCourierSessionId(params.companyId, params.agencyId, params.agentId);
  if (existing) return existing;

  const col = courierSessionsRef(db, params.companyId, params.agencyId);
  const ref = doc(col);
  const sessionId = ref.id;
  await setDoc(ref, {
    sessionId,
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: params.agentId,
    agentCode: params.agentCode,
    status: "PENDING",
    openedAt: null,
    closedAt: null,
    validatedAt: null,
    validatedAmount: null,
    difference: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return sessionId;
}

/**
 * Accountant activates session → ACTIVE.
 * Only PENDING can be activated.
 */
export async function activateCourierSession(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  activatedBy: { id: string; name?: string | null };
}): Promise<void> {
  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error("Session courrier introuvable.");
  const data = snap.data() as CourierSession;
  if (data.status !== "PENDING") {
    throw new Error("Seule une session en attente peut être activée.");
  }

  await runTransaction(db, async (tx) => {
    const s = await tx.get(sessionRef);
    if (!s.exists()) throw new Error("Session courrier introuvable.");
    if ((s.data() as CourierSession).status !== "PENDING") {
      throw new Error("Seule une session en attente peut être activée.");
    }
    const now = serverTimestamp();
    tx.update(sessionRef, {
      status: "ACTIVE",
      openedAt: now,
      activatedBy: {
        id: params.activatedBy.id,
        name: params.activatedBy.name ?? null,
      },
      updatedAt: now,
    });
    updateAgencyLiveStateOnCourierSessionActivated(tx, params.companyId, params.agencyId);
  });

  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: data.agentId,
    role: "agentCourrier",
    type: "SESSION_OPENED",
    referenceId: params.sessionId,
    status: "EN_COURS",
    createdBy: params.activatedBy.id,
    metadata: {
      activatedByName: params.activatedBy.name ?? undefined,
      agentCode: data.agentCode,
    },
  });
}

/**
 * Agent closes session → CLOSED.
 * Aucun montant « attendu » persisté : le comptable compare à la somme ledger (financialTransactions).
 */
export async function closeCourierSession(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
}): Promise<{ ledgerSessionTotal: number }> {
  const ledgerSessionTotal = await getCourierSessionLedgerTotal(params.companyId, params.sessionId);
  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  let courierAgentId = "";

  await runTransaction(db, async (tx) => {
    const sSnap = await tx.get(sessionRef);
    if (!sSnap.exists()) throw new Error("Session courrier introuvable.");
    const data = sSnap.data() as CourierSession;
    if (data.status !== "ACTIVE") {
      throw new Error("La session doit être ACTIVE pour être clôturée.");
    }
    courierAgentId = data.agentId;
    tx.update(sessionRef, {
      status: "CLOSED",
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    updateAgencyLiveStateOnCourierSessionClosed(tx, params.companyId, params.agencyId);
  });

  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: courierAgentId,
    role: "agentCourrier",
    type: "SESSION_CLOSED",
    referenceId: params.sessionId,
    amount: ledgerSessionTotal,
    status: "EN_ATTENTE",
    createdBy: courierAgentId,
    metadata: { channel: "courrier", ledgerSessionTotal },
  });

  return { ledgerSessionTotal };
}

/**
 * Comptable agence : CLOSED → VALIDATED_AGENCY (remise caisse + compta, comme le guichet).
 * Le chef d'agence finalise avec {@link validateCourierSessionByHeadAccountant} → VALIDATED.
 */
export async function validateCourierSession(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  validatedAmount: number;
  validatedBy: { id: string; name?: string | null };
  captureMode?: "normal" | "after_entry";
  manualDocumentUsed?: boolean;
  manualDocumentType?: string | null;
  manualDocumentNumber?: string | null;
  manualReceiptNumber?: string | null;
  effectiveOperationDate?: Date | Timestamp | string | number | null;
  regularizedByUid?: string | null;
  regularizedByName?: string | null;
  regularizedAt?: Date | Timestamp | string | number | null;
}): Promise<{ difference: number; ledgerSessionTotal: number }> {
  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  const snap = await getDoc(sessionRef);
  if (!snap.exists()) throw new Error("Session courrier introuvable.");
  const data = snap.data() as CourierSession;
  const ledgerSessionTotalEarly = await getCourierSessionLedgerTotal(params.companyId, params.sessionId);
  if (data.status === "VALIDATED" || data.status === "VALIDATED_AGENCY") {
    return {
      difference: Number(data.difference ?? 0),
      ledgerSessionTotal: ledgerSessionTotalEarly,
    };
  }
  if (data.status !== "CLOSED") {
    throw new Error("La session doit être CLOSED pour être validée.");
  }

  const ledgerSessionTotal = ledgerSessionTotalEarly;
  const difference = params.validatedAmount - ledgerSessionTotal;

  const agencySnapForTz = await getDoc(doc(db, "companies", params.companyId, "agences", params.agencyId));
  const agencyData = agencySnapForTz.data() as { timezone?: string; currency?: string } | undefined;
  const agencyTz = dailyStatsTimezoneFromAgencyData(agencyData);
  const agencyCurrency = String(agencyData?.currency ?? "XOF");
  const statsDate = formatDateForDailyStats(data.closedAt ?? data.createdAt, agencyTz);
  const captureMode = params.captureMode === "after_entry" ? "after_entry" : "normal";
  const manualDocumentUsed = Boolean(params.manualDocumentUsed);
  const manualDocumentType = String(params.manualDocumentType ?? "").trim() || null;
  const manualDocumentNumber = String(params.manualDocumentNumber ?? "").trim() || null;
  const manualReceiptNumber = String(params.manualReceiptNumber ?? "").trim() || null;
  const effectiveOperationDate = toTimestampOrNull(params.effectiveOperationDate ?? null);
  const regularizedByUid = String(params.regularizedByUid ?? "").trim() || null;
  const regularizedByName = String(params.regularizedByName ?? "").trim() || null;
  const regularizedAt =
    toTimestampOrNull(params.regularizedAt ?? null) ??
    (captureMode === "after_entry" ? Timestamp.now() : null);

  await runTransaction(db, async (tx) => {
    const sSnap = await tx.get(sessionRef);
    if (!sSnap.exists()) throw new Error("Session courrier introuvable.");
    if ((sSnap.data() as CourierSession).status !== "CLOSED") {
      throw new Error("La session doit être CLOSED pour être validée.");
    }
    const isPartialRemittance = params.validatedAmount + 0.01 < ledgerSessionTotal;
    const remittanceStatus: PendingCashRemittanceStatus = isPartialRemittance
      ? "partial_remittance"
      : "full_remittance";
    const remittanceDiscrepancyAmount = isPartialRemittance
      ? Math.max(0, ledgerSessionTotal - params.validatedAmount)
      : 0;

    /** Ledger avant update session : tous les get avant les writes (Firestore). */
    await applyRemittancePendingToAgencyCashInTransaction(
      tx,
      params.companyId,
      params.agencyId,
      params.validatedAmount,
      agencyCurrency,
      { referenceType: "courier_session", referenceId: params.sessionId },
      `courier session ${params.sessionId} validated by accountant`
    );

    tx.update(sessionRef, {
      status: "VALIDATED_AGENCY",
      validatedAt: serverTimestamp(),
      validatedAmount: params.validatedAmount,
      difference,
      remittanceStatus,
      remittanceDiscrepancyAmount,
      pendingCashLedgerVersion: PENDING_CASH_LEDGER_SYSTEM_VERSION,
      captureMode,
      manualDocumentUsed,
      manualDocumentType,
      manualDocumentNumber,
      manualReceiptNumber,
      effectiveOperationDate,
      regularizedByUid,
      regularizedByName,
      regularizedAt,
      validatedBy: {
        id: params.validatedBy.id,
        name: params.validatedBy.name ?? null,
      },
      updatedAt: serverTimestamp(),
    });

    if (params.validatedAmount > 0) {
      writeComptaEncaissementInTransaction(tx, params.companyId, params.agencyId, {
        sessionId: params.sessionId,
        montant: params.validatedAmount,
        source: "courrier",
      });
    }
    updateDailyStatsOnCourierSessionValidatedByAgency(
      tx,
      params.companyId,
      params.agencyId,
      statsDate,
      ledgerSessionTotal,
      agencyTz
    );
    updateAgencyLiveStateOnCourierSessionValidated(tx, params.companyId, params.agencyId);
  });

  const v = params.validatedBy;
  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: v.id,
    agentName: v.name ?? null,
    role: "agency_accountant",
    type: "REMISSION_DONE",
    referenceId: params.sessionId,
    amount: params.validatedAmount,
    status: "VALIDE",
    createdBy: v.id,
    metadata: {
      expectedAmount: ledgerSessionTotal,
      declaredAmount: params.validatedAmount,
      difference,
      channel: "courrier",
      courierAgentId: data.agentId,
    },
  });
  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: v.id,
    agentName: v.name ?? null,
    role: "agency_accountant",
    type: "SESSION_VALIDATED",
    referenceId: params.sessionId,
    status: "VALIDE",
    createdBy: v.id,
    metadata: {
      validationLevel: "agency_accountant",
      channel: "courrier",
      expectedAmount: ledgerSessionTotal,
      declaredAmount: params.validatedAmount,
      difference,
    },
  });

  const modeObservation = [
    captureMode === "after_entry" ? "Saisie apres coup regularisee." : null,
    manualDocumentUsed
      ? `Piece manuelle utilisee (${manualDocumentType ?? "piece_manuelle"}${
          manualDocumentNumber ? ` #${manualDocumentNumber}` : ""
        }).`
      : null,
    manualReceiptNumber ? `Recu manuel: ${manualReceiptNumber}.` : null,
  ]
    .filter(Boolean)
    .join(" ");

  try {
    await upsertSessionRemittanceDocument({
      companyId: params.companyId,
      agencyId: params.agencyId,
      sessionId: params.sessionId,
      sessionType: "courrier",
      sourceType: "courier_session",
      periodStart: data.openedAt ?? data.createdAt ?? null,
      periodEnd: data.closedAt ?? null,
      agent: {
        uid: data.agentId,
        role: "agentCourrier",
        name: data.agentCode ?? data.agentId,
      },
      receiver: {
        uid: params.validatedBy.id,
        name: params.validatedBy.name ?? null,
        role: "agency_accountant",
      },
      controller: null,
      amountTheoretical: ledgerSessionTotal,
      amountRemitted: params.validatedAmount,
      amountDifference: difference,
      currency: agencyCurrency,
      ventilationByMode: {
        cash: ledgerSessionTotal,
      },
      status: "ready_to_print",
      observations:
        [
          Math.abs(difference) > 0
            ? "Ecart detecte entre montant attendu courrier et montant verse."
            : null,
          modeObservation || null,
        ]
          .filter(Boolean)
          .join(" ") || null,
      createdByUid: params.validatedBy.id,
    });
    await upsertAccountingRemittanceReceiptDocument({
      companyId: params.companyId,
      agencyId: params.agencyId,
      sessionId: params.sessionId,
      sourceType: "courier_session",
      agent: {
        uid: data.agentId,
        role: "agentCourrier",
        name: data.agentCode ?? data.agentId,
      },
      accountant: {
        uid: params.validatedBy.id,
        name: params.validatedBy.name ?? null,
        role: "agency_accountant",
      },
      amountRemitted: params.validatedAmount,
      amountDifference: difference,
      currency: agencyCurrency,
      referenceSessionRemittanceId: getSessionRemittanceDocumentId(
        "courier_session",
        params.sessionId
      ),
      dateHeure: new Date(),
      observations:
        [
          Math.abs(difference) > 0
            ? "Recu comptable emis avec ecart sur session courrier."
            : "Recu comptable emis pour session courrier.",
          modeObservation || null,
        ]
          .filter(Boolean)
          .join(" "),
      status: "ready_to_print",
      createdByUid: params.validatedBy.id,
    });
  } catch (docError) {
    console.error("[courierSession] echec generation fiche remise session courrier", {
      companyId: params.companyId,
      agencyId: params.agencyId,
      sessionId: params.sessionId,
      docError,
    });
  }

  return { difference, ledgerSessionTotal };
}

/**
 * Chef d'agence : VALIDATED_AGENCY → VALIDATED (stats siège, sans second mouvement caisse).
 */
export async function validateCourierSessionByHeadAccountant(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  validatedBy: { id: string; name?: string | null };
}): Promise<void> {
  await authorizeActorInAgency({
    userId: params.validatedBy.id,
    companyId: params.companyId,
    agencyId: params.agencyId,
    allowedRoles: ["chefAgence", "admin_compagnie", "admin_platforme"],
    deniedMessage: "Seul un chef d'agence peut valider cette étape.",
  });
  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  const preSnap = await getDoc(sessionRef);
  if (!preSnap.exists()) throw new Error("Session courrier introuvable.");
  const pre = preSnap.data() as CourierSession;
  if (pre.status === "VALIDATED") return;
  if (pre.status !== "VALIDATED_AGENCY") {
    throw new Error(
      "Seules les sessions courrier validées par le comptable agence peuvent être approuvées par le chef d'agence."
    );
  }
  const ledgerSessionTotal = await getCourierSessionLedgerTotal(params.companyId, params.sessionId);
  const agencySnapForTz = await getDoc(doc(db, "companies", params.companyId, "agences", params.agencyId));
  const agencyData = agencySnapForTz.data() as { timezone?: string } | undefined;
  const agencyTz = dailyStatsTimezoneFromAgencyData(agencyData);
  const statsDate = formatDateForDailyStats(pre.closedAt ?? pre.createdAt, agencyTz);

  await runTransaction(db, async (tx) => {
    const sSnap = await tx.get(sessionRef);
    if (!sSnap.exists()) throw new Error("Session courrier introuvable.");
    const s = sSnap.data() as CourierSession;
    if (s.status === "VALIDATED") {
      throw new Error("Cette session courrier a déjà été validée par le chef d'agence.");
    }
    if (s.status !== "VALIDATED_AGENCY") {
      throw new Error(
        "Seules les sessions courrier validées par le comptable agence peuvent être approuvées par le chef d'agence."
      );
    }
    const now = serverTimestamp();
    tx.update(sessionRef, {
      status: "VALIDATED",
      managerValidated: true,
      managerValidatedAt: now,
      validatedByChef: {
        id: params.validatedBy.id,
        name: params.validatedBy.name ?? null,
      },
      updatedAt: now,
    });
    updateDailyStatsOnCourierSessionValidatedByCompany(
      tx,
      params.companyId,
      params.agencyId,
      statsDate,
      ledgerSessionTotal,
      agencyTz
    );
  });

  const v = params.validatedBy;
  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: v.id,
    agentName: v.name ?? null,
    role: "chefAgence",
    type: "SESSION_VALIDATED",
    referenceId: params.sessionId,
    amount: ledgerSessionTotal,
    status: "VALIDE",
    createdBy: v.id,
    metadata: {
      validationLevel: "chef_agence",
      channel: "courrier",
      courierAgentId: pre.agentId,
    },
  });

  try {
    await upsertSessionRemittanceDocument({
      companyId: params.companyId,
      agencyId: params.agencyId,
      sessionId: params.sessionId,
      sessionType: "courrier",
      sourceType: "courier_session",
      periodStart: pre.openedAt ?? pre.createdAt ?? null,
      periodEnd: pre.closedAt ?? null,
      agent: {
        uid: pre.agentId,
        role: "agentCourrier",
        name: pre.agentCode ?? pre.agentId,
      },
      receiver: {
        uid: (pre.validatedBy as { id?: string } | undefined)?.id ?? null,
        role: "agency_accountant",
        name: (pre.validatedBy as { name?: string } | undefined)?.name ?? null,
      },
      controller: {
        uid: params.validatedBy.id,
        role: "chefAgence",
        name: params.validatedBy.name ?? null,
      },
      amountTheoretical: ledgerSessionTotal,
      amountRemitted: Number(pre.validatedAmount ?? 0),
      amountDifference: Number(pre.difference ?? 0),
      status: "ready_to_print",
      observations: "Validation finale chef d'agence effectuee pour la session courrier.",
      createdByUid: params.validatedBy.id,
    });
    await upsertAccountingRemittanceReceiptDocument({
      companyId: params.companyId,
      agencyId: params.agencyId,
      sessionId: params.sessionId,
      sourceType: "courier_session",
      agent: {
        uid: pre.agentId,
        role: "agentCourrier",
        name: pre.agentCode ?? pre.agentId,
      },
      accountant: {
        uid: (pre.validatedBy as { id?: string } | undefined)?.id ?? null,
        role: "agency_accountant",
        name: (pre.validatedBy as { name?: string } | undefined)?.name ?? null,
      },
      amountRemitted: Number(pre.validatedAmount ?? 0),
      amountDifference: Number(pre.difference ?? 0),
      currency: "XOF",
      referenceSessionRemittanceId: getSessionRemittanceDocumentId(
        "courier_session",
        params.sessionId
      ),
      dateHeure: new Date(),
      observations:
        "Recu comptable confirme apres validation finale chef d'agence (courrier).",
      status: "ready_to_print",
      createdByUid: params.validatedBy.id,
    });
  } catch (docError) {
    console.error("[courierSession] echec mise a jour fiche remise apres validation chef", {
      companyId: params.companyId,
      agencyId: params.agencyId,
      sessionId: params.sessionId,
      docError,
    });
  }
}

/**
 * Chef d'agence : renvoie une session courrier au comptable (VALIDATED_AGENCY → CLOSED).
 * Annule remise caisse + ligne compta si un montant avait été validé ; inverse stats agence et compteur live.
 */
export async function returnCourierSessionToAgencyAccountant(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  actor: { id: string; name?: string | null };
}): Promise<void> {
  await authorizeActorInAgency({
    userId: params.actor.id,
    companyId: params.companyId,
    agencyId: params.agencyId,
    allowedRoles: ["chefAgence", "admin_compagnie", "admin_platforme"],
    deniedMessage: "Seul un chef d'agence peut renvoyer cette session au comptable.",
  });

  const sessionRef = courierSessionRef(db, params.companyId, params.agencyId, params.sessionId);
  const preSnap = await getDoc(sessionRef);
  if (!preSnap.exists()) throw new Error("Session courrier introuvable.");
  const pre = preSnap.data() as CourierSession;
  if (pre.status !== "VALIDATED_AGENCY") {
    throw new Error(
      "Seules les sessions validées par le comptable et en attente de votre accord peuvent être renvoyées au comptable."
    );
  }

  const ledgerSessionTotal = await getCourierSessionLedgerTotal(params.companyId, params.sessionId);
  const agencySnapForTz = await getDoc(doc(db, "companies", params.companyId, "agences", params.agencyId));
  const agencyData = agencySnapForTz.data() as { timezone?: string; currency?: string } | undefined;
  const agencyTz = dailyStatsTimezoneFromAgencyData(agencyData);
  const agencyCurrency = String(agencyData?.currency ?? "XOF");
  const statsDate = formatDateForDailyStats(pre.closedAt ?? pre.createdAt, agencyTz);
  const validatedAmount = Number(pre.validatedAmount ?? 0);

  await runTransaction(db, async (tx) => {
    const sSnap = await tx.get(sessionRef);
    if (!sSnap.exists()) throw new Error("Session courrier introuvable.");
    const s = sSnap.data() as CourierSession;
    if (s.status !== "VALIDATED_AGENCY") {
      throw new Error("Cette session n'est plus en attente d'approbation : actualisez la page.");
    }

    const comptaRef = courierComptaEncaissementDocRef(params.companyId, params.agencyId, params.sessionId);
    const comptaSnap = validatedAmount > 0 ? await tx.get(comptaRef) : null;

    if (validatedAmount > 0) {
      await reverseRemittancePendingToAgencyCashInTransaction(
        tx,
        params.companyId,
        params.agencyId,
        validatedAmount,
        agencyCurrency,
        { referenceType: "courier_session", referenceId: params.sessionId },
        `courier session ${params.sessionId} returned to agency accountant`
      );
      if (comptaSnap?.exists()) {
        tx.delete(comptaRef);
      }
    }

    revertDailyStatsOnCourierSessionAgencyValidation(
      tx,
      params.companyId,
      params.agencyId,
      statsDate,
      ledgerSessionTotal,
      agencyTz
    );
    updateAgencyLiveStateOnCourierSessionAgencyValidationReverted(tx, params.companyId, params.agencyId);

    tx.update(sessionRef, {
      status: "CLOSED",
      updatedAt: serverTimestamp(),
      validatedAt: deleteField(),
      validatedAmount: deleteField(),
      difference: deleteField(),
      remittanceStatus: deleteField(),
      remittanceDiscrepancyAmount: deleteField(),
      pendingCashLedgerVersion: deleteField(),
      validatedBy: deleteField(),
    });
  });

  const a = params.actor;
  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: a.id,
    agentName: a.name ?? null,
    role: "chefAgence",
    type: "COURIER_SESSION_RETURNED_TO_ACCOUNTANT",
    referenceId: params.sessionId,
    amount: validatedAmount,
    status: "REJETE",
    createdBy: a.id,
    metadata: {
      channel: "courrier",
      courierAgentId: pre.agentId,
      ledgerSessionTotal,
      previousValidatedAmount: validatedAmount,
    },
  });
}

export type CourierSessionWithId = CourierSession & { id: string };

/**
 * List validated courier sessions with non-zero discrepancy per agency (for CEO / financial monitoring).
 */
export async function listCourierSessionsWithDiscrepancy(
  companyId: string,
  agencyIds: string[]
): Promise<{ agencyId: string; session: CourierSessionWithId }[]> {
  const results: { agencyId: string; session: CourierSessionWithId }[] = [];
  await Promise.all(
    agencyIds.map(async (agencyId) => {
      const col = courierSessionsRef(db, companyId, agencyId);
      const snap = await getDocs(query(col, where("status", "==", "VALIDATED"), limit(200)));
      snap.docs.forEach((d) => {
        const row = d.data() as CourierSession;
        const diff = Number(row.difference ?? 0);
        if (diff !== 0) {
          results.push({ agencyId, session: { id: d.id, ...row } });
        }
      });
    })
  );
  return results;
}
