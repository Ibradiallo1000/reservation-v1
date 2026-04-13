/**
 * Service unifié des postes guichet (Phase 1 — Stabilisation).
 * Toute la logique de cycle de vie et de revenus est centralisée ici.
 * Collection unique : shiftReports (plus de shift_reports).
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  runTransaction,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import {
  SHIFT_STATUS,
  CASH_SESSION_STATUS,
  SHIFT_REPORTS_COLLECTION,
  VALIDATION_LEVEL,
  canCloseShift,
  isShiftLocked,
  mapCashToLegacy,
  mapLegacyToCash,
  type ShiftStatusValue,
} from '../constants/sessionLifecycle';
import { getDeviceFingerprint } from '@/utils/deviceFingerprint';
import {
  updateDailyStatsOnSessionClosed,
  updateDailyStatsOnSessionValidatedByAgency,
  updateDailyStatsOnSessionValidatedByCompany,
  timestampToDailyStatsDateKey,
  dailyStatsTimezoneFromAgencyData,
} from '../aggregates/dailyStats';
import { updateAgencyLiveStateOnSessionOpened, updateAgencyLiveStateOnSessionClosed, updateAgencyLiveStateOnSessionValidated } from '../aggregates/agencyLiveState';
import {
  applyRemittancePendingToAgencyCashInTransaction,
  isConfirmedTransactionStatus,
} from '@/modules/compagnie/treasury/financialTransactions';
import {
  PENDING_CASH_LEDGER_SYSTEM_VERSION,
  type PendingCashRemittanceStatus,
} from '@/modules/agence/comptabilite/pendingCashSafety';
import { writeComptaEncaissementInTransaction } from '@/modules/agence/comptabilite/comptaEncaissementsService';
import type { FinancialTransactionDoc } from '@/modules/compagnie/treasury/types';
import { fetchAgencyStaffProfile } from '@/modules/agence/services/agencyStaffProfileService';
import { logAgentHistoryEvent } from '@/modules/agence/services/agentHistoryService';
import {
  belongsToGuichetSession,
  fetchReservationDocsForShiftSlot,
} from '@/modules/agence/guichet/guichetSessionReservationModel';
import {
  getSessionRemittanceDocumentId,
  upsertAccountingRemittanceReceiptDocument,
  upsertSessionRemittanceDocument,
} from '@/modules/finance/documents/financialDocumentsService';

type SessionAccountantHistoryLog = {
  expectedCash: number;
  receivedCash: number;
  computedDiff: number;
  sellerUid: string;
  sellerName: string | null;
};

type SessionHeadValidationHistoryLog = {
  sellerUid: string;
  sellerName: string | null;
  totalRevenue: number;
};

const SHIFTS_COLLECTION = 'shifts';
const RESERVATIONS_COLLECTION = 'reservations';
const FINANCIAL_TRANSACTIONS_COLLECTION = 'financialTransactions';
const RESERVATION_LIMIT = 1000;

export type CashSession = {
  id: string;
  agentId: string;
  agencyId: string;
  openingAmount: number;
  expectedAmount: number;
  actualAmount?: number;
  status: typeof CASH_SESSION_STATUS[keyof typeof CASH_SESSION_STATUS];
  openedAt: number;
  closedAt?: number;
};

export type SessionAudit = {
  createdAt?: unknown;
  activatedAt?: Timestamp | null;
  closedAt?: Timestamp | null;
  validatedAt?: Timestamp | null;
  activatedBy?: { id: string; name?: string | null } | null;
  validatedBy?: { accountant?: { id: string; name?: string | null }; manager?: { id: string; name?: string | null } } | null;
};

export type CloseSessionTotals = {
  totalRevenue: number;
  totalReservations: number;
  totalCash: number;
  totalDigital: number;
  tickets: number;
  details: { trajet: string; billets: number; montant: number; heures: string[] }[];
};

type ReservationSessionRow = {
  id: string;
  depart?: string;
  arrivee?: string;
  seatsGo?: number;
  seatsReturn?: number;
  montant?: number;
  statut?: string;
};

type SessionReservationAmountRow = {
  montant?: number;
  statut?: string;
};

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  Object.keys(obj || {}).forEach((k) => {
    const v = (obj as Record<string, unknown>)[k];
    if (v === undefined) return;
    if (v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Timestamp)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  });
  return out as T;
}

function yyyymmdd(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

function toTimestampOrNull(value: Date | Timestamp | string | number | null | undefined): Timestamp | null {
  if (value == null) return null;
  if (value instanceof Timestamp) return value;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === 'number' && Number.isFinite(value)) return Timestamp.fromMillis(value);
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    if (!Number.isNaN(ms)) return Timestamp.fromMillis(ms);
  }
  return null;
}

/**
 * Vérifie s'il existe déjà un poste ouvert pour cet utilisateur (un seul autorisé).
 */
export async function getOpenShiftId(
  companyId: string,
  agencyId: string,
  userId: string
): Promise<string | null> {
  const shiftsRef = collection(db, `companies/${companyId}/agences/${agencyId}/${SHIFTS_COLLECTION}`);
  const q = query(
    shiftsRef,
    where('userId', '==', userId),
    where('status', 'in', [SHIFT_STATUS.PENDING, SHIFT_STATUS.ACTIVE, SHIFT_STATUS.PAUSED]),
    orderBy('createdAt', 'desc'),
    limit(1)
  );
  const snap = await getDocs(q);
  return snap.empty ? null : snap.docs[0].id;
}

/**
 * Crée un poste PENDING. Ne fait rien si un poste ouvert existe déjà.
 */
export async function createSession(params: {
  companyId: string;
  agencyId: string;
  userId: string;
  userName?: string | null;
  userCode?: string | null;
}): Promise<string> {
  const existing = await getOpenShiftId(params.companyId, params.agencyId, params.userId);
  if (existing) return existing;

  const shiftsRef = collection(db, `companies/${params.companyId}/agences/${params.agencyId}/${SHIFTS_COLLECTION}`);
  const initialLegacyStatus = SHIFT_STATUS.PENDING;
  const ref = await addDoc(shiftsRef, stripUndefined({
    companyId: params.companyId,
    agencyId: params.agencyId,
    userId: params.userId,
    userName: params.userName ?? null,
    userCode: params.userCode ?? 'GUEST',
    status: initialLegacyStatus,
    startAt: null,
    endAt: null,
    startTime: null,
    endTime: null,
    dayKey: yyyymmdd(),
    tickets: 0,
    amount: 0,
    totalRevenue: 0,
    totalReservations: 0,
    totalCash: 0,
    totalDigital: 0,
    accountantValidated: false,
    managerValidated: false,
    accountantValidatedAt: null,
    managerValidatedAt: null,
    openingAmount: 0,
    expectedAmount: 0,
    actualAmount: null,
    ecart: 0,
    hasDiscrepancy: false,
    discrepancyFlagged: false,
    discrepancyFlaggedAt: null,
    cashStatus: mapLegacyToCash(initialLegacyStatus),
    openedAt: Date.now(),
    closedAtMs: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

/**
 * Active un poste (comptabilité). Pose activatedAt, activatedBy, startAt/startTime.
 */
export async function activateSession(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  activatedBy: { id: string; name?: string | null };
}): Promise<void> {
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${params.shiftId}`);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${params.shiftId}`);

  const preSnap = await getDoc(shiftRef);
  if (!preSnap.exists()) throw new Error('Poste introuvable.');
  const pre = preSnap.data() as Record<string, unknown>;
  const sellerUid = String(pre.userId ?? '');
  let resolvedUserCode = String(pre.userCode ?? '').trim();
  let resolvedUserName = (pre.userName ?? null) as string | null;
  if (sellerUid && (!resolvedUserCode || resolvedUserCode === 'GUEST')) {
    const profile = await fetchAgencyStaffProfile(params.companyId, params.agencyId, sellerUid);
    if (profile.code) resolvedUserCode = profile.code;
    if (profile.name && (!resolvedUserName || !String(resolvedUserName).trim())) {
      resolvedUserName = profile.name;
    }
  }

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(shiftRef);
    if (!snap.exists()) throw new Error('Poste introuvable.');
    const cur = snap.data() as Record<string, unknown>;
    if ((cur.status as string) !== SHIFT_STATUS.PENDING) {
      throw new Error('Seul un poste en attente peut être activé.');
    }
    const now = Timestamp.now();
    const nextLegacyStatus = SHIFT_STATUS.ACTIVE;
    const userCodeToStore = resolvedUserCode || String(cur.userCode ?? '').trim() || 'GUEST';
    const userNameToStore = resolvedUserName ?? (cur.userName ?? null);
    tx.update(shiftRef, stripUndefined({
      status: nextLegacyStatus,
      startAt: now,
      startTime: now,
      activatedAt: now,
      activatedBy: { id: params.activatedBy.id, name: params.activatedBy.name ?? null },
      userCode: userCodeToStore,
      userName: userNameToStore,
      cashStatus: mapLegacyToCash(nextLegacyStatus),
      ...(cur.openedAt == null ? { openedAt: Date.now() } : {}),
      updatedAt: serverTimestamp(),
    }));
    tx.set(reportRef, stripUndefined({
      shiftId: params.shiftId,
      companyId: params.companyId,
      agencyId: params.agencyId,
      userId: cur.userId,
      userName: userNameToStore,
      userCode: userCodeToStore,
      startAt: now,
      activatedAt: now,
      activatedBy: { id: params.activatedBy.id, name: params.activatedBy.name ?? null },
      status: 'pending_validation',
      updatedAt: serverTimestamp(),
    }), { merge: true });

    updateAgencyLiveStateOnSessionOpened(tx, params.companyId, params.agencyId);
  });

  const sellerId = String(pre.userId ?? "");
  const sellerDisplay = resolvedUserName ?? ((pre.userName ?? null) as string | null);
  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: sellerId,
    agentName: sellerDisplay,
    role: "guichetier",
    type: "SESSION_OPENED",
    referenceId: params.shiftId,
    status: "EN_COURS",
    createdBy: params.activatedBy.id,
    metadata: {
      activatedByName: params.activatedBy.name ?? undefined,
    },
  });
}

/**
 * Revendique le poste pour cet appareil (device lock). À appeler côté guichetier quand le poste devient ACTIVE.
 */
export async function claimSession(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
}): Promise<{ claimed: boolean; error?: string }> {
  const fingerprint = getDeviceFingerprint();
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${params.shiftId}`);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(shiftRef);
      if (!snap.exists()) throw new Error('Poste introuvable.');
      const data = snap.data() as Record<string, unknown>;
      const status = data.status as string;
      if (status !== SHIFT_STATUS.ACTIVE && status !== SHIFT_STATUS.PAUSED) {
        throw new Error('Poste non actif.');
      }
      const existing = data.deviceFingerprint as string | undefined;
      if (existing && existing !== fingerprint) {
        throw new Error('SESSION_LOCKED_OTHER_DEVICE');
      }
      if (!existing) {
        tx.update(shiftRef, stripUndefined({
          deviceFingerprint: fingerprint,
          deviceClaimedAt: serverTimestamp(),
          sessionOwnerUid: data.userId,
          updatedAt: serverTimestamp(),
        }));
      }
    });
    return { claimed: true };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg === 'SESSION_LOCKED_OTHER_DEVICE') return { claimed: false, error: msg };
    throw e;
  }
}

/**
 * Vérifie que l'appareil courant est bien celui qui a revendiqué le poste.
 */
export function isCurrentDeviceClaimed(shiftDoc: { deviceFingerprint?: string | null }): boolean {
  if (!shiftDoc.deviceFingerprint) return true; // pas encore de lock
  return shiftDoc.deviceFingerprint === getDeviceFingerprint();
}

function isSoldReservationStatus(statut: unknown): boolean {
  const s = String(statut ?? '').toLowerCase().trim();
  return s === 'paye' || s === 'payé' || s === 'confirme' || s === 'confirmé';
}

async function computeLedgerSessionTotalsFromReservations(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  shiftAgentId: string;
}): Promise<CloseSessionTotals> {
  const mergedDocs = await fetchReservationDocsForShiftSlot(
    params.companyId,
    params.agencyId,
    params.shiftId,
    { perQueryLimit: 500 }
  );
  const mergedById = new Map<string, { id: string } & Omit<ReservationSessionRow, 'id'>>();
  for (const d of mergedDocs) {
    const row = { id: d.id, ...(d.data() as Omit<ReservationSessionRow, 'id'>) };
    if (!belongsToGuichetSession(row as Record<string, unknown>, params.shiftId, params.shiftAgentId))
      continue;
    mergedById.set(d.id, row);
  }
  const reservations = [...mergedById.values()].filter((r) => {
    const s = String(r.statut ?? '').toLowerCase().trim();
    if (s === 'invalide' || s === 'annule' || s === 'annulation_en_attente') return false;
    return isSoldReservationStatus(r.statut);
  });

  const byRoute: Record<string, { billets: number; montant: number }> = {};
  let tickets = 0;
  for (const r of reservations) {
    const seats = Number(r.seatsGo ?? 0) + Number(r.seatsReturn ?? 0);
    tickets += seats;
    const key = [r.depart, r.arrivee].filter(Boolean).join('→') || 'Sans trajet';
    if (!byRoute[key]) byRoute[key] = { billets: 0, montant: 0 };
    byRoute[key].billets += seats;
  }

  let totalRevenue = 0;
  let totalCash = 0;
  let totalDigital = 0;
  for (const r of reservations) {
    const txSnap = await getDocs(
      query(
        collection(db, `companies/${params.companyId}/${FINANCIAL_TRANSACTIONS_COLLECTION}`),
        where('type', '==', 'payment_received'),
        where('reservationId', '==', r.id),
        limit(25)
      )
    );
    let reservationLedger = 0;
    for (const d of txSnap.docs) {
      const row = d.data() as FinancialTransactionDoc;
      if (!isConfirmedTransactionStatus(row.status)) continue;
      const amt = Number(row.amount ?? 0);
      if (amt <= 0) continue;
      totalRevenue += amt;
      reservationLedger += amt;
      const pm = String(row.paymentMethod ?? '').toLowerCase();
      if (pm === 'cash') totalCash += amt;
      else totalDigital += amt;
    }
    const key = [r.depart, r.arrivee].filter(Boolean).join('→') || 'Sans trajet';
    if (byRoute[key]) byRoute[key].montant += reservationLedger;
  }

  const details = Object.entries(byRoute).map(([trajet, v]) => ({
    trajet,
    billets: v.billets,
    montant: v.montant,
    heures: [] as string[],
  }));

  return {
    totalRevenue,
    totalReservations: reservations.length,
    totalCash,
    totalDigital,
    tickets,
    details,
  };
}

async function getReservationsBySession(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  agentId: string;
}): Promise<Array<SessionReservationAmountRow & { id: string }>> {
  const mergedDocs = await fetchReservationDocsForShiftSlot(
    params.companyId,
    params.agencyId,
    params.sessionId,
    { perQueryLimit: RESERVATION_LIMIT }
  );
  const byId = new Map<string, SessionReservationAmountRow & { id: string }>();
  for (const d of mergedDocs) {
    const row = { id: d.id, ...(d.data() as SessionReservationAmountRow) };
    if (!belongsToGuichetSession(row as Record<string, unknown>, params.sessionId, params.agentId))
      continue;
    byId.set(d.id, row);
  }
  return [...byId.values()];
}

export async function calculateSessionTotals(params: {
  companyId: string;
  agencyId: string;
  sessionId: string;
  agentId: string;
}): Promise<number> {
  const reservations = await getReservationsBySession(params);
  const validReservations = reservations.filter((r) => {
    const statut = String(r.statut ?? '').toLowerCase();
    return statut !== 'annule' && statut !== 'annulation_en_attente' && statut !== 'invalide';
  });
  return validReservations.reduce((sum, r) => sum + Number(r.montant ?? 0), 0);
}

/**
 * Calcule les totaux session depuis le ledger financialTransactions (source de vérité).
 * 1 vente = 1 encaissement → totaux session = somme(payment_received par reservationId de la session).
 */
export async function closeSession(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  userId: string;
  deviceFingerprint?: string | null;
  actualAmount?: number;
  /**
   * Réservé supervision chef d’agence : clôturer un poste ouvert sur l’appareil d’un agent
   * (sinon l’empreinte ne correspond pas au poste du chef).
   */
  skipDeviceFingerprintCheck?: boolean;
}): Promise<CloseSessionTotals> {
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftsRef = collection(db, `${base}/${SHIFTS_COLLECTION}`);
  const shiftRef = doc(shiftsRef, params.shiftId);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${params.shiftId}`);
  const shiftPreSnap = await getDoc(shiftRef);
  if (!shiftPreSnap.exists()) throw new Error('Poste introuvable.');
  const shiftAgentId = String((shiftPreSnap.data() as { userId?: string }).userId ?? '');
  if (!shiftAgentId) {
    throw new Error('Poste sans vendeur associé : impossible de calculer les totaux guichet.');
  }
  const ledgerTotals = await computeLedgerSessionTotalsFromReservations({
    companyId: params.companyId,
    agencyId: params.agencyId,
    shiftId: params.shiftId,
    shiftAgentId,
  });
  const expectedAmount = await calculateSessionTotals({
    companyId: params.companyId,
    agencyId: params.agencyId,
    sessionId: params.shiftId,
    agentId: shiftAgentId,
  });
  const actualAmount = Number(params.actualAmount ?? expectedAmount);
  const ecart = actualAmount - expectedAmount;
  const hasDiscrepancy = Math.abs(ecart) > 0;
  let resultTotals: CloseSessionTotals = ledgerTotals;

  const agencyRef = doc(db, `companies/${params.companyId}/agences/${params.agencyId}`);
  let shiftAgentName: string | null = null;

  await runTransaction(db, async (tx) => {
    const [shiftSnap, agencySnap] = await Promise.all([tx.get(shiftRef), tx.get(agencyRef)]);
    if (!shiftSnap.exists()) throw new Error('Poste introuvable.');
    const shiftData = shiftSnap.data() as Record<string, unknown>;
    shiftAgentName = (shiftData.userName ?? null) as string | null;
    const agencyTz = dailyStatsTimezoneFromAgencyData(agencySnap.data() as { timezone?: string } | undefined);
    const status = shiftData.status as string;
    if (!canCloseShift(status)) throw new Error('État non clôturable.');
    if (isShiftLocked(status)) throw new Error('Poste déjà validé (verrouillé).');
    if (
      !params.skipDeviceFingerprintCheck &&
      shiftData.deviceFingerprint &&
      shiftData.deviceFingerprint !== params.deviceFingerprint
    ) {
      throw new Error('Session ouverte sur un autre appareil.');
    }

    const now = Timestamp.now();
    const startAt = (shiftData.startAt ?? shiftData.startTime ?? now) as Timestamp;

    tx.set(reportRef, stripUndefined({
      shiftId: params.shiftId,
      companyId: params.companyId,
      agencyId: params.agencyId,
      userId: shiftData.userId,
      userName: shiftData.userName ?? null,
      userCode: shiftData.userCode ?? null,
      startAt,
      endAt: now,
      closedAt: now,
      billets: ledgerTotals.tickets,
      montant: ledgerTotals.totalRevenue,
      totalRevenue: ledgerTotals.totalRevenue,
      totalReservations: ledgerTotals.totalReservations,
      totalCash: ledgerTotals.totalCash,
      totalDigital: ledgerTotals.totalDigital,
      expectedAmount,
      actualAmount,
      ecart,
      hasDiscrepancy,
      discrepancyFlagged: hasDiscrepancy,
      discrepancyFlaggedAt: hasDiscrepancy ? serverTimestamp() : null,
      details: ledgerTotals.details,
      accountantValidated: false,
      managerValidated: false,
      accountantValidatedAt: null,
      managerValidatedAt: null,
      status: 'pending_validation',
      createdAt: shiftData.createdAt,
      updatedAt: serverTimestamp(),
    }), { merge: true });

    const nextLegacyStatus = SHIFT_STATUS.CLOSED;
    tx.update(shiftRef, stripUndefined({
      status: nextLegacyStatus,
      endAt: now,
      endTime: now,
      closedAt: now,
      tickets: ledgerTotals.tickets,
      amount: ledgerTotals.totalRevenue,
      totalRevenue: ledgerTotals.totalRevenue,
      totalReservations: ledgerTotals.totalReservations,
      totalCash: ledgerTotals.totalCash,
      totalDigital: ledgerTotals.totalDigital,
      expectedAmount,
      actualAmount,
      ecart,
      hasDiscrepancy,
      discrepancyFlagged: hasDiscrepancy,
      discrepancyFlaggedAt: hasDiscrepancy ? serverTimestamp() : null,
      cashStatus: mapLegacyToCash(nextLegacyStatus),
      closedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    }));

    const statsDate = timestampToDailyStatsDateKey(now, agencyTz);
    updateDailyStatsOnSessionClosed(tx, params.companyId, params.agencyId, statsDate, agencyTz);
    updateAgencyLiveStateOnSessionClosed(tx, params.companyId, params.agencyId);

    resultTotals = {
      totalRevenue: ledgerTotals.totalRevenue,
      totalReservations: ledgerTotals.totalReservations,
      totalCash: ledgerTotals.totalCash,
      totalDigital: ledgerTotals.totalDigital,
      tickets: ledgerTotals.tickets,
      details: ledgerTotals.details,
    };
  });

  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: shiftAgentId || params.userId,
    agentName: shiftAgentName,
    role: "guichetier",
    type: "SESSION_CLOSED",
    referenceId: params.shiftId,
    status: "EN_ATTENTE",
    createdBy: params.userId,
    metadata: {
      expectedAmount,
      declaredAmount: actualAmount,
      difference: ecart,
    },
  });

  return resultTotals;
}

/**
 * Validation niveau agence : CLOSED → VALIDATED_AGENCY. Pas de mouvement trésorerie (chef comptable le fait).
 */
export type ValidationAudit = {
  validatedBy: { id: string; name?: string | null };
  validatedAt: Timestamp;
  receivedCashAmount: number;
  computedDifference: number; // recu - attendu (negatif = manquant)
  accountantDeviceFingerprint: string;
  captureMode?: 'normal' | 'after_entry';
  manualDocumentUsed?: boolean;
  manualDocumentType?: string | null;
  manualDocumentNumber?: string | null;
  manualReceiptNumber?: string | null;
  effectiveOperationDate?: Timestamp | null;
  regularizedByUid?: string | null;
  regularizedByName?: string | null;
  regularizedAt?: Timestamp | null;
};

export async function validateSessionByAccountant(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  receivedCashAmount: number;
  validatedBy: { id: string; name?: string | null };
  accountantDeviceFingerprint: string;
  captureMode?: 'normal' | 'after_entry';
  manualDocumentUsed?: boolean;
  manualDocumentType?: string | null;
  manualDocumentNumber?: string | null;
  manualReceiptNumber?: string | null;
  effectiveOperationDate?: Date | Timestamp | string | number | null;
  regularizedByUid?: string | null;
  regularizedByName?: string | null;
  regularizedAt?: Date | Timestamp | string | number | null;
}): Promise<{ computedDifference: number }> {
  await authorizeActorInAgency({
    userId: params.validatedBy.id,
    companyId: params.companyId,
    agencyId: params.agencyId,
    allowedRoles: ['agency_accountant', 'company_accountant', 'admin_compagnie', 'admin_platforme'],
    deniedMessage: 'Validation non autorisee pour cet utilisateur.',
  });
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${params.shiftId}`);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${params.shiftId}`);
  const agencyRef = doc(db, `companies/${params.companyId}/agences/${params.agencyId}`);
  const captureMode = params.captureMode === 'after_entry' ? 'after_entry' : 'normal';
  const manualDocumentUsed = Boolean(params.manualDocumentUsed);
  const manualDocumentType = String(params.manualDocumentType ?? '').trim() || null;
  const manualDocumentNumber = String(params.manualDocumentNumber ?? '').trim() || null;
  const manualReceiptNumber = String(params.manualReceiptNumber ?? '').trim() || null;
  const effectiveOperationDate = toTimestampOrNull(params.effectiveOperationDate ?? null);
  const regularizedByUid = String(params.regularizedByUid ?? '').trim() || null;
  const regularizedByName = String(params.regularizedByName ?? '').trim() || null;
  const regularizedAt =
    toTimestampOrNull(params.regularizedAt ?? null) ??
    (captureMode === 'after_entry' ? Timestamp.now() : null);

  type AccountantTxOutcome = {
    computedDifference: number;
    accountantSessionLog: SessionAccountantHistoryLog | null;
  };

  const { computedDifference, accountantSessionLog } = await runTransaction(db, async (tx): Promise<AccountantTxOutcome> => {
    const [sSnap, rSnap, agencySnap] = await Promise.all([tx.get(shiftRef), tx.get(reportRef), tx.get(agencyRef)]);
    if (!sSnap.exists()) throw new Error('Poste introuvable.');
    if (!rSnap.exists()) throw new Error('Rapport introuvable.');
    const s = sSnap.data() as Record<string, unknown>;
    if ((s.status as string) === SHIFT_STATUS.VALIDATED) {
      return { computedDifference: 0, accountantSessionLog: null };
    }
    if ((s.status as string) === SHIFT_STATUS.VALIDATED_AGENCY) {
      return { computedDifference: 0, accountantSessionLog: null };
    }
    if ((s.status as string) !== SHIFT_STATUS.CLOSED) throw new Error('Seuls les postes clôturés peuvent être validés.');
    if (!canProceedValidationWithDiscrepancy(Number(s.ecart ?? 0), false, Boolean(s.discrepancyOverrideConfirmed))) {
      throw new Error('Session has discrepancy. Validation not allowed.');
    }

    const r = rSnap.data() as Record<string, unknown>;
    const expectedCash = Math.max(
      Number(s.totalCash ?? s.amount ?? 0),
      Number(r.totalCash ?? r.expectedAmount ?? r.montant ?? 0)
    );
    if (expectedCash > 0 && params.receivedCashAmount <= 0) {
      throw new Error(
        `Montant reçu obligatoire : indiquez les espèces physiquement remises (attendu ${expectedCash.toFixed(0)} selon le poste / rapport). ` +
          "Un montant à 0 n’est pas accepté lorsque des espèces sont attendues — vérifiez la saisie dans l’onglet Versements."
      );
    }
    const computedDifference = params.receivedCashAmount - expectedCash;
    const isPartialRemittance = params.receivedCashAmount + 0.01 < expectedCash;
    const remittanceStatus: PendingCashRemittanceStatus = isPartialRemittance
      ? 'partial_remittance'
      : 'full_remittance';
    const remittanceDiscrepancyAmount = isPartialRemittance
      ? Math.max(0, expectedCash - params.receivedCashAmount)
      : 0;
    const now = Timestamp.now();

    const validationAudit: ValidationAudit = {
      validatedBy: params.validatedBy,
      validatedAt: now,
      receivedCashAmount: params.receivedCashAmount,
      computedDifference,
      accountantDeviceFingerprint: params.accountantDeviceFingerprint,
      captureMode,
      manualDocumentUsed,
      manualDocumentType,
      manualDocumentNumber,
      manualReceiptNumber,
      effectiveOperationDate,
      regularizedByUid,
      regularizedByName,
      regularizedAt,
    };

    /**
     * Ledger remise : avant tout update shift/rapport — Firestore exige tous les get avant tous les set/update.
     * (applyRemittancePendingToAgencyCashInTransaction fait des lectures sur idempotency + comptes + miroir.)
     */
    const agencyCurrency = String((agencySnap.data() as { currency?: string })?.currency ?? 'XOF');
    await applyRemittancePendingToAgencyCashInTransaction(
      tx,
      params.companyId,
      params.agencyId,
      params.receivedCashAmount,
      agencyCurrency,
      { referenceType: "shift", referenceId: params.shiftId },
      `shift ${params.shiftId} validated by agency accountant`
    );

    const nextLegacyStatus = SHIFT_STATUS.VALIDATED_AGENCY;
    tx.update(shiftRef, stripUndefined({
      status: nextLegacyStatus,
      validatedAt: now,
      validationAudit,
      accountantValidated: true,
      accountantValidatedAt: now,
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
      cashStatus: mapLegacyToCash(nextLegacyStatus),
      discrepancyOverrideConfirmed: Math.abs(Number(s.ecart ?? 0)) > 0 ? true : Boolean(s.discrepancyOverrideConfirmed),
      discrepancyOverrideBy: Math.abs(Number(s.ecart ?? 0)) > 0 ? params.validatedBy : (s.discrepancyOverrideBy ?? null),
      discrepancyOverrideAt: Math.abs(Number(s.ecart ?? 0)) > 0 ? now : (s.discrepancyOverrideAt ?? null),
      updatedAt: serverTimestamp(),
    }));
    tx.update(reportRef, stripUndefined({
      status: 'validated_agency',
      validationLevel: VALIDATION_LEVEL.AGENCY,
      validatedByAgencyAt: now,
      validatedAt: now,
      validationAudit,
      accountantValidated: true,
      accountantValidatedAt: now,
      captureMode,
      manualDocumentUsed,
      manualDocumentType,
      manualDocumentNumber,
      manualReceiptNumber,
      effectiveOperationDate,
      regularizedByUid,
      regularizedByName,
      regularizedAt,
      updatedAt: serverTimestamp(),
    }));

    // Enregistrer la remise de caisse comme entrée dans le journal de caisse d'agence
    if (params.receivedCashAmount > 0) {
      const cashReceiptsRef = collection(db, base, 'cashReceipts');
      const newReceiptRef = doc(cashReceiptsRef);
      tx.set(newReceiptRef, {
        cashReceived: params.receivedCashAmount,
        shiftId: params.shiftId,
        createdAt: serverTimestamp(),
        validatedBy: params.validatedBy,
      });
      writeComptaEncaissementInTransaction(tx, params.companyId, params.agencyId, {
        sessionId: params.shiftId,
        montant: params.receivedCashAmount,
        source: 'guichet',
      });
    }

    const totalRevenue = Number(s.totalRevenue ?? s.amount ?? 0);
    const closedAt = (s.closedAt ?? s.endAt ?? now) as Timestamp;
    const agencyTz = dailyStatsTimezoneFromAgencyData(agencySnap.data() as { timezone?: string } | undefined);
    const statsDate = timestampToDailyStatsDateKey(closedAt, agencyTz);
    updateDailyStatsOnSessionValidatedByAgency(tx, params.companyId, params.agencyId, statsDate, totalRevenue);
    updateAgencyLiveStateOnSessionValidated(tx, params.companyId, params.agencyId);
    // Pas de mouvement trésorerie ici : réservé à la validation finale chef d'agence (validateSessionByHeadAccountant).

    return {
      computedDifference,
      accountantSessionLog: {
        expectedCash,
        receivedCash: params.receivedCashAmount,
        computedDiff: computedDifference,
        sellerUid: String(s.userId ?? ''),
        sellerName: (s.userName ?? null) as string | null,
      },
    };
  });

  if (accountantSessionLog) {
    const v = params.validatedBy;
    const metaBase = {
      expectedAmount: accountantSessionLog.expectedCash,
      declaredAmount: accountantSessionLog.receivedCash,
      difference: accountantSessionLog.computedDiff,
      shiftAgentId: accountantSessionLog.sellerUid,
      shiftAgentName: accountantSessionLog.sellerName ?? undefined,
    };
    logAgentHistoryEvent({
      companyId: params.companyId,
      agencyId: params.agencyId,
      agentId: v.id,
      agentName: v.name ?? null,
      role: 'agency_accountant',
      type: 'REMISSION_DONE',
      referenceId: params.shiftId,
      amount: params.receivedCashAmount,
      status: 'VALIDE',
      createdBy: v.id,
      metadata: metaBase,
    });
    logAgentHistoryEvent({
      companyId: params.companyId,
      agencyId: params.agencyId,
      agentId: v.id,
      agentName: v.name ?? null,
      role: 'agency_accountant',
      type: 'SESSION_VALIDATED',
      referenceId: params.shiftId,
      status: 'VALIDE',
      createdBy: v.id,
      metadata: { ...metaBase, validationLevel: 'agency_accountant' },
    });

    const modeObservation = [
      captureMode === 'after_entry' ? 'Saisie apres coup regularisee.' : null,
      manualDocumentUsed
        ? `Piece manuelle utilisee (${manualDocumentType ?? 'piece_manuelle'}${
            manualDocumentNumber ? ` #${manualDocumentNumber}` : ''
          }).`
        : null,
      manualReceiptNumber ? `Recu manuel: ${manualReceiptNumber}.` : null,
    ]
      .filter(Boolean)
      .join(' ');

    try {
      const shiftSnap = await getDoc(shiftRef);
      const shiftData = shiftSnap.exists() ? (shiftSnap.data() as Record<string, unknown>) : {};
      await upsertSessionRemittanceDocument({
        companyId: params.companyId,
        agencyId: params.agencyId,
        sessionId: params.shiftId,
        sessionType: 'guichet',
        sourceType: 'shift_session',
        periodStart: shiftData.startAt ?? shiftData.startTime ?? null,
        periodEnd: shiftData.endAt ?? shiftData.endTime ?? shiftData.closedAt ?? null,
        agent: {
          uid: accountantSessionLog.sellerUid,
          name: accountantSessionLog.sellerName,
          role: 'guichetier',
        },
        receiver: {
          uid: params.validatedBy.id,
          name: params.validatedBy.name ?? null,
          role: 'agency_accountant',
        },
        controller: null,
        amountTheoretical: accountantSessionLog.expectedCash,
        amountRemitted: accountantSessionLog.receivedCash,
        amountDifference: accountantSessionLog.computedDiff,
        currency: String(shiftData.currency ?? 'XOF'),
        ventilationByMode: {
          cash: Number(shiftData.totalCash ?? 0),
          digital: Number(shiftData.totalDigital ?? 0),
        },
        observations:
          [
            Math.abs(accountantSessionLog.computedDiff) > 0
              ? 'Ecart detecte entre montant theorique et montant remis.'
              : null,
            modeObservation || null,
          ]
            .filter(Boolean)
            .join(' ') || null,
        status: 'ready_to_print',
        createdByUid: params.validatedBy.id,
      });
      await upsertAccountingRemittanceReceiptDocument({
        companyId: params.companyId,
        agencyId: params.agencyId,
        sessionId: params.shiftId,
        sourceType: 'shift_session',
        agent: {
          uid: accountantSessionLog.sellerUid,
          name: accountantSessionLog.sellerName,
          role: 'guichetier',
        },
        accountant: {
          uid: params.validatedBy.id,
          name: params.validatedBy.name ?? null,
          role: 'agency_accountant',
        },
        amountRemitted: accountantSessionLog.receivedCash,
        amountDifference: accountantSessionLog.computedDiff,
        currency: String(shiftData.currency ?? 'XOF'),
        referenceSessionRemittanceId: getSessionRemittanceDocumentId(
          'shift_session',
          params.shiftId
        ),
        dateHeure: Timestamp.now(),
        observations:
          [
            Math.abs(accountantSessionLog.computedDiff) > 0
              ? 'Recu emis avec ecart; visa chef agence requis.'
              : 'Recu comptable emis.',
            modeObservation || null,
          ]
            .filter(Boolean)
            .join(' '),
        status: 'ready_to_print',
        createdByUid: params.validatedBy.id,
      });
    } catch (docError) {
      console.error('[sessionService] echec generation fiche remise session', {
        companyId: params.companyId,
        agencyId: params.agencyId,
        shiftId: params.shiftId,
        docError,
      });
    }
  }

  return { computedDifference };
}

/**
 * Validation finale chef d'agence : VALIDATED_AGENCY → VALIDATED.
 * Enregistre validatedByCompanyAt, met à jour dailyStats (ticketRevenueCompany).
 * Pas de second mouvement caisse ici : la caisse physique a été créditée à la validation comptable agence (remise).
 */
export async function validateSessionByHeadAccountant(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  validatedBy: { id: string; name?: string | null };
}): Promise<void> {
  await authorizeActorInAgency({
    userId: params.validatedBy.id,
    companyId: params.companyId,
    agencyId: params.agencyId,
    allowedRoles: ['chefAgence', 'admin_compagnie', 'admin_platforme'],
    deniedMessage: 'Validation non autorisee pour cet utilisateur.',
  });
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${params.shiftId}`);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${params.shiftId}`);
  const agencyRef = doc(db, `companies/${params.companyId}/agences/${params.agencyId}`);

  const headValidationLog = await runTransaction(db, async (tx): Promise<SessionHeadValidationHistoryLog | null> => {
    const [sSnap, rSnap, agencySnap] = await Promise.all([tx.get(shiftRef), tx.get(reportRef), tx.get(agencyRef)]);
    if (!sSnap.exists()) throw new Error('Poste introuvable.');
    if (!rSnap.exists()) throw new Error('Rapport introuvable.');
    const s = sSnap.data() as Record<string, unknown>;
    if ((s.status as string) === SHIFT_STATUS.VALIDATED) {
      return null;
    }
    if ((s.status as string) !== SHIFT_STATUS.VALIDATED_AGENCY) {
      throw new Error("Seuls les postes validés par le comptable agence peuvent être validés par le chef d'agence.");
    }
    if (!canProceedValidationWithDiscrepancy(Number(s.ecart ?? 0), false, Boolean(s.discrepancyOverrideConfirmed))) {
      throw new Error('Session has discrepancy. Validation not allowed.');
    }

    const now = Timestamp.now();
    const totalRevenue = Number(s.totalRevenue ?? s.amount ?? 0);

    const nextLegacyStatus = SHIFT_STATUS.VALIDATED;
    tx.update(shiftRef, stripUndefined({
      status: nextLegacyStatus,
      validatedAt: now,
      cashStatus: mapLegacyToCash(nextLegacyStatus),
      managerValidated: true,
      managerValidatedAt: now,
      updatedAt: serverTimestamp(),
    }));
    tx.update(reportRef, stripUndefined({
      status: 'validated',
      validationLevel: VALIDATION_LEVEL.COMPANY,
      validatedByCompanyAt: now,
      managerValidated: true,
      managerValidatedAt: now,
      updatedAt: serverTimestamp(),
    }));

    const closedAt = (s.closedAt ?? s.endAt ?? now) as Timestamp;
    const agencyTz = dailyStatsTimezoneFromAgencyData(agencySnap.data() as { timezone?: string } | undefined);
    const statsDate = timestampToDailyStatsDateKey(closedAt, agencyTz);
    updateDailyStatsOnSessionValidatedByCompany(tx, params.companyId, params.agencyId, statsDate, totalRevenue, agencyTz);

    return {
      sellerUid: String(s.userId ?? ''),
      sellerName: (s.userName ?? null) as string | null,
      totalRevenue,
    };
  });

  await setValidatedAtOnShiftReservations({
    companyId: params.companyId,
    agencyId: params.agencyId,
    shiftId: params.shiftId,
    validatedAt: Timestamp.now(),
  });

  if (headValidationLog) {
    const v = params.validatedBy;
    logAgentHistoryEvent({
      companyId: params.companyId,
      agencyId: params.agencyId,
      agentId: v.id,
      agentName: v.name ?? null,
      role: 'chefAgence',
      type: 'SESSION_VALIDATED',
      referenceId: params.shiftId,
      amount: headValidationLog.totalRevenue,
      status: 'VALIDE',
      createdBy: v.id,
      metadata: {
        validationLevel: 'chef_agence',
        shiftAgentId: headValidationLog.sellerUid,
        shiftAgentName: headValidationLog.sellerName ?? undefined,
      },
    });

    try {
      const shiftSnap = await getDoc(shiftRef);
      const shiftData = shiftSnap.exists() ? (shiftSnap.data() as Record<string, unknown>) : {};
      const audit = (shiftData.validationAudit ?? null) as
        | { receivedCashAmount?: number }
        | null;
      const expectedCash = Number(shiftData.totalCash ?? 0);
      const receivedCash = Number(audit?.receivedCashAmount ?? expectedCash);
      await upsertSessionRemittanceDocument({
        companyId: params.companyId,
        agencyId: params.agencyId,
        sessionId: params.shiftId,
        sessionType: 'guichet',
        sourceType: 'shift_session',
        periodStart: shiftData.startAt ?? shiftData.startTime ?? null,
        periodEnd: shiftData.endAt ?? shiftData.endTime ?? shiftData.closedAt ?? null,
        agent: {
          uid: headValidationLog.sellerUid,
          name: headValidationLog.sellerName ?? null,
          role: 'guichetier',
        },
        receiver: {
          uid: (shiftData.validationAudit as { validatedBy?: { id?: string; name?: string } } | undefined)?.validatedBy?.id ?? null,
          name:
            (shiftData.validationAudit as { validatedBy?: { name?: string } } | undefined)?.validatedBy?.name ??
            null,
          role: 'agency_accountant',
        },
        controller: {
          uid: params.validatedBy.id,
          name: params.validatedBy.name ?? null,
          role: 'chefAgence',
        },
        amountTheoretical: expectedCash,
        amountRemitted: receivedCash,
        amountDifference: receivedCash - expectedCash,
        currency: String(shiftData.currency ?? 'XOF'),
        ventilationByMode: {
          cash: Number(shiftData.totalCash ?? 0),
          digital: Number(shiftData.totalDigital ?? 0),
        },
        status: 'ready_to_print',
        observations:
          "Validation finale chef d'agence effectuee.",
        createdByUid: params.validatedBy.id,
      });
      await upsertAccountingRemittanceReceiptDocument({
        companyId: params.companyId,
        agencyId: params.agencyId,
        sessionId: params.shiftId,
        sourceType: 'shift_session',
        agent: {
          uid: headValidationLog.sellerUid,
          name: headValidationLog.sellerName ?? null,
          role: 'guichetier',
        },
        accountant: {
          uid:
            (shiftData.validationAudit as { validatedBy?: { id?: string; name?: string } } | undefined)
              ?.validatedBy?.id ?? null,
          name:
            (shiftData.validationAudit as { validatedBy?: { name?: string } } | undefined)?.validatedBy
              ?.name ?? null,
          role: 'agency_accountant',
        },
        amountRemitted: receivedCash,
        amountDifference: receivedCash - expectedCash,
        currency: String(shiftData.currency ?? 'XOF'),
        referenceSessionRemittanceId: getSessionRemittanceDocumentId(
          'shift_session',
          params.shiftId
        ),
        dateHeure: Timestamp.now(),
        observations: "Recu confirme apres validation finale chef d'agence.",
        status: 'ready_to_print',
        createdByUid: params.validatedBy.id,
      });
    } catch (docError) {
      console.error('[sessionService] echec mise a jour fiche remise apres validation chef', {
        companyId: params.companyId,
        agencyId: params.agencyId,
        shiftId: params.shiftId,
        docError,
      });
    }
  }
}

/**
 * Met à jour validatedAt sur les réservations vendues de la session (source de vérité pour revenus validés).
 */
async function setValidatedAtOnShiftReservations(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  validatedAt: Timestamp;
}): Promise<void> {
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${params.shiftId}`);
  const shiftSnap = await getDoc(shiftRef);
  const shiftAgentId = String((shiftSnap.data() as { userId?: string })?.userId ?? '');
  if (!shiftAgentId) return;
  const mergedDocs = await fetchReservationDocsForShiftSlot(
    params.companyId,
    params.agencyId,
    params.shiftId,
    { perQueryLimit: 500 }
  );
  const sold = ['paye', 'confirme', 'payé', 'confirmé'];
  const toUpdate = mergedDocs.filter((d) => {
    const data = d.data() as Record<string, unknown>;
    if (!belongsToGuichetSession(data, params.shiftId, shiftAgentId)) return false;
    const statut = String((data.statut as string | undefined) ?? '').toLowerCase();
    return sold.some((s) => statut === s || statut.includes(s));
  });
  await Promise.all(
    toUpdate.map((d) =>
      updateDoc(d.ref, { validatedAt: params.validatedAt, updatedAt: serverTimestamp() })
    )
  );
}

/**
 * Rejet par le chef d'agence : marque le rapport comme rejeté (reste VALIDATED_AGENCY, exclu de la liste de validation).
 */
export async function rejectSessionByHeadAccountant(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  rejectedBy: { id: string; name?: string | null };
  reason?: string;
}): Promise<void> {
  await authorizeActorInAgency({
    userId: params.rejectedBy.id,
    companyId: params.companyId,
    agencyId: params.agencyId,
    allowedRoles: ['chefAgence', 'admin_compagnie', 'admin_platforme'],
    deniedMessage: "Rejet non autorisé pour cet utilisateur.",
  });
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${params.shiftId}`);
  const now = Timestamp.now();
  await updateDoc(reportRef, stripUndefined({
    rejectedByCompanyAt: now,
    rejectedBy: { id: params.rejectedBy.id, name: params.rejectedBy.name ?? null },
    rejectionReason: params.reason ?? null,
    updatedAt: serverTimestamp(),
  }));

  const r = params.rejectedBy;
  logAgentHistoryEvent({
    companyId: params.companyId,
    agencyId: params.agencyId,
    agentId: r.id,
    agentName: r.name ?? null,
    role: 'chefAgence',
    type: 'SESSION_REJECTED',
    referenceId: params.shiftId,
    status: 'REJETE',
    createdBy: r.id,
    metadata: params.reason ? { reason: params.reason } : undefined,
  });
}

export type PauseSessionInput = {
  companyId: string;
  agencyId: string;
  shiftId: string;
  pausedBy: { id: string; name?: string | null };
  /** Motif obligatoire (traçabilité supervision / terrain). */
  reason: string;
  /** Rôle métier de `pausedBy` pour le journal (défaut : guichetier). */
  actorRole?: string;
};

/**
 * Pause : uniquement si poste en service — ne clôture pas, n’écrit pas en financier.
 * Écrit pausedAt, pausedBy, reason sur le document shift.
 */
export async function pauseSession(input: PauseSessionInput): Promise<void> {
  const reason = String(input.reason ?? '').trim();
  if (!reason) throw new Error('Le motif de pause est obligatoire.');
  const shiftRef = doc(db, `companies/${input.companyId}/agences/${input.agencyId}/${SHIFTS_COLLECTION}/${input.shiftId}`);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Poste introuvable.');
  const data = snap.data() as Record<string, unknown>;
  if (data.status !== SHIFT_STATUS.ACTIVE) throw new Error('Le poste doit être en service.');
  if (isShiftLocked(data.status as string)) throw new Error('Poste verrouillé.');
  const nextLegacyStatus = SHIFT_STATUS.PAUSED;
  await updateDoc(shiftRef, {
    status: nextLegacyStatus,
    cashStatus: mapLegacyToCash(nextLegacyStatus),
    pausedAt: serverTimestamp(),
    pausedBy: { id: input.pausedBy.id, name: input.pausedBy.name ?? null },
    reason,
    updatedAt: serverTimestamp(),
  });

  logAgentHistoryEvent({
    companyId: input.companyId,
    agencyId: input.agencyId,
    agentId: input.pausedBy.id,
    agentName: input.pausedBy.name ?? null,
    role: String(input.actorRole ?? 'guichetier').trim() || 'guichetier',
    type: 'SESSION_PAUSED',
    referenceId: input.shiftId,
    status: 'EN_COURS',
    createdBy: input.pausedBy.id,
    metadata: { reason },
  });
}

export async function continueSession(companyId: string, agencyId: string, shiftId: string): Promise<void> {
  const shiftRef = doc(db, `companies/${companyId}/agences/${agencyId}/${SHIFTS_COLLECTION}/${shiftId}`);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Poste introuvable.');
  const data = snap.data() as Record<string, unknown>;
  if (data.status !== SHIFT_STATUS.PAUSED) throw new Error('Le poste doit être en pause.');
  const nextLegacyStatus = SHIFT_STATUS.ACTIVE;
  await updateDoc(shiftRef, {
    status: nextLegacyStatus,
    cashStatus: mapLegacyToCash(nextLegacyStatus),
    updatedAt: serverTimestamp(),
  });
}

async function resolveActorContext(user: {
  id: string;
  role?: string | null;
  companyId: string;
  agencyId: string;
}): Promise<{ role: string; companyId: string; agencyId: string }> {
  const userRef = doc(db, 'users', user.id);
  const userSnap = await getDoc(userRef);
  const userDoc = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {};
  const role = String(userDoc.role ?? user.role ?? '').trim();
  const companyId = String(userDoc.companyId ?? userDoc.compagnieId ?? user.companyId ?? '').trim();
  const agencyId = String(userDoc.agencyId ?? user.agencyId ?? '').trim();
  if (!role) throw new Error('Role utilisateur introuvable.');
  if (!companyId || companyId !== user.companyId) throw new Error('Contexte compagnie invalide.');
  if (!agencyId || agencyId !== user.agencyId) throw new Error('Contexte agence invalide.');
  return { role, companyId, agencyId };
}

function ensureAllowedRole(role: string, allowed: string[], message: string): void {
  if (!allowed.includes(role)) throw new Error(message);
}

export async function authorizeActorInAgency(params: {
  userId: string;
  companyId: string;
  agencyId: string;
  allowedRoles: string[];
  deniedMessage: string;
}): Promise<void> {
  const actor = await resolveActorContext({
    id: params.userId,
    companyId: params.companyId,
    agencyId: params.agencyId,
  });
  ensureAllowedRole(actor.role, params.allowedRoles, params.deniedMessage);
}

function canProceedValidationWithDiscrepancy(
  ecart: number,
  overrideConfirmed: boolean | undefined,
  persistedOverride: boolean
): boolean {
  if (Math.abs(ecart) <= 0) return true;
  return Boolean(overrideConfirmed || persistedOverride);
}

export async function validateByManager(
  sessionId: string,
  user: { id: string; name?: string | null; role?: string | null; companyId: string; agencyId: string },
  options?: { overrideConfirmed?: boolean }
): Promise<void> {
  const actor = await resolveActorContext(user);
  ensureAllowedRole(actor.role, ['chefAgence', 'admin_compagnie', 'admin_platforme'], 'Seul un chef d’agence peut valider cette étape.');
  const base = `companies/${actor.companyId}/agences/${actor.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${sessionId}`);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${sessionId}`);
  await runTransaction(db, async (tx) => {
    const [sSnap, rSnap] = await Promise.all([tx.get(shiftRef), tx.get(reportRef)]);
    if (!sSnap.exists()) throw new Error('Poste introuvable.');
    if (!rSnap.exists()) throw new Error('Rapport introuvable.');
    const s = sSnap.data() as Record<string, unknown>;
    if ((s.status as string) !== SHIFT_STATUS.CLOSED) {
      throw new Error('La session doit être fermée avant validation manager.');
    }
    const ecart = Number(s.ecart ?? 0);
    const persistedOverride = Boolean(s.discrepancyOverrideConfirmed);
    if (!canProceedValidationWithDiscrepancy(ecart, options?.overrideConfirmed, persistedOverride)) {
      throw new Error('Session has discrepancy. Validation not allowed.');
    }
    const now = Timestamp.now();
    const nextCashStatus = CASH_SESSION_STATUS.VALIDEE_MANAGER;
    const nextLegacyStatus = mapCashToLegacy(nextCashStatus);
    tx.update(shiftRef, {
      status: nextLegacyStatus,
      managerValidated: true,
      managerValidatedAt: now,
      cashStatus: nextCashStatus,
      discrepancyOverrideConfirmed: Math.abs(ecart) > 0 ? true : persistedOverride,
      discrepancyOverrideBy: Math.abs(ecart) > 0 ? { id: user.id, name: user.name ?? null, role: actor.role } : (s.discrepancyOverrideBy ?? null),
      discrepancyOverrideAt: Math.abs(ecart) > 0 ? now : (s.discrepancyOverrideAt ?? null),
      updatedAt: serverTimestamp(),
    });
    tx.update(reportRef, {
      status: 'validated_agency',
      managerValidated: true,
      managerValidatedAt: now,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function validateByAccountant(
  sessionId: string,
  user: { id: string; name?: string | null; role?: string | null; companyId: string; agencyId: string },
  _options?: { overrideConfirmed?: boolean }
): Promise<void> {
  const actor = await resolveActorContext(user);
  ensureAllowedRole(actor.role, ['agency_accountant', 'company_accountant', 'admin_compagnie', 'admin_platforme'], 'Seul un comptable peut valider cette étape.');
  const base = `companies/${actor.companyId}/agences/${actor.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${sessionId}`);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${sessionId}`);
  await runTransaction(db, async (tx) => {
    const [sSnap, rSnap] = await Promise.all([tx.get(shiftRef), tx.get(reportRef)]);
    if (!sSnap.exists()) throw new Error('Poste introuvable.');
    if (!rSnap.exists()) throw new Error('Rapport introuvable.');
    const s = sSnap.data() as Record<string, unknown>;
    if ((s.status as string) !== SHIFT_STATUS.VALIDATED_AGENCY) {
      throw new Error('La session doit être validée manager avant validation comptable.');
    }
    if (!canProceedValidationWithDiscrepancy(Number(s.ecart ?? 0), false, Boolean(s.discrepancyOverrideConfirmed))) {
      throw new Error('Session has discrepancy. Validation not allowed.');
    }
    const now = Timestamp.now();
    const nextCashStatus = CASH_SESSION_STATUS.VALIDEE_COMPTABLE;
    const nextLegacyStatus = mapCashToLegacy(nextCashStatus);
    tx.update(shiftRef, {
      status: nextLegacyStatus,
      accountantValidated: true,
      accountantValidatedAt: now,
      cashStatus: nextCashStatus,
      validatedAt: now,
      updatedAt: serverTimestamp(),
    });
    tx.update(reportRef, {
      status: 'validated',
      accountantValidated: true,
      accountantValidatedAt: now,
      updatedAt: serverTimestamp(),
    });
  });
}

export { SHIFT_REPORTS_COLLECTION, SHIFT_STATUS };
export type { ShiftStatusValue };

