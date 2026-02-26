/**
 * Approbation chef d'agence (Phase 1 — cycle unifié).
 * Le poste doit déjà être validé par la comptabilité (status validated, lockedComptable).
 */

import { db } from '@/firebaseConfig';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

export type ChefApproveShiftParams = {
  companyId: string;
  agencyId: string;
  shiftId: string;
  userId: string;
  userName: string;
  note?: string | null;
};

export async function chefApproveShift(p: ChefApproveShiftParams): Promise<void> {
  const ref = doc(db, 'companies', p.companyId, 'agences', p.agencyId, 'shifts', p.shiftId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Session introuvable');
    const s = snap.data() as Record<string, unknown>;

    if (!s.lockedComptable || !(s.comptable as Record<string, unknown>)?.validated) {
      throw new Error('En attente de la validation comptable.');
    }
    if (s.lockedChef) throw new Error('Déjà approuvée par le chef d\'agence');
    if (s.status !== 'validated') throw new Error('Le poste doit être validé par la comptabilité.');

    tx.update(ref, {
      chef: {
        validated: true,
        at: serverTimestamp(),
        by: { id: p.userId, name: p.userName },
        note: p.note ?? null,
      },
      lockedChef: true,
      updatedAt: serverTimestamp(),
    });
  });
}
