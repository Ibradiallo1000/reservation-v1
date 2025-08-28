// src/utils/referenceCode.ts
import { db } from '@/firebaseConfig';
import { doc, runTransaction, Timestamp } from 'firebase/firestore';

/**
 * Incrémente atomiquement le compteur d'une instance de trajet
 * et retourne la référence formatée: {COMP}-{AGC}-{CHAN}-{000123}
 *
 * tripInstanceId = identifiant stable du trajet (ex: weeklyTripId_YYYY-MM-DD_HH:mm)
 * companyCode = code court compagnie (ex: KMT)
 * agencyCode  = code court agence (ex: ABJ)
 * channelCode = 'WEB' pour en ligne, ou le code guichetier pour le guichet
 */
export async function generateRefCodeForTripInstance(opts: {
  companyId: string;
  agencyId: string;             // agence où part le trajet
  tripInstanceId: string;
  companyCode: string;          // makeShortCode(comp.nom, comp.code)
  agencyCode: string;           // makeShortCode(ag.nom, ag.code)
  channelCode: string;          // 'WEB' (online) ou sellerCode (guichet)
}) {
  const { companyId, agencyId, tripInstanceId, companyCode, agencyCode, channelCode } = opts;

  // ⚠️ compteur UNIQUE partagé par TOUS les canaux pour ce tripInstanceId
  const counterRef = doc(db, `companies/${companyId}/counters/byTrip/trips/${tripInstanceId}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const last = snap.exists() ? ((snap.data() as any).lastSeq || 0) : 0;
    const n = last + 1;
    tx.set(counterRef, { lastSeq: n, updatedAt: Timestamp.now(), agencyId }, { merge: true });
    return n;
  });

  // Format unifié – seuls les 3ᵉ blocs diffèrent (sellerCode vs WEB)
  return `${companyCode}-${agencyCode}-${channelCode}-${String(next).padStart(6, '0')}`;
}
