// functions/src/submitProof.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();
const HMAC_SECRET = functions.config().app?.hmac || 'DEMO_SECRET_CHANGE_ME';

function verifyAndHash(token: string, rid: string, deviceId: string) {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [ridToken, expStr, dev, sig] = parts;
  if (ridToken !== rid || dev !== deviceId) return null;
  const expect = crypto.createHmac('sha256', HMAC_SECRET).update(`${ridToken}.${expStr}.${dev}`).digest('hex');
  if (sig !== expect) return null;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return null;
  return crypto.createHash('sha256').update(token).digest('hex');
}

type ProofPayload = {
  companyId: string;
  agencyId: string;
  reservationId: string;
  deviceId: string;
  actionToken: string;
  paymentMethod: string;        // ex: 'orange_money'
  proofMessage?: string;
  proofUrl?: string | null;     // URL Storage déjà uploadée
};

export const submitProof = functions.https.onCall(async (data: ProofPayload, context) => {
  const { companyId, agencyId, reservationId, deviceId, actionToken, paymentMethod, proofMessage = '', proofUrl = null } = data || {};
  if (!companyId || !agencyId || !reservationId || !deviceId || !actionToken || !paymentMethod) {
    throw new functions.https.HttpsError('invalid-argument','Missing fields');
  }

  const ref = db.collection('companies').doc(companyId)
    .collection('agences').doc(agencyId)
    .collection('reservations').doc(reservationId);

  const snap = await ref.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found','Reservation not found');

  const rec = snap.data()!;
  if (rec.statut !== 'en_attente_paiement') {
    // on autorise si statut est déjà "preuve_recue" pour idempotence
    if (rec.statut !== 'preuve_recue') {
      throw new functions.https.HttpsError('failed-precondition','Invalid status');
    }
  }

  // vérifier token & device
  const tokenHash = verifyAndHash(actionToken, reservationId, deviceId);
  if (!tokenHash || tokenHash !== rec.actionTokenHash) {
    throw new functions.https.HttpsError('permission-denied','Invalid token');
  }

  // limiter nombre de soumissions
  const now = admin.firestore.Timestamp.now();
  const updates: any = {
    statut: 'preuve_recue',
    canal: 'en_ligne',
    preuveVia: paymentMethod,
    preuveMessage: (proofMessage || '').slice(0, 2000),
    preuveUrl: proofUrl || null,
    paymentHint: paymentMethod,
    updatedAt: now,
  };

  await ref.update(updates);
  return { ok: true };
});
