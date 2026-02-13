import { db } from '@/firebaseConfig';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';

type Params = {
  companyId: string; agencyId: string; shiftId: string;
  userId: string; userName: string;
  declaredDeposit: number;        // montant versé par le guichetier
  discrepancyNote?: string | null;
  discrepancyEvidenceUrl?: string | null; // optionnel (photo, PDF)
};

export async function validateShiftWithDeposit(p: Params) {
  const ref = doc(db, 'companies', p.companyId, 'agences', p.agencyId, 'shifts', p.shiftId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Session introuvable');

    const s = snap.data() as any;
    if (s.lockedComptable) throw new Error('Déjà validée par la comptabilité');
    if (s.status !== 'cloture') throw new Error('La session doit être clôturée avant validation');

    const attendu = Number(s.totalAmount || 0);
    const depose = Number(p.declaredDeposit || 0);
    const diff = depose - attendu;

    const discrepancyType =
      diff === 0 ? null : (diff < 0 ? 'manquant' : 'surplus');

    tx.update(ref, {
      declaredDeposit: depose,
      difference: diff,
      discrepancyType,
      discrepancyNote: p.discrepancyNote || null,
      discrepancyEvidenceUrl: p.discrepancyEvidenceUrl || null,

      status: diff === 0 ? 'valide_comptable' : 'valide_avec_ecart_comptable',
      comptable: {
        validated: true,
        at: serverTimestamp(),
        by: { id: p.userId, name: p.userName }
      },
      lockedComptable: true
    });
  });
}
