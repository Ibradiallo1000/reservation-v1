// src/utils/tickets.ts
// Génération atomique de références par instance de trajet (identique au guichet)
// Le canal web utilise sellerCode = "WEB"

import { db } from '@/firebaseConfig';
import { doc, runTransaction, Timestamp, setDoc } from 'firebase/firestore';

function normalize(s?: string) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function inferAgencyCode(agencyName?: string) {
  const n = normalize(agencyName);
  if (!n) return '';
  // “Agence Principale”, “Agence principal”, “Principal(e)” => AP
  if (/(agence\s*)?principal(e)?/.test(n)) return 'AP';
  // sinon, initiales (deux premières lettres significatives)
  const initials = n
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase();
  return initials.slice(0, 2);
}

export async function generateReferenceCodeForTripInstance(opts: {
  companyId: string;
  companyCode: string;     // ex: "MT"
  agencyId: string;
  agencyCode?: string;     // ex: "AP" ; peut être vide
  agencyName?: string;     // ← accepté (pour déduire AP si code absent)
  tripInstanceId: string;  // weeklyTripId_YYYY-MM-DD_HH:mm
  sellerCode: string;      // "WEB" (client), "GCH12" (guichet), etc.
}) {
  const {
    companyId, companyCode,
    agencyId, agencyCode, agencyName,
    tripInstanceId, sellerCode
  } = opts;

  // Si pas de code agence fourni, on l'infère depuis le nom
  const agencyCodeEff = (agencyCode && agencyCode.trim())
    ? agencyCode.toUpperCase()
    : inferAgencyCode(agencyName) || 'AG';

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

  return `${companyCode.toUpperCase()}-${agencyCodeEff}-${sellerCode}-${String(next).padStart(4, '0')}`;
}

// Variante dédiée au web (client en ligne)
export async function generateWebReferenceCode(args: {
  companyId: string;
  companyCode: string;
  agencyId: string;
  agencyCode?: string;
  agencyName?: string;     // ← accepté ici aussi
  tripInstanceId: string;
}) {
  return generateReferenceCodeForTripInstance({
    ...args,
    sellerCode: 'WEB',
  });
}
