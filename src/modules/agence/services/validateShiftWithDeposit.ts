/**
 * Validation comptable avec dépôt déclaré (Phase 1 — cycle unifié).
 * Accepte les postes en statut "closed" et les passe en "validated" (verrouillé).
 */

import { db } from '@/firebaseConfig';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

export type ValidateShiftWithDepositParams = {
  companyId: string;
  agencyId: string;
  shiftId: string;
  userId: string;
  userName: string;
  declaredDeposit: number;
  discrepancyNote?: string | null;
  discrepancyEvidenceUrl?: string | null;
};

export async function validateShiftWithDeposit(p: ValidateShiftWithDepositParams): Promise<void> {
  const ref = doc(db, 'companies', p.companyId, 'agences', p.agencyId, 'shifts', p.shiftId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Session introuvable');

    const s = snap.data() as Record<string, unknown>;
    if (s.lockedComptable) throw new Error('Déjà validée par la comptabilité');
    if (s.status !== 'closed') throw new Error('La session doit être clôturée avant validation');

    const attendu = Number(s.totalAmount ?? s.amount ?? 0);
    const depose = Number(p.declaredDeposit ?? 0);
    const diff = depose - attendu;
    const discrepancyType = diff === 0 ? null : diff < 0 ? 'manquant' : 'surplus';

    tx.update(ref, {
      declaredDeposit: depose,
      difference: diff,
      discrepancyType,
      discrepancyNote: p.discrepancyNote ?? null,
      discrepancyEvidenceUrl: p.discrepancyEvidenceUrl ?? null,
      status: 'validated',
      comptable: {
        validated: true,
        at: serverTimestamp(),
        by: { id: p.userId, name: p.userName },
      },
      lockedComptable: true,
      validatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}
