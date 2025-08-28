// src/utils/tickets.ts
// Génération atomique de références par instance de trajet (identique au guichet)
// Le canal web utilise sellerCode = "WEB"

import { db } from '@/firebaseConfig';
import { doc, runTransaction, Timestamp, setDoc } from 'firebase/firestore';

export async function generateReferenceCodeForTripInstance(opts: {
  companyId: string;
  companyCode: string;     // ex: "MAL"
  agencyId: string;
  agencyCode: string;      // ex: "GAB"
  tripInstanceId: string;  // weeklyTripId_YYYY-MM-DD_HH:mm
  sellerCode: string;      // "WEB" (client), "GCH12" (guichet), etc.
}) {
  const { companyId, companyCode, agencyId, agencyCode, tripInstanceId, sellerCode } = opts;

  // Compteur par instance de trajet (évite les collisions multi-sources)
  const counterRef = doc(db, `companies/${companyId}/counters/byTrip/trips/${tripInstanceId}`);

  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(counterRef);
    const last = snap.exists() ? (snap.data() as any).lastSeq || 0 : 0;
    const n = last + 1;
    if (!snap.exists()) {
      tx.set(counterRef, { lastSeq: n, updatedAt: Timestamp.now() });
    } else {
      tx.update(counterRef, { lastSeq: n, updatedAt: Timestamp.now() });
    }
    return n;
  }).catch(async () => {
    // Fallback si la transaction échoue (ex: premier passage)
    await setDoc(counterRef, { lastSeq: 1, updatedAt: Timestamp.now() }, { merge: true });
    return 1;
  });

  return `${companyCode}-${agencyCode}-${sellerCode}-${String(next).padStart(3, '0')}`;
}

// Variante dédiée au web (client en ligne)
export async function generateWebReferenceCode(args: {
  companyId: string;
  companyCode: string;
  agencyId: string;
  agencyCode: string;
  tripInstanceId: string;
}) {
  return generateReferenceCodeForTripInstance({
    ...args,
    sellerCode: 'WEB',
  });
}
