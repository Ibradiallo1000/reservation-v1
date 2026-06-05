/**
 * Service des réservations guichet (Phase 1 — Stabilisation).
 * Création avec sessionId / agencyId / userId et champs d'audit.
 * Aucune logique financière dans les composants UI.
 * 
 * 🔐 SECURITE: La seule source de vérité pour l'utilisateur est auth.currentUser.uid
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  limit,
  increment,
} from 'firebase/firestore';
import { auth, db } from '@/firebaseConfig';
import { normalizePhone } from '@/utils/phoneUtils';
import { SHIFT_STATUS, isShiftLocked } from '../constants/sessionLifecycle';
import { dailyStatsTimezoneFromAgencyData, updateDailyStatsOnReservationCreated } from '../aggregates/dailyStats';
import {
  CASH_SESSION_COLLECTION,
  CASH_SESSION_STATUS,
  CASH_SESSION_TYPE,
  type CashPaymentMethod,
} from '@/modules/agence/cashControl/cashSessionTypes';
import { upsertCustomerFromReservation } from '@/modules/compagnie/crm/customerService';
import {
  bookSeatsOnTripInstanceInTransaction,
  findTripInstanceBySlot,
  getTripInstance,
  tripInstanceRef,
} from '@/modules/compagnie/tripInstances/tripInstanceService';
import { getStopByOrder, getEscaleDestinations } from '@/modules/compagnie/routes/routeStopsService';
import {
  resolveJourneyStopIdsFromCities,
  resolveStopByStopId,
  warnIfStopIdOrderMismatch,
} from '@/modules/compagnie/routes/stopResolution';
import { createPayment } from '@/services/paymentService';
import { logAgentHistoryEvent } from '@/modules/agence/services/agentHistoryService';
import { assertReservationChannelInvariantsOnWrite } from '@/modules/agence/guichet/guichetSessionReservationModel';
import { logGuichetSessionInconsistency } from '@/modules/agence/services/guichetSessionInconsistencyLogger';
import { writeTicketGuichetActivityInTransaction } from '@/modules/compagnie/activity/activityLogsService';
import {
  assertAndIncrementOperationInTransaction,
  loadOperationPlanSettings,
} from '@/core/subscription/operationQuota';

const GUICHET_SESSION_INVARIANT_PREFIX = 'GUICHET_SESSION_INVARIANT:';

export type CreateGuichetReservationParams = {
  companyId: string;
  agencyId: string;
  /** @deprecated Utilisé UNIQUEMENT pour validation. La source réelle est auth.currentUser.uid */
  userId: string;
  sessionId: string;
  idempotencyKey: string;
  userCode: string;
  trajetId: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  nomClient: string;
  telephone: string | null;
  telephoneOriginal?: string | null;
  seatsGo: number;
  seatsReturn: number;
  montant: number;
  companySlug: string;
  compagnieNom: string;
  agencyNom: string;
  agencyTelephone?: string | null;
  referenceCode: string;
  tripType: string;
  paymentMethod?: CashPaymentMethod;
  tripInstanceId?: string | null;
  originStopOrder?: number | null;
  destinationStopOrder?: number | null;
  originStopId?: string | null;
  destinationStopId?: string | null;
  offlineMeta?: {
    mode: "online" | "offline";
    transactionId?: string;
    deviceId?: string;
    createdAt?: number;
  };
};

function assertGuichetReservationCreateInput(p: CreateGuichetReservationParams): void {
  if (!String(p.sessionId ?? '').trim()) {
    throw new Error(`${GUICHET_SESSION_INVARIANT_PREFIX} Session de poste obligatoire.`);
  }
  if (!String(p.userId ?? '').trim()) {
    throw new Error(`${GUICHET_SESSION_INVARIANT_PREFIX} Agent obligatoire.`);
  }
  if (!String(p.idempotencyKey ?? '').trim()) {
    throw new Error(`${GUICHET_SESSION_INVARIANT_PREFIX} Clé d'idempotence obligatoire.`);
  }
  assertReservationChannelInvariantsOnWrite({
    paymentChannel: 'guichet',
    agentId: p.userId,
    sessionId: p.sessionId,
  });
}

async function verifyReservationIntegrity(
  companyId: string,
  agencyId: string,
  reservationId: string
): Promise<void> {
  const markInvalid = async (reason: string): Promise<void> => {
    const reservationRef = doc(db, `companies/${companyId}/agences/${agencyId}/reservations/${reservationId}`);
    await updateDoc(reservationRef, {
      statut: 'invalide',
      integrityIssue: true,
      integrityReason: reason,
      updatedAt: serverTimestamp(),
    });
    console.error("[verifyReservationIntegrity] reservation marked invalid", { reservationId, reason });
  };

  const reservationRef = doc(db, `companies/${companyId}/agences/${agencyId}/reservations/${reservationId}`);
  const reservationSnap = await getDoc(reservationRef);
  if (!reservationSnap.exists()) throw new Error("Reservation missing");
  const reservation = reservationSnap.data() as { tripInstanceId?: string | null; paymentId?: string | null };
  if (reservation.tripInstanceId) {
    const trip = await getTripInstance(companyId, reservation.tripInstanceId);
    if (!trip) {
      await markInvalid("Trip missing");
      throw new Error("Trip missing");
    }
    const reservedSeats = Number((trip as { reservedSeats?: number }).reservedSeats ?? 0);
    if (reservedSeats < 0) {
      await markInvalid("Seat inconsistency detected");
      throw new Error("Seat inconsistency detected");
    }
  }
  if (!reservation.paymentId) {
    await markInvalid("Missing payment for reservation");
    console.warn("Missing payment for reservation", reservationId);
  }
}

/**
 * Vérifie la cohérence globale d'une réservation.
 * Note: Cette fonction nécessite des droits élevés (accès aux financialTransactions).
 * En cas d'erreur de permission, on log simplement sans bloquer.
 */
async function verifyGlobalReservationConsistency(
  companyId: string,
  agencyId: string,
  reservationId: string
): Promise<void> {
  try {
    const reservationRef = doc(db, `companies/${companyId}/agences/${agencyId}/reservations/${reservationId}`);
    const reservationSnap = await getDoc(reservationRef);
    const reservationExists = reservationSnap.exists();
    const reservation = reservationExists ? (reservationSnap.data() as { paymentId?: string | null }) : null;
    const paymentId = String(reservation?.paymentId ?? '').trim();

    let paymentExists = false;
    if (paymentId) {
      try {
        paymentExists = (await getDoc(doc(db, 'companies', companyId, 'payments', paymentId))).exists();
      } catch (e) {
        console.warn('[verifyGlobalReservationConsistency] Cannot access payment:', e);
      }
    }

    let financialTransactionExists = false;
    try {
      const txSnap = await getDocs(query(
        collection(db, 'companies', companyId, 'financialTransactions'),
        where('reservationId', '==', reservationId),
        where('type', '==', 'payment_received'),
        limit(1)
      ));
      financialTransactionExists = !txSnap.empty;
    } catch (e) {
      console.debug('[verifyGlobalReservationConsistency] Cannot access financialTransactions (insufficient permissions, skipping):', e);
      return;
    }

    const isConsistent = reservationExists && paymentExists && financialTransactionExists;
    
    try {
      await updateDoc(reservationRef, {
        isConsistent,
        consistencyIssue: !isConsistent,
        consistencyCheckedAt: serverTimestamp(),
        ...(isConsistent
          ? { consistencyReason: null }
          : { consistencyReason: 'Missing reservation/payment/financial transaction link' }),
        ...(isConsistent ? {} : { integrityIssue: true }),
        updatedAt: serverTimestamp(),
      });
    } catch (e) {
      console.warn('[verifyGlobalReservationConsistency] Cannot update reservation:', e);
    }
    
    if (!isConsistent) {
      console.warn('[guichetReservationService] reservation consistency issue', {
        reservationId,
        reservationExists,
        paymentExists,
        financialTransactionExists,
      });
    }
  } catch (e) {
    console.debug('[verifyGlobalReservationConsistency] Non-critical consistency check skipped:', e);
  }
}

async function logGuichetFinanceAuthDebug(params: {
  companyId: string;
  agencyId: string;
  userId: string;
}): Promise<void> {
  try {
    const currentUid = auth.currentUser?.uid ?? null;
    const token = auth.currentUser ? await auth.currentUser.getIdTokenResult(false) : null;
    const tokenRole = (token?.claims?.role as string | undefined) ?? '';
    const tokenCompanyId =
      (token?.claims?.companyId as string | undefined) ??
      (token?.claims?.compagnieId as string | undefined) ??
      '';
    const userSnap = currentUid
      ? await getDoc(doc(db, 'users', currentUid))
      : null;
    const userData = userSnap?.exists() ? (userSnap.data() as Record<string, unknown>) : null;
    const userRoleDoc = String(userData?.role ?? '');
    const userCompanyDoc =
      String(userData?.companyId ?? userData?.compagnieId ?? '');

    console.warn('[GUICHET_FINANCE_DEBUG]', {
      expected: {
        companyId: params.companyId,
        agencyId: params.agencyId,
        userId: params.userId,
      },
      auth: {
        isAuthenticated: auth.currentUser != null,
        currentUid,
        tokenRole,
        tokenCompanyId,
      },
      userDoc: {
        exists: Boolean(userData),
        role: userRoleDoc,
        companyId: userCompanyDoc,
        agencyId: String(userData?.agencyId ?? ''),
      },
      checks: {
        uidMatches: currentUid === params.userId,
        companyMatchesToken: tokenCompanyId === params.companyId,
        companyMatchesUserDoc: userCompanyDoc === params.companyId,
      },
    });
  } catch (e) {
    console.warn('[GUICHET_FINANCE_DEBUG] unable to resolve auth debug:', e);
  }
}

async function validateEscaleAgentReservation(
  companyId: string,
  agencyId: string,
  depart: string,
  arrivee: string,
  tripInstanceId?: string | null
): Promise<void> {
  const agencyRef = doc(db, 'companies', companyId, 'agences', agencyId);
  const agencySnap = await getDoc(agencyRef);
  if (!agencySnap.exists()) return;
  const ad = agencySnap.data() as { type?: string; routeId?: string; stopOrder?: number; stopId?: string };
  const typ = (ad.type ?? 'principale').toLowerCase();
  if (typ !== 'escale' || !ad.routeId) return;

  const routeId = ad.routeId;
  if (ad.stopId && ad.stopOrder != null && !Number.isNaN(Number(ad.stopOrder))) {
    await warnIfStopIdOrderMismatch(companyId, routeId, ad.stopId, Number(ad.stopOrder));
  }
  let stopOrder = ad.stopOrder != null ? Number(ad.stopOrder) : null;
  if ((stopOrder == null || Number.isNaN(stopOrder)) && ad.stopId) {
    const byId = await resolveStopByStopId(companyId, routeId, String(ad.stopId));
    if (byId) stopOrder = byId.order;
  }
  if (stopOrder == null || Number.isNaN(stopOrder)) return;

  const originStop = await getStopByOrder(companyId, routeId, stopOrder);
  if (!originStop) throw new Error('Configuration escale invalide : stop introuvable.');
  const allowedOrigin = (originStop.city ?? '').trim().toLowerCase();
  const departNorm = (depart ?? '').trim().toLowerCase();
  if (departNorm !== allowedOrigin) {
    throw new Error(`Vente depuis l'escale uniquement : le départ doit être ${originStop.city}.`);
  }

  const destinations = await getEscaleDestinations(companyId, routeId, stopOrder);
  const allowedCities = destinations.map((s) => (s.city ?? '').trim().toLowerCase()).filter(Boolean);
  const arriveeNorm = (arrivee ?? '').trim().toLowerCase();
  if (!allowedCities.includes(arriveeNorm)) {
    throw new Error('Destination non autorisée pour cette escale (villes suivantes avec descente autorisée).');
  }

  if (tripInstanceId) {
    const tiRef = doc(db, 'companies', companyId, 'tripInstances', tripInstanceId);
    const tiSnap = await getDoc(tiRef);
    if (tiSnap.exists()) {
      const ti = tiSnap.data() as { routeId?: string | null };
      if (ti.routeId != null && ti.routeId !== routeId) {
        throw new Error('Ce trajet ne correspond pas à l\'escale de cette agence.');
      }
    }
  }
}

type GuichetCashSessionPlan =
  | { kind: 'update'; ref: any; updates: Record<string, unknown> }
  | { kind: 'create'; ref: any; sessionData: Record<string, unknown> };

async function planGuichetCashSessionExpectedAmount(
  companyId: string,
  agencyId: string,
  agentId: string,
  amount: number,
  paymentMethod: CashPaymentMethod
): Promise<GuichetCashSessionPlan> {
  const cashSessionsRef = collection(db, 'companies', companyId, 'agences', agencyId, CASH_SESSION_COLLECTION);
  const q = query(
    cashSessionsRef,
    where('agentId', '==', agentId),
    where('type', '==', CASH_SESSION_TYPE.GUICHET),
    where('status', '==', CASH_SESSION_STATUS.OPEN),
    limit(1)
  );

  const snap = await getDocs(q);

  const updates: Record<string, unknown> = {

    expectedBalance: increment(amount),
    updatedAt: serverTimestamp(),
  };

  if (paymentMethod === 'cash') {
    updates.expectedCash = increment(amount);
  } else if (paymentMethod === 'mobile_money') {
    updates.expectedMobileMoney = increment(amount);
  } else if (paymentMethod === 'bank') {
    updates.expectedBank = increment(amount);
  }

  if (!snap.empty) {
    return { kind: 'update', ref: snap.docs[0].ref, updates };
  }

  const now = Timestamp.now();
  const sessionRef = doc(cashSessionsRef);
  const sessionData: Record<string, unknown> = {
    agentId,
    type: CASH_SESSION_TYPE.GUICHET,
    openedAt: now,
    openingBalance: 0,
    expectedBalance: amount,
    expectedCash: paymentMethod === 'cash' ? amount : 0,
    expectedMobileMoney: paymentMethod === 'mobile_money' ? amount : 0,
    expectedBank: paymentMethod === 'bank' ? amount : 0,
    status: CASH_SESSION_STATUS.OPEN,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  return { kind: 'create', ref: sessionRef, sessionData };
}

function applyGuichetCashSessionExpectedAmountPlan(
  tx: any,
  plan: GuichetCashSessionPlan
): void {
  if (plan.kind === 'update') {
    tx.update(plan.ref, plan.updates);
  } else {
    tx.set(plan.ref, plan.sessionData);
  }
}


/**
 * 🔐 Récupère et valide l'utilisateur authentifié
 */
function getAuthenticatedUser(): { uid: string; displayName: string | null } {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('AUTH_REQUIRED: Utilisateur non authentifié');
  }
  return {
    uid: currentUser.uid,
    displayName: currentUser.displayName,
  };
}

function validateUserMatch(paramsUserId: string, authenticatedUid: string): void {
  if (authenticatedUid !== paramsUserId) {
    console.error('[SECURITY] User mismatch', {
      paramsUserId,
      authenticatedUid,
    });
    throw new Error('SECURITY: L\'utilisateur ne correspond pas à la session authentifiée');
  }
}

/**
 * Valide et confirme un paiement guichet en respectant les règles Firestore
 */
async function validateAndConfirmGuichetPayment(
  companyId: string,
  paymentId: string,
  reservationId: string,
  agencyId: string,
  amount: number,
  sessionId: string,
  currentUid: string
): Promise<void> {
  const paymentRef = doc(db, 'companies', companyId, 'payments', paymentId);
  const paymentSnap = await getDoc(paymentRef);
  
  if (!paymentSnap.exists()) {
    throw new Error('Paiement introuvable');
  }
  
  const paymentData = paymentSnap.data();
  
  if (paymentData.status !== 'pending') {
    console.log('[validateAndConfirmGuichetPayment] Payment already processed', { status: paymentData.status });
    return;
  }
  
  if (paymentData.channel !== 'guichet') {
    throw new Error(`Channel invalide pour validation guichet: ${paymentData.channel}`);
  }
  
  await updateDoc(paymentRef, {
    status: 'validated',
    validatedBy: currentUid,
    validatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  
  console.log('[validateAndConfirmGuichetPayment] Payment validated successfully', {
    paymentId,
    validatedBy: currentUid,
  });
}

/**
 * 🔐 Clôture une session guichet
 * Seul le guichetier propriétaire de la session peut la clôturer
 * Met à jour UNIQUEMENT le status et updatedAt pour respecter les règles Firestore
 */
export async function closeGuichetSession(
  companyId: string,
  agencyId: string,
  sessionId: string
): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    throw new Error('Non authentifié');
  }

  const shiftRef = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${sessionId}`);
  const shiftSnap = await getDoc(shiftRef);
  
  if (!shiftSnap.exists()) {
    throw new Error('Session introuvable');
  }
  
  const shiftData = shiftSnap.data();
  const sessionOwnerId = shiftData?.userId;
  const currentStatus = shiftData?.status;
  
  console.log('[closeGuichetSession] Vérification session', {
    sessionId,
    sessionOwnerId,
    currentStatus,
    currentUid,
    isOwner: sessionOwnerId === currentUid,
  });
  
  // Vérification que c'est bien ta session
  if (sessionOwnerId !== currentUid) {
    throw new Error('Vous ne pouvez clôturer que votre propre session');
  }
  
  // Vérification que la session est active
  if (currentStatus !== 'active') {
    throw new Error(`Impossible de clôturer: statut actuel = ${currentStatus}`);
  }
  
  // 🔑 SOLUTION: Mettre à jour UNIQUEMENT le status et updatedAt
  // Ne pas ajouter closedBy, closedAt, cashStatus, etc. car les règles les refusent
  await updateDoc(shiftRef, {
    status: 'closed',
    updatedAt: serverTimestamp(),
  });
  
  console.log('✅ Session clôturée avec succès', { sessionId });
}

/**
 * Crée une réservation guichet : seule voie autorisée (transaction + session ouverte + agent = titulaire du poste).
 * Idempotence : même `idempotencyKey` → retourne la réservation déjà créée.
 * 
 * 🔐 SECURITE: 
 * - L'identité réelle de l'agent vient de auth.currentUser.uid
 * - Le paramètre userId est validé contre cette source
 * - Tous les champs d'audit utilisent auth.currentUser.uid
 */
export async function createGuichetReservation(
  params: CreateGuichetReservationParams,
  options?: { deviceFingerprint?: string | null }
): Promise<string> {
  const authenticatedUser = getAuthenticatedUser();
  const currentUid = authenticatedUser.uid;
  
  validateUserMatch(params.userId, currentUid);
  
  console.log('[createGuichetReservation] Authentication validated', {
    authenticatedUid: currentUid,
    paramsUserId: params.userId,
  });
  
  assertGuichetReservationCreateInput(params);
  await validateEscaleAgentReservation(
    params.companyId,
    params.agencyId,
    params.depart,
    params.arrivee,
    params.tripInstanceId ?? null
  );

  let originStopOrder: number | null = params.originStopOrder ?? null;
  let destinationStopOrder: number | null = params.destinationStopOrder ?? null;
  let originStopId: string | null = params.originStopId ?? null;
  let destinationStopId: string | null = params.destinationStopId ?? null;
  const needJourneyResolution =
    params.tripInstanceId &&
    (originStopOrder == null ||
      destinationStopOrder == null ||
      originStopId == null ||
      destinationStopId == null);
  if (needJourneyResolution && params.tripInstanceId) {
    const ti = await getTripInstance(params.companyId, params.tripInstanceId);
    const routeId = (ti as { routeId?: string | null })?.routeId ?? null;
    if (routeId) {
      const resolved = await resolveJourneyStopIdsFromCities(
        params.companyId,
        routeId,
        params.depart,
        params.arrivee
      );
      if (resolved) {
        originStopOrder = originStopOrder ?? resolved.originStopOrder;
        destinationStopOrder = destinationStopOrder ?? resolved.destinationStopOrder;
        originStopId = originStopId ?? resolved.originStopId;
        destinationStopId = destinationStopId ?? resolved.destinationStopId;
      }
    }
  }

  let tripInstanceIdForHold = params.tripInstanceId ?? null;
  if (tripInstanceIdForHold == null && params.trajetId && String(params.trajetId).includes('_')) {
    const parts = String(params.trajetId).split('_');
    if (parts.length >= 3) {
      const [, date, timePart] = parts;
      const time = timePart?.replace('-', ':') ?? '';
      const ti = await findTripInstanceBySlot(
        params.companyId,
        params.agencyId,
        date,
        time,
        params.depart,
        params.arrivee
      );
      if (ti) tripInstanceIdForHold = ti.id;
    }
  }

  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const montant = Number(params.montant ?? 0);
  const shiftRef = doc(db, `${base}/shifts/${params.sessionId}`);
  const agencyRef = doc(db, `companies/${params.companyId}/agences/${params.agencyId}`);
  const companyRef = doc(db, 'companies', params.companyId);
  const idemRef = doc(db, `${base}/guichetSaleLocks/${params.idempotencyKey}`);
  const colRef = collection(db, `${base}/reservations`);
  const newRef = doc(colRef);
  const newId = newRef.id;
  const now = Timestamp.now();

  const phoneOriginal = params.telephoneOriginal ?? params.telephone;
  const phoneNormalized = normalizePhone(phoneOriginal || params.telephone || '');
  
  const payload: Record<string, unknown> = {
    trajetId: params.trajetId,
    date: params.date,
    heure: params.heure,
    depart: params.depart,
    arrivee: params.arrivee,
    ...(originStopOrder != null && { originStopOrder }),
    ...(destinationStopOrder != null && { destinationStopOrder }),
    ...(originStopId != null && String(originStopId).trim() !== '' && { originStopId: String(originStopId).trim() }),
    ...(destinationStopId != null &&
      String(destinationStopId).trim() !== '' && { destinationStopId: String(destinationStopId).trim() }),
    nomClient: params.nomClient,
    telephone: params.telephone,
    telephoneOriginal: phoneOriginal || null,
    telephoneNormalized: phoneNormalized || null,
    email: null,
    seatsGo: params.seatsGo,
    seatsReturn: params.seatsReturn,
    montant: params.montant,
    statut: 'paye',
    statutEmbarquement: 'en_attente',
    boardingStatus: 'pending',
    dropoffStatus: 'pending',
    journeyStatus: 'booked',
    checkInTime: null,
    reportInfo: null,
    compagnieId: params.companyId,
    companyId: params.companyId,
    agencyId: params.agencyId,
    companySlug: params.companySlug,
    compagnieNom: params.compagnieNom,
    agencyNom: params.agencyNom,
    agencyTelephone: params.agencyTelephone ?? null,
    canal: 'guichet',
    paymentChannel: 'guichet',
    paiement: params.paymentMethod === 'mobile_money' ? 'mobile_money' : params.paymentMethod === 'bank' ? 'virement' : 'espèces',
    paymentMethod: params.paymentMethod ?? 'cash',
    paiementSource: 'encaisse_guichet',
    agentId: currentUid,
    createdBy: currentUid,
    guichetierId: currentUid,
    guichetierCode: params.userCode,
    sessionId: params.sessionId,
    idempotencyKey: params.idempotencyKey,
    referenceCode: params.referenceCode,
    qrCode: newId,
    tripType: params.tripType,
    createdAt: now,
    createdByUid: currentUid,
    paymentStatus: 'paid',
    paymentId: null,
    creationMode: params.offlineMeta?.mode ?? 'online',
    offlineTransactionId: params.offlineMeta?.transactionId ?? null,
    offlineDeviceId: params.offlineMeta?.deviceId ?? null,
    offlineCreatedAt: params.offlineMeta?.createdAt ?? null,
    ...(tripInstanceIdForHold != null && { tripInstanceId: tripInstanceIdForHold }),
  };

  let resultReservationId = newId;
  let isNewReservation = true;
  const operationPlans = await loadOperationPlanSettings();

  console.log("🚀 START reservation creation", {
    companyId: params.companyId,
    agencyId: params.agencyId,
    authenticatedAgent: currentUid,
  });

  try {
    await runTransaction(db, async (tx) => {
      const idemSnap = await tx.get(idemRef);
      if (idemSnap.exists()) {
        const prev = String((idemSnap.data() as { reservationId?: string }).reservationId ?? '').trim();
        if (prev) {
          resultReservationId = prev;
          isNewReservation = false;
          return;
        }
      }

      const [shiftSnap, agencySnap] = await Promise.all([tx.get(shiftRef), tx.get(agencyRef)]);
      if (!shiftSnap.exists()) {
        throw new Error(`${GUICHET_SESSION_INVARIANT_PREFIX} Poste introuvable.`);
      }
      const shiftData = shiftSnap.data() as Record<string, unknown>;
      const sessionOwnerId = String(
        shiftData.userId ?? shiftData.guichetierId ?? shiftData.openedById ?? shiftData.openedBy ?? ''
      ).trim();
      
      if (sessionOwnerId !== currentUid) {
        console.error('[SECURITY] Session owner mismatch', {
          sessionOwnerId,
          authenticatedUid: currentUid,
        });
        throw new Error(`${GUICHET_SESSION_INVARIANT_PREFIX} L'agent ne correspond pas au titulaire du poste.`);
      }
      
      const status = String(shiftData.status ?? '');
      if (status !== SHIFT_STATUS.ACTIVE) {
        if (status === SHIFT_STATUS.PAUSED) {
          throw new Error('Le poste est en pause. Reprenez la session pour enregistrer une vente.');
        }
        throw new Error(
          `${GUICHET_SESSION_INVARIANT_PREFIX} Le poste n'est pas ouvert pour la vente (statut: ${status}).`
        );
      }
      if (isShiftLocked(status)) throw new Error('Poste verrouillé.');
      if (shiftData.deviceFingerprint && options?.deviceFingerprint && shiftData.deviceFingerprint !== options.deviceFingerprint) {
        throw new Error('Session ouverte sur un autre appareil.');
      }
      // Phase READS : toutes les lectures tx.get doivent être terminées AVANT le premier write transactionnel
      const passengers = 1;
      const seats = (params.seatsGo ?? 0) + (params.seatsReturn ?? 0);

      let tiRef: ReturnType<typeof tripInstanceRef> | null = null;
      let tiSnap: any = null;
      if (tripInstanceIdForHold && seats > 0) {
        tiRef = tripInstanceRef(params.companyId, tripInstanceIdForHold);
        tiSnap = await tx.get(tiRef);
      }

      // cashPlan est un plan construit via tx.get (reads-only)
      let cashPlan: GuichetCashSessionPlan | null = null;
      if (montant > 0) {
        // Hors transaction: lecture standard pour éviter toute dépendance à un tx.get fragile.
        cashPlan = await planGuichetCashSessionExpectedAmount(
          params.companyId,
          params.agencyId,
          currentUid,
          montant,
          params.paymentMethod ?? 'cash'
        );

      }


      // Phase WRITES : à partir d’ici, aucun tx.get ne doit être exécuté
      await assertAndIncrementOperationInTransaction(tx, companyRef, operationPlans);

      if (tiRef && tiSnap) {
        bookSeatsOnTripInstanceInTransaction(tx, tiRef, tiSnap, seats, {
          originStopOrder: originStopOrder ?? undefined,
          destinationStopOrder: destinationStopOrder ?? undefined,
          depart: params.depart,
          arrivee: params.arrivee,
        });
      }

      // Writes reservation + cash session updates + logs + dailyStats
      tx.set(newRef, payload);
      if (cashPlan) {
        applyGuichetCashSessionExpectedAmountPlan(tx, cashPlan);
      }


      console.log("✅ RESERVATION CREATED");
      writeTicketGuichetActivityInTransaction(tx, {
        companyId: params.companyId,
        agencyId: params.agencyId,
        reservationId: newId,
        amount: params.montant,
        seats: (params.seatsGo ?? 0) + (params.seatsReturn ?? 0),
        createdAt: now,
        depart: params.depart,
        arrivee: params.arrivee,
      });
      tx.set(idemRef, {
        reservationId: newId,
        sessionId: params.sessionId,
        agentId: currentUid,
        createdAt: serverTimestamp(),
      });
      const agencyTz = dailyStatsTimezoneFromAgencyData(agencySnap.data() as { timezone?: string } | undefined);
      updateDailyStatsOnReservationCreated(tx, params.companyId, params.agencyId, params.date, passengers, seats, agencyTz);
    });
  } catch (e) {
    console.error("❌ TRANSACTION ERROR", e);
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith(GUICHET_SESSION_INVARIANT_PREFIX)) {
      void logGuichetSessionInconsistency({
        companyId: params.companyId,
        sessionId: params.sessionId,
        agentId: currentUid,
        reason: msg,
      });
    }
    throw e;
  }

  const reservationDocRef = doc(db, `${base}/reservations/${resultReservationId}`);

  if (!isNewReservation) {
    return resultReservationId;
  }

  if (montant > 0) {
    try {
      console.log("[createGuichetReservation] Processing payment", {
        reservationId: resultReservationId,
        amount: montant,
        authenticatedAgent: currentUid,
      });

      const provider = params.paymentMethod === 'mobile_money' ? 'wave' : (params.paymentMethod === 'bank' ? 'wave' : 'cash');
      const paymentMethodLedger = params.paymentMethod === 'mobile_money'
        ? 'mobile_money'
        : params.paymentMethod === 'bank'
          ? 'card'
          : 'cash';
      
      console.warn('[FINANCE_WRITE_ATTEMPT]', {
        target: 'createPayment',
        companyId: params.companyId,
        agencyId: params.agencyId,
        uid: currentUid,
        role: 'unknown',
      });

      const paymentId = await createPayment({
        reservationId: resultReservationId,
        companyId: params.companyId,
        agencyId: params.agencyId,
        amount: montant,
        currency: 'XOF',
        channel: 'guichet',
        provider,
        status: 'pending',
      }).catch((e) => {
        console.error('[FINANCE_WRITE_FAILED]', {
          target: 'createPayment',
          path: `companies/${params.companyId}/payments/*` ,
          companyId: params.companyId,
          agencyId: params.agencyId,
          uid: currentUid,
          error: e,
        });
        throw e;
      });

      console.warn('[FINANCE_WRITE_ATTEMPT]', {
        target: 'validateAndConfirmGuichetPayment',
        companyId: params.companyId,
        agencyId: params.agencyId,
        uid: currentUid,
        role: 'unknown',
      });

      await validateAndConfirmGuichetPayment(
        params.companyId,
        paymentId,
        resultReservationId,
        params.agencyId,
        montant,
        params.sessionId,
        currentUid
      ).catch((e) => {
        console.error('[FINANCE_WRITE_FAILED]', {
          target: 'validateAndConfirmGuichetPayment',
          path: `companies/${params.companyId}/payments/${paymentId}`,
          companyId: params.companyId,
          agencyId: params.agencyId,
          uid: currentUid,
          error: e,
        });
        throw e;
      });

      // NOTE PRODUCT/SECURITY:
      // Do NOT patch `companies/.../reservations/{reservationId}` after payment validation.
      // The validated payment is source of truth in `companies/{companyId}/payments/{paymentId}`.
      // This late update is fragile under current Firestore permissions and breaks guichet sales.
      console.warn('[FINANCE_WRITE_SKIPPED]', {
        target: 'updateDoc(reservation.payment) after validateAndConfirmGuichetPayment()',
        companyId: params.companyId,
        agencyId: params.agencyId,
        uid: currentUid,
        path: `companies/${params.companyId}/agences/${params.agencyId}/reservations/${resultReservationId}`,
      });

      console.warn('[FINANCE_WRITE_ATTEMPT]', {
        target: 'logAgentHistoryEvent',
        companyId: params.companyId,
        agencyId: params.agencyId,
        uid: currentUid,
        role: 'unknown',
        path: `companies/${params.companyId}/*` ,
      });

      await (async () => {
        logAgentHistoryEvent({
          companyId: params.companyId,
          agencyId: params.agencyId,
          agentId: currentUid,
          agentName: authenticatedUser.displayName ?? null,
          role: 'guichetier',
          type: 'PAYMENT_RECEIVED',
          referenceId: resultReservationId,
          amount: montant,
          status: 'VALIDE',
          createdBy: currentUid,
          metadata: {
            paymentMethod: paymentMethodLedger,
            sessionId: params.sessionId,
            paymentId,
          },
        });
      })().catch((e) => {
        console.error('[FINANCE_WRITE_FAILED]', {
          target: 'logAgentHistoryEvent',
          path: `companies/${params.companyId}/agences/${params.agencyId}/*`,
          companyId: params.companyId,
          agencyId: params.agencyId,
          uid: currentUid,
          error: e,
        });
        throw e;
      });
      
      console.log('[createGuichetReservation] Payment completed successfully', { paymentId });
    } catch (err) {
      console.error('[guichetReservationService] financial side-effects failed:', err);

      // Extra diagnostics: identify which financial write failed (payment vs ledger) and under which tenant/role.
      try {
        const e = err as any;
        const code = e?.code;
        const message = e instanceof Error ? e.message : String(e);
        console.warn('[GUICHET_FINANCE_DEBUG:DETAILS]', {
          code,
          message,
          companyId: params.companyId,
          agencyId: params.agencyId,
          authenticatedUid: currentUid,
        });
      } catch {
        // ignore diagnostics failures
      }

      await logGuichetFinanceAuthDebug({
        companyId: params.companyId,
        agencyId: params.agencyId,
        userId: currentUid,
      });

      await updateDoc(reservationDocRef, {
        statut: 'finance_side_effects_failed',
        paymentStatus: 'finance_side_effects_failed',
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      // Reservation creation must not fail when ledger/payment side-effects are blocked by security rules.
      // The UI will show finance_side_effects_failed and comptability backoffice can reconcile later.
      return resultReservationId;
    }
  }

  const phoneForCrm = phoneOriginal || params.telephone || '';
  if (phoneForCrm) {
    upsertCustomerFromReservation({
      companyId: params.companyId,
      name: params.nomClient || '',
      phone: phoneForCrm,
      email: null,
      montant: params.montant ?? 0,
      departureDate: params.date || '',
    }).catch(() => {});
  }

  void verifyReservationIntegrity(params.companyId, params.agencyId, resultReservationId).catch((err) => {
    // Non-critical debug-only check: never block guichet sale flow.
    console.warn('[guichetReservationService] verifyReservationIntegrity non-blocking failure:', err);
  });
  
  void verifyGlobalReservationConsistency(params.companyId, params.agencyId, resultReservationId).catch((err) => {
    console.debug('[guichetReservationService] Non-critical consistency check warning:', err?.message);
  });

  return resultReservationId;
}

export async function canModifyReservationAmount(
  companyId: string,
  agencyId: string,
  reservationSessionId: string | null
): Promise<boolean> {
  if (!reservationSessionId) return false;
  
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    console.warn('[canModifyReservationAmount] No authenticated user');
    return false;
  }
  
  const shiftRef = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${reservationSessionId}`);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) return false;
  const data = snap.data() as Record<string, unknown>;
  
  const sessionOwnerId = String(data.userId ?? data.guichetierId ?? data.openedById ?? data.openedBy ?? '');
  if (sessionOwnerId !== currentUid) {
    console.warn('[canModifyReservationAmount] User mismatch', {
      sessionOwnerId,
      currentUid,
    });
    return false;
  }
  
  const status = data.status as string;
  return status !== SHIFT_STATUS.CLOSED && status !== SHIFT_STATUS.VALIDATED;
}

export async function updateGuichetReservation(
  companyId: string,
  agencyId: string,
  reservationId: string,
  updates: {
    nomClient?: string;
    telephone?: string | null;
    telephoneOriginal?: string | null;
    telephoneNormalized?: string | null;
    seatsGo?: number;
    seatsReturn?: number;
    montant?: number;
    editReason?: string | null;
  },
  by: { id: string; name?: string | null }
): Promise<void> {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    throw new Error('AUTH_REQUIRED: Utilisateur non authentifié');
  }
  
  if (currentUid !== by.id) {
    console.error('[SECURITY] User mismatch in update', {
      providedId: by.id,
      authenticatedUid: currentUid,
    });
    throw new Error('SECURITY: L\'utilisateur ne correspond pas à la session authentifiée');
  }
  
  const resRef = doc(db, `companies/${companyId}/agences/${agencyId}/reservations/${reservationId}`);
  const resSnap = await getDoc(resRef);
  if (!resSnap.exists()) throw new Error('Réservation introuvable.');
  const data = resSnap.data() as Record<string, unknown>;
  const linkedSessionId =
    String((data.sessionId as string | undefined) ?? (data.shiftId as string | undefined) ?? '').trim() || null;
  const canEditAmount = await canModifyReservationAmount(companyId, agencyId, linkedSessionId);

  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
    editedBy: {
      id: currentUid,
      name: by.name ?? null,
      reason: updates.editReason ?? null,
    },
  };
  if (updates.nomClient !== undefined) patch.nomClient = updates.nomClient;
  if (updates.telephone !== undefined) {
    patch.telephone = updates.telephone;
    const orig = updates.telephoneOriginal ?? updates.telephone;
    patch.telephoneOriginal = orig ?? null;
    patch.telephoneNormalized = normalizePhone(orig || '') || null;
  }
  if (updates.telephoneOriginal !== undefined) patch.telephoneOriginal = updates.telephoneOriginal;
  if (updates.telephoneNormalized !== undefined) patch.telephoneNormalized = updates.telephoneNormalized;
  if (updates.seatsGo !== undefined) patch.seatsGo = Math.max(1, updates.seatsGo);
  if (updates.seatsReturn !== undefined) patch.seatsReturn = Math.max(0, updates.seatsReturn);
  if (updates.montant !== undefined) {
    if (!canEditAmount) throw new Error('Impossible de modifier le montant : session clôturée ou validée.');
    patch.montant = Math.max(0, updates.montant);
  }

  await updateDoc(resRef, patch);
}