import { db } from '@/firebaseConfig';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

type Params = {
  companyId: string; agencyId: string; shiftId: string;
  userId: string; userName: string;
  note?: string | null;
};

export async function chefApproveShift(p: Params) {
  const ref = doc(db, 'companies', p.companyId, 'agences', p.agencyId, 'shifts', p.shiftId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Session introuvable');
    const s = snap.data() as any;

    if (!s.lockedComptable || !s.comptable?.validated) {
      throw new Error('En attente de la validation comptable.');
    }
    if (s.lockedChef) throw new Error('Déjà approuvée par le chef d’agence');

    const isDiscrep = !!s.discrepancyType && s.difference !== 0;

    tx.update(ref, {
      status: isDiscrep ? 'valide_definitif_avec_ecart' : 'valide_definitif',
      chef: {
        validated: true,
        at: serverTimestamp(),
        by: { id: p.userId, name: p.userName },
        note: p.note || null
      },
      lockedChef: true
    });
  });
}
