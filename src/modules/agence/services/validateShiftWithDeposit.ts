/**
 * Validation comptable avec dépôt déclaré (Phase 1 — cycle unifié).
 * Accepte les postes en statut "closed" et les passe en "validated" (verrouillé).
 */

import { db } from '@/firebaseConfig';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { applyRemittancePendingToAgencyCashInTransaction } from '@/modules/compagnie/treasury/financialTransactions';
import { writeComptaEncaissementInTransaction } from '@/modules/agence/comptabilite/comptaEncaissementsService';
import {
  PENDING_CASH_LEDGER_SYSTEM_VERSION,
  type PendingCashRemittanceStatus,
} from '@/modules/agence/comptabilite/pendingCashSafety';

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
    const isPartialRemittance = depose + 0.01 < attendu;
    const remittanceStatus: PendingCashRemittanceStatus = isPartialRemittance
      ? 'partial_remittance'
      : 'full_remittance';
    const remittanceDiscrepancyAmount = isPartialRemittance ? Math.max(0, attendu - depose) : 0;

    await applyRemittancePendingToAgencyCashInTransaction(
      tx,
      p.companyId,
      p.agencyId,
      depose,
      'XOF',
      { referenceType: 'shift', referenceId: p.shiftId },
      `shift ${p.shiftId} validateShiftWithDeposit (legacy)`
    );

    tx.update(ref, {
      declaredDeposit: depose,
      difference: diff,
      discrepancyType,
      remittanceStatus,
      remittanceDiscrepancyAmount,
      pendingCashLedgerVersion: PENDING_CASH_LEDGER_SYSTEM_VERSION,
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

    if (depose > 0) {
      writeComptaEncaissementInTransaction(tx, p.companyId, p.agencyId, {
        sessionId: p.shiftId,
        montant: depose,
        source: 'guichet',
      });
    }
  });
}
