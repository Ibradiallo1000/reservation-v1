// src/services/shiftApi.ts
import { collection, doc, getDocs, onSnapshot, orderBy, query, runTransaction, where, Timestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export type DayRange = { start: Date; end: Date };
export const dayRange = (dateISO: string): DayRange => {
  const d = new Date(`${dateISO}T00:00:00`);
  const start = new Date(d); start.setHours(0,0,0,0);
  const end   = new Date(d); end.setHours(23,59,59,999);
  return { start, end };
};

// 1) Live: écouter les shifts (pending/active/paused/closed)
export function listenLiveShifts(companyId: string, agencyId: string, cb: (docs: any[]) => void) {
  const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shifts`);
  return onSnapshot(ref, snap => cb(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
}

// 2) Validés du jour (SOURCE = shift_reports)
export async function listValidatedReports(companyId: string, agencyId: string, dateISO: string) {
  const { start, end } = dayRange(dateISO);
  const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shift_reports`);
  const qy = query(
    ref,
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<=', Timestamp.fromDate(end)),
    where('status', '==', 'validated'),
    orderBy('startAt', 'asc')
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 3) En attente pour la compta (SOURCE = shift_reports)
export async function listPendingReports(companyId: string, agencyId: string, dateISO: string) {
  const { start, end } = dayRange(dateISO);
  const ref = collection(db, `companies/${companyId}/agences/${agencyId}/shift_reports`);
  const qy = query(
    ref,
    where('startAt', '>=', Timestamp.fromDate(start)),
    where('startAt', '<=', Timestamp.fromDate(end)),
    where('status', '==', 'pending_validation'),
    orderBy('startAt', 'asc')
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// 4) Action UNIQUE de validation (transaction client)
// - Met à jour shift_reports (source) ET shifts (miroir) en un seul coup.
export async function validateReportClient(opts: {
  companyId: string; agencyId: string; shiftId: string;
  accountant: { id: string; code?: string; name: string };
  note?: string;
}) {
  const { companyId, agencyId, shiftId, accountant, note='' } = opts;
  const rRef = doc(db, `companies/${companyId}/agences/${agencyId}/shift_reports/${shiftId}`);
  const sRef = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${shiftId}`);

  await runTransaction(db, async tx => {
    const rSnap = await tx.get(rRef);
    const sSnap = await tx.get(sRef);
    if (!rSnap.exists()) throw new Error('shift_report introuvable');
    if (!sSnap.exists()) throw new Error('shift introuvable');

    const now = Timestamp.now();

    // 1) Source officielle
    tx.set(rRef, {
      status: 'validated',
      accountantValidated: true,
      accountantValidatedAt: now,
      accountantStamp: {
        at: now,
        by: { id: accountant.id, name: accountant.name, code: accountant.code || '', note }
      },
      updatedAt: now
    }, { merge: true });

    // 2) Miroir simplifié dans shifts (utile à l’app, mais pas la vérité)
    tx.set(sRef, {
      status: 'validated',
      validatedAt: now,
      accountantValidated: true,
      accountantValidatedAt: now,
      comptable: {
        validated: true,
        at: now,
        by: { id: accountant.id, name: accountant.name },
        note: note || 'Réception espèces validée'
      },
      updatedAt: now
    }, { merge: true });
  });
}
