/**
 * API postes / rapports (Phase 1 — Stabilisation).
 * Collection unique : shiftReports (plus de shift_reports).
 */

import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
  runTransaction,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { SHIFT_REPORTS_COLLECTION } from '../constants/sessionLifecycle';
import { toDailyStatsDate, updateDailyStatsOnSessionValidated } from '../aggregates/dailyStats';
import { updateAgencyLiveStateOnSessionValidated } from '../aggregates/agencyLiveState';
import { recordMovementInTransaction } from '@/modules/compagnie/treasury/financialMovements';
import { agencyCashAccountId } from '@/modules/compagnie/treasury/types';
import { financialAccountRef } from '@/modules/compagnie/treasury/financialAccounts';

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

/**
 * Validation comptable (une seule voie). Met à jour shiftReports et shifts → status validated.
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
    if (s.status === 'validated') throw new Error('Poste déjà validé.');
    if (s.status !== 'closed') throw new Error('Seuls les postes clôturés peuvent être validés.');

    const now = Timestamp.now();

    tx.set(
      rRef,
      {
        status: 'validated',
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
        status: 'validated',
        validatedAt: now,
        accountantValidated: true,
        accountantValidatedAt: now,
        comptable: {
          validated: true,
          at: now,
          by: { id: accountant.id, name: accountant.name },
          note: note || 'Réception espèces validée',
        },
        updatedAt: now,
      },
      { merge: true }
    );

    const totalRevenue = Number(s.totalRevenue ?? s.amount ?? 0);
    const closedAt = (s.closedAt ?? s.endAt ?? now) as Timestamp;
    const statsDate = toDailyStatsDate(closedAt);
    updateDailyStatsOnSessionValidated(tx, companyId, agencyId, statsDate, totalRevenue);
    updateAgencyLiveStateOnSessionValidated(tx, companyId, agencyId);

    const agencyCashId = agencyCashAccountId(agencyId);
    const agencyCashRef = financialAccountRef(companyId, agencyCashId);
    const accountSnap = await tx.get(agencyCashRef);
    if (accountSnap.exists() && totalRevenue > 0) {
      const currency = (accountSnap.data() as { currency?: string }).currency ?? 'XOF';
      await recordMovementInTransaction(tx, {
        companyId,
        fromAccountId: null,
        toAccountId: agencyCashId,
        amount: totalRevenue,
        currency,
        movementType: 'revenue_cash',
        referenceType: 'shift',
        referenceId: shiftId,
        agencyId,
        performedBy: accountant.id,
        performedAt: now,
        notes: note || null,
      });
    }
  });
}
