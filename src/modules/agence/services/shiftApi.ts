/**
 * API postes / rapports (Phase 1 — Stabilisation).
 * Collection unique : shiftReports (plus de shift_reports).
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { SHIFT_REPORTS_COLLECTION, SHIFT_STATUS, VALIDATION_LEVEL } from '../constants/sessionLifecycle';
import { toDailyStatsDate, updateDailyStatsOnSessionValidatedByAgency } from '../aggregates/dailyStats';
import { updateAgencyLiveStateOnSessionValidated } from '../aggregates/agencyLiveState';

export type DayRange = { start: Date; end: Date };
export const dayRange = (dateISO: string): DayRange => {
  const d = new Date(`${dateISO}T00:00:00`);
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
};

export function listenLiveShifts(companyId: string, agencyId: string, cb: (docs: unknown[]) => void) {
  const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shifts`);
  return onSnapshot(ref, (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

/** Rapports validés du jour (collection shiftReports). */
export async function listValidatedReports(
  companyId: string,
  agencyId: string,
  dateISO: string
): Promise<{ id: string; [k: string]: unknown }[]> {
  const { start, end } = dayRange(dateISO);
  const ref = collection(db, `companies/${companyId}/agences/${agencyId}/${SHIFT_REPORTS_COLLECTION}`);
  const q = query(
    ref,
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<=', Timestamp.fromDate(end)),
    where('status', '==', 'validated'),
    orderBy('startAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; [k: string]: unknown }));
}

/** Rapports en attente de validation (collection shiftReports). */
export async function listPendingReports(
  companyId: string,
  agencyId: string,
  dateISO: string
): Promise<{ id: string; [k: string]: unknown }[]> {
  const { start, end } = dayRange(dateISO);
  const ref = collection(db, `companies/${companyId}/agences/${agencyId}/${SHIFT_REPORTS_COLLECTION}`);
  const q = query(
    ref,
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<=', Timestamp.fromDate(end)),
    where('status', '==', 'pending_validation'),
    orderBy('startAt', 'asc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; [k: string]: unknown }));
}

export type ShiftReportValidatedByAgency = {
  id: string;
  shiftId: string;
  companyId: string;
  agencyId: string;
  agencyName?: string;
  userName?: string | null;
  userCode?: string | null;
  startAt: unknown;
  endAt?: unknown;
  totalRevenue?: number;
  totalCash?: number;
  totalDigital?: number;
  validatedByAgencyAt?: unknown;
  [k: string]: unknown;
};

/** Liste tous les rapports validés par l'agence (en attente validation chef comptable) pour une compagnie. */
export async function listReportsValidatedByAgencyForCompany(
  companyId: string
): Promise<ShiftReportValidatedByAgency[]> {
  const agenciesRef = collection(db, `companies/${companyId}/agences`);
  const agenciesSnap = await getDocs(agenciesRef);
  const results: ShiftReportValidatedByAgency[] = [];
  for (const agDoc of agenciesSnap.docs) {
    const agencyId = agDoc.id;
    const agencyData = agDoc.data() as { name?: string; nom?: string };
    const agencyName = agencyData?.name ?? agencyData?.nom ?? agencyId;
    const ref = collection(db, `companies/${companyId}/agences/${agencyId}/${SHIFT_REPORTS_COLLECTION}`);
    const q = query(ref, where('status', '==', 'validated_agency'), limit(200));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data();
      if (data.rejectedByCompanyAt) return;
      results.push({
        id: d.id,
        shiftId: d.id,
        companyId: data.companyId ?? companyId,
        agencyId: data.agencyId ?? agencyId,
        agencyName,
        userName: data.userName ?? null,
        userCode: data.userCode ?? null,
        startAt: data.startAt,
        endAt: data.endAt,
        totalRevenue: Number(data.totalRevenue ?? data.montant ?? 0),
        totalCash: Number(data.totalCash ?? 0),
        totalDigital: Number(data.totalDigital ?? 0),
        validatedByAgencyAt: data.validatedByAgencyAt,
        ...data,
      });
    });
  }
  results.sort((a, b) => {
    const at = (a.validatedByAgencyAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
    const bt = (b.validatedByAgencyAt as { toMillis?: () => number })?.toMillis?.() ?? 0;
    return bt - at;
  });
  return results;
}

/**
 * Validation comptable agence (même flux que validateSessionByAccountant). CLOSED → VALIDATED_AGENCY.
 * Pas de mouvement trésorerie (réservé au chef comptable via validateSessionByHeadAccountant).
 */
export async function validateReportClient(opts: {
  companyId: string;
  agencyId: string;
  shiftId: string;
  accountant: { id: string; code?: string; name: string };
  note?: string;
}): Promise<void> {
  const { companyId, agencyId, shiftId, accountant, note = '' } = opts;
  const rRef = doc(db, `companies/${companyId}/agences/${agencyId}/${SHIFT_REPORTS_COLLECTION}/${shiftId}`);
  const sRef = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${shiftId}`);

  await runTransaction(db, async (tx) => {
    const rSnap = await tx.get(rRef);
    const sSnap = await tx.get(sRef);
    if (!rSnap.exists()) throw new Error('Rapport introuvable');
    if (!sSnap.exists()) throw new Error('Poste introuvable');

    const s = sSnap.data() as Record<string, unknown>;
    const status = (s.status as string) ?? '';
    if (status === SHIFT_STATUS.VALIDATED || status === 'validated') {
      return;
    }
    if (status === SHIFT_STATUS.VALIDATED_AGENCY || status === 'validated_agency') {
      return;
    }
    if (status !== 'closed') throw new Error('Seuls les postes clôturés peuvent être validés.');

    const now = Timestamp.now();

    tx.set(
      rRef,
      {
        status: 'validated_agency',
        validationLevel: VALIDATION_LEVEL.AGENCY,
        validatedByAgencyAt: now,
        accountantValidated: true,
        accountantValidatedAt: now,
        accountantStamp: {
          at: now,
          by: { id: accountant.id, name: accountant.name, code: accountant.code || '', note },
        },
        updatedAt: now,
      },
      { merge: true }
    );

    tx.set(
      sRef,
      {
        status: SHIFT_STATUS.VALIDATED_AGENCY,
        validatedAt: now,
        accountantValidated: true,
        accountantValidatedAt: now,
        comptable: {
          validated: true,
          at: now,
          by: { id: accountant.id, name: accountant.name },
          note: note || 'Réception espèces validée (agence)',
        },
        updatedAt: now,
      },
      { merge: true }
    );

    const totalRevenue = Number(s.totalRevenue ?? s.amount ?? 0);
    const closedAt = (s.closedAt ?? s.endAt ?? now) as Timestamp;
    const statsDate = toDailyStatsDate(closedAt);
    updateDailyStatsOnSessionValidatedByAgency(tx, companyId, agencyId, statsDate, totalRevenue);
    updateAgencyLiveStateOnSessionValidated(tx, companyId, agencyId);
  });
}
