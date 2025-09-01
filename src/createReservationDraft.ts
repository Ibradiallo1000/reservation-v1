// functions/src/createReservationDraft.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';

const db = admin.firestore();

type CreatePayload = {
  companyId: string;
  agencyId: string;
  trajetId: string;
  depart: string;
  arrivee: string;
  date: string;       // "YYYY-MM-DD"
  heure: string;      // "HH:mm"
  seatsGo: number;
  amount: number;
  fullName: string;
  phone: string;
  email?: string | null;
  deviceId: string;
  // optionnel: captchaToken etc.
};

const HMAC_SECRET = functions.config().app?.hmac || 'DEMO_SECRET_CHANGE_ME';

function signToken(rid: string, expiresAt: number, deviceId: string) {
  const payload = `${rid}.${expiresAt}.${deviceId}`;
  const sig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export const createReservationDraft = functions.https.onCall(async (data: CreatePayload, context) => {
  // (optionnel) vérifier auth/captcha ici
  const {
    companyId, agencyId, trajetId, depart, arrivee, date, heure,
    seatsGo, amount, fullName, phone, email = null, deviceId
  } = data || {};

  // validations minimales
  if (!companyId || !agencyId || !trajetId) throw new functions.https.HttpsError('invalid-argument','Missing ids');
  if (!fullName || !phone) throw new functions.https.HttpsError('invalid-argument','Missing passenger info');
  if (!/^\+?\d{8,15}$/.test(String(phone))) throw new functions.https.HttpsError('invalid-argument','Invalid phone');
  if (seatsGo < 1 || seatsGo > 5) throw new functions.https.HttpsError('invalid-argument','Invalid seats');

  // quotas anti-spam (24h + actifs)
  const NOW = admin.firestore.Timestamp.now();
  const twentyFourHrsAgo = admin.firestore.Timestamp.fromMillis(NOW.toMillis() - 24 * 3600 * 1000);

  const resCol = db.collection('companies').doc(companyId)
    .collection('agences').doc(agencyId)
    .collection('reservations');

  // Actifs non expirés
  const activeSnap = await resCol
    .where('telephone', '==', phone)
    .where('statut', '==', 'en_attente_paiement')
    .get();

  // Historique récent
  const recentSnap = await resCol
    .where('telephone', '==', phone)
    .where('createdAt', '>=', twentyFourHrsAgo)
    .get();

  const activeByPhone = activeSnap.size;
  const recentByPhone = recentSnap.size;

  // Idem device
  const activeDeviceSnap = await resCol
    .where('clientDeviceId', '==', deviceId)
    .where('statut', '==', 'en_attente_paiement')
    .get();

  if (activeByPhone >= 3 || activeDeviceSnap.size >= 3 || recentByPhone >= 10) {
    throw new functions.https.HttpsError('resource-exhausted','Too many drafts, try later');
  }

  // créer le doc
  const holdUntil = admin.firestore.Timestamp.fromMillis(NOW.toMillis() + 15*60*1000);
  const ref = resCol.doc();

  const docData = {
    nomClient: fullName,
    telephone: phone,
    email: email,

    depart, arrivee, date, heure,
    montant: amount,
    seatsGo,
    seatsReturn: 0,
    tripType: 'aller_simple',

    statut: 'en_attente_paiement',
    canal: 'en_ligne',

    companyId, agencyId, trajetId,
    agencyNom: null,
    agencyTelephone: null,

    holdUntil,
    clientDeviceId: deviceId,

    createdAt: NOW,
    updatedAt: NOW,

    // token
    actionTokenHash: null as string | null,
    actionTokenExp: holdUntil, // même échéance
  };

  const expiresAtMs = holdUntil.toMillis();
  const actionToken = signToken(ref.id, expiresAtMs, deviceId);
  const tokenHash = hashToken(actionToken);

  await ref.set({
    ...docData,
    actionTokenHash: tokenHash,
  });

  return { reservationId: ref.id, actionToken, holdUntil: expiresAtMs };
});
