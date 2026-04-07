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

const OPEN_STATUSES: CourierSessionStatus[] = ["PENDING", "ACTIVE"];

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
