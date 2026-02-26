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
  SHIFT_REPORTS_COLLECTION,
  canCloseShift,
  isShiftLocked,
  type ShiftStatusValue,
} from '../constants/sessionLifecycle';
import { getDeviceFingerprint } from '@/utils/deviceFingerprint';
import { updateDailyStatsOnSessionClosed, updateDailyStatsOnSessionValidated, toDailyStatsDate } from '../aggregates/dailyStats';
import { updateAgencyLiveStateOnSessionOpened, updateAgencyLiveStateOnSessionClosed, updateAgencyLiveStateOnSessionValidated } from '../aggregates/agencyLiveState';
import { recordMovementInTransaction } from '@/modules/compagnie/treasury/financialMovements';
import { agencyCashAccountId } from '@/modules/compagnie/treasury/types';
import { financialAccountRef } from '@/modules/compagnie/treasury/financialAccounts';

const SHIFTS_COLLECTION = 'shifts';
const RESERVATIONS_COLLECTION = 'reservations';
const CANAL_GUICHET = 'guichet';

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
  const ref = await addDoc(shiftsRef, stripUndefined({
    companyId: params.companyId,
    agencyId: params.agencyId,
    userId: params.userId,
    userName: params.userName ?? null,
    userCode: params.userCode ?? 'GUEST',
    status: SHIFT_STATUS.PENDING,
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

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(shiftRef);
    if (!snap.exists()) throw new Error('Poste introuvable.');
    const cur = snap.data() as Record<string, unknown>;
    if ((cur.status as string) !== SHIFT_STATUS.PENDING) {
      throw new Error('Seul un poste en attente peut être activé.');
    }
    const now = Timestamp.now();
    tx.update(shiftRef, stripUndefined({
      status: SHIFT_STATUS.ACTIVE,
      startAt: now,
      startTime: now,
      activatedAt: now,
      activatedBy: { id: params.activatedBy.id, name: params.activatedBy.name ?? null },
      updatedAt: serverTimestamp(),
    }));
    tx.set(reportRef, stripUndefined({
      shiftId: params.shiftId,
      companyId: params.companyId,
      agencyId: params.agencyId,
      userId: cur.userId,
      userName: cur.userName ?? null,
      userCode: cur.userCode ?? null,
      startAt: now,
      activatedAt: now,
      activatedBy: { id: params.activatedBy.id, name: params.activatedBy.name ?? null },
      status: 'pending_validation',
      updatedAt: serverTimestamp(),
    }), { merge: true });

    updateAgencyLiveStateOnSessionOpened(tx, params.companyId, params.agencyId);
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

/**
 * Calcule les totaux de revenus dans une transaction (lecture des réservations via refs).
 */
export async function closeSession(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  userId: string;
  deviceFingerprint?: string | null;
}): Promise<CloseSessionTotals> {
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftsRef = collection(db, `${base}/${SHIFTS_COLLECTION}`);
  const shiftRef = doc(shiftsRef, params.shiftId);
  const reservationsRef = collection(db, `${base}/${RESERVATIONS_COLLECTION}`);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${params.shiftId}`);

  // Récupérer les refs des réservations du poste (pour les lire dans la transaction)
  const qRes = query(
    reservationsRef,
    where('shiftId', '==', params.shiftId),
    where('canal', '==', CANAL_GUICHET)
  );
  const resSnap = await getDocs(qRes);
  const resRefs = resSnap.docs.map((d) => d.ref);

  let resultTotals: CloseSessionTotals = {
    totalRevenue: 0,
    totalReservations: 0,
    totalCash: 0,
    totalDigital: 0,
    tickets: 0,
    details: [],
  };

  await runTransaction(db, async (tx) => {
    const shiftSnap = await tx.get(shiftRef);
    if (!shiftSnap.exists()) throw new Error('Poste introuvable.');
    const shiftData = shiftSnap.data() as Record<string, unknown>;
    const status = shiftData.status as string;
    if (!canCloseShift(status)) throw new Error('État non clôturable.');
    if (isShiftLocked(status)) throw new Error('Poste déjà validé (verrouillé).');
    if (shiftData.deviceFingerprint && shiftData.deviceFingerprint !== params.deviceFingerprint) {
      throw new Error('Session ouverte sur un autre appareil.');
    }

    let totalRevenue = 0;
    let totalReservations = 0;
    let totalCash = 0;
    let totalDigital = 0;
    let tickets = 0;
    const byRoute: Record<string, { billets: number; montant: number; heures: Set<string> }> = {};

    for (const ref of resRefs) {
      const docSnap = await tx.get(ref);
      if (!docSnap.exists()) continue;
      const r = docSnap.data() as Record<string, unknown>;
      const montant = Number(r.montant ?? 0);
      const n = Number(r.seatsGo ?? 0) + Number(r.seatsReturn ?? 0);
      totalReservations += 1;
      tickets += n;
      totalRevenue += montant;
      const paiement = String(r.paiement ?? '').toLowerCase();
      if (paiement === 'espèces' || paiement === 'especes') totalCash += montant;
      else totalDigital += montant;

      const key = `${r.depart ?? ''}→${r.arrivee ?? r.arrival ?? ''}`;
      if (!byRoute[key]) byRoute[key] = { billets: 0, montant: 0, heures: new Set<string>() };
      byRoute[key].billets += n;
      byRoute[key].montant += montant;
      if (r.heure) byRoute[key].heures.add(String(r.heure));
    }

    const details = Object.entries(byRoute).map(([trajet, v]) => ({
      trajet,
      billets: v.billets,
      montant: v.montant,
      heures: Array.from(v.heures).sort(),
    }));

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
      billets: tickets,
      montant: totalRevenue,
      totalRevenue,
      totalReservations,
      totalCash,
      totalDigital,
      details,
      accountantValidated: false,
      managerValidated: false,
      accountantValidatedAt: null,
      managerValidatedAt: null,
      status: 'pending_validation',
      createdAt: shiftData.createdAt,
      updatedAt: serverTimestamp(),
    }), { merge: true });

    tx.update(shiftRef, stripUndefined({
      status: SHIFT_STATUS.CLOSED,
      endAt: now,
      endTime: now,
      closedAt: now,
      tickets,
      amount: totalRevenue,
      totalRevenue,
      totalReservations,
      totalCash,
      totalDigital,
      updatedAt: serverTimestamp(),
    }));

    const statsDate = toDailyStatsDate(now);
    updateDailyStatsOnSessionClosed(tx, params.companyId, params.agencyId, statsDate);
    updateAgencyLiveStateOnSessionClosed(tx, params.companyId, params.agencyId);

    resultTotals = {
      totalRevenue,
      totalReservations,
      totalCash,
      totalDigital,
      tickets,
      details,
    };
  });

  return resultTotals;
}

/**
 * Validation comptable unique (Phase 2) : CLOSED → VALIDATED avec audit immuable.
 * Un seul flux. Aucune modification possible après VALIDATED.
 */
export type ValidationAudit = {
  validatedBy: { id: string; name?: string | null };
  validatedAt: Timestamp;
  receivedCashAmount: number;
  computedDifference: number; // reçu - attendu (négatif = manquant)
  accountantDeviceFingerprint: string;
};

export async function validateSessionByAccountant(params: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  receivedCashAmount: number;
  validatedBy: { id: string; name?: string | null };
  accountantDeviceFingerprint: string;
}): Promise<{ computedDifference: number }> {
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/${SHIFTS_COLLECTION}/${params.shiftId}`);
  const reportRef = doc(db, `${base}/${SHIFT_REPORTS_COLLECTION}/${params.shiftId}`);

  let computedDifference = 0;

  await runTransaction(db, async (tx) => {
    const sSnap = await tx.get(shiftRef);
    const rSnap = await tx.get(reportRef);
    if (!sSnap.exists()) throw new Error('Poste introuvable.');
    if (!rSnap.exists()) throw new Error('Rapport introuvable.');
    const s = sSnap.data() as Record<string, unknown>;
    if ((s.status as string) === SHIFT_STATUS.VALIDATED) throw new Error('Poste déjà validé (verrouillé).');
    if ((s.status as string) !== SHIFT_STATUS.CLOSED) throw new Error('Seuls les postes clôturés peuvent être validés.');

    const expectedCash = Number(s.totalCash ?? s.amount ?? 0);
    computedDifference = params.receivedCashAmount - expectedCash;
    const now = Timestamp.now();

    const validationAudit: ValidationAudit = {
      validatedBy: params.validatedBy,
      validatedAt: now,
      receivedCashAmount: params.receivedCashAmount,
      computedDifference,
      accountantDeviceFingerprint: params.accountantDeviceFingerprint,
    };

    tx.update(shiftRef, stripUndefined({
      status: SHIFT_STATUS.VALIDATED,
      validatedAt: now,
      validationAudit,
      updatedAt: serverTimestamp(),
    }));
    tx.update(reportRef, stripUndefined({
      status: 'validated',
      validatedAt: now,
      validationAudit,
      updatedAt: serverTimestamp(),
    }));

    const totalRevenue = Number(s.totalRevenue ?? s.amount ?? 0);
    const closedAt = (s.closedAt ?? s.endAt ?? now) as Timestamp;
    const statsDate = toDailyStatsDate(closedAt);
    updateDailyStatsOnSessionValidated(tx, params.companyId, params.agencyId, statsDate, totalRevenue);
    updateAgencyLiveStateOnSessionValidated(tx, params.companyId, params.agencyId);

    // Treasury: revenue_cash movement (external → agency_cash) when account exists
    const agencyCashId = agencyCashAccountId(params.agencyId);
    const agencyCashRef = financialAccountRef(params.companyId, agencyCashId);
    const accountSnap = await tx.get(agencyCashRef);
    if (accountSnap.exists() && params.receivedCashAmount > 0) {
      const currency = (accountSnap.data() as { currency?: string }).currency ?? 'XOF';
      await recordMovementInTransaction(tx, {
        companyId: params.companyId,
        fromAccountId: null,
        toAccountId: agencyCashId,
        amount: params.receivedCashAmount,
        currency,
        movementType: 'revenue_cash',
        referenceType: 'shift',
        referenceId: params.shiftId,
        agencyId: params.agencyId,
        performedBy: params.validatedBy.id,
        performedAt: now,
        notes: null,
      });
    }
  });

  return { computedDifference };
}

/**
 * Pause / Reprise : uniquement si poste non verrouillé.
 */
export async function pauseSession(companyId: string, agencyId: string, shiftId: string): Promise<void> {
  const shiftRef = doc(db, `companies/${companyId}/agences/${agencyId}/${SHIFTS_COLLECTION}/${shiftId}`);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Poste introuvable.');
  const data = snap.data() as Record<string, unknown>;
  if (data.status !== SHIFT_STATUS.ACTIVE) throw new Error('Le poste doit être en service.');
  if (isShiftLocked(data.status as string)) throw new Error('Poste verrouillé.');
  await updateDoc(shiftRef, { status: SHIFT_STATUS.PAUSED, updatedAt: serverTimestamp() });
}

export async function continueSession(companyId: string, agencyId: string, shiftId: string): Promise<void> {
  const shiftRef = doc(db, `companies/${companyId}/agences/${agencyId}/${SHIFTS_COLLECTION}/${shiftId}`);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) throw new Error('Poste introuvable.');
  const data = snap.data() as Record<string, unknown>;
  if (data.status !== SHIFT_STATUS.PAUSED) throw new Error('Le poste doit être en pause.');
  await updateDoc(shiftRef, { status: SHIFT_STATUS.ACTIVE, updatedAt: serverTimestamp() });
}

export { SHIFT_REPORTS_COLLECTION, SHIFT_STATUS };
export type { ShiftStatusValue };
