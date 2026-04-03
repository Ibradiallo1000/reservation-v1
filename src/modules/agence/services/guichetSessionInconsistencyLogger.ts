import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export type SessionInconsistencyLogInput = {
  companyId: string;
  reservationId?: string;
  sessionId: string;
  agentId: string;
  reason: string;
};

/**
 * Journal compagnie : incohérences session / réservation guichet (supervision).
 * Collection : companies/{companyId}/systemErrors
 */
export async function logGuichetSessionInconsistency(input: SessionInconsistencyLogInput): Promise<void> {
  try {
    await addDoc(collection(db, `companies/${input.companyId}/systemErrors`), {
      type: 'SESSION_INCONSISTENCY',
      severity: 'high',
      reservationId: input.reservationId ?? null,
      sessionId: input.sessionId,
      agentId: input.agentId,
      reason: input.reason,
      message: input.reason,
      createdAt: serverTimestamp(),
    });
  } catch (e) {
    console.error('[guichetSessionInconsistencyLogger] write failed', e);
  }
}
