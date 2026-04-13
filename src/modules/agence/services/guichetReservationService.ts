/**
 * Service des réservations guichet (Phase 1 — Stabilisation).
 * Création avec sessionId / agencyId / userId et champs d'audit.
 * Aucune logique financière dans les composants UI.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
  limit,
} from 'firebase/firestore';
import { auth, db } from '@/firebaseConfig';
import { normalizePhone } from '@/utils/phoneUtils';
import { SHIFT_STATUS, isShiftLocked } from '../constants/sessionLifecycle';
import { dailyStatsTimezoneFromAgencyData, updateDailyStatsOnReservationCreated } from '../aggregates/dailyStats';
import { upsertCustomerFromReservation } from '@/modules/compagnie/crm/customerService';
import { addToExpectedBalance } from '@/modules/agence/cashControl/cashSessionService';
import type { CashPaymentMethod } from '@/modules/agence/cashControl/cashSessionTypes';
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
import { createPayment, markPaymentLedgerStatus } from '@/services/paymentService';
import { createFinancialTransaction } from '@/modules/compagnie/treasury/financialTransactions';
import { logAgentHistoryEvent } from '@/modules/agence/services/agentHistoryService';
import { assertReservationChannelInvariantsOnWrite } from '@/modules/agence/guichet/guichetSessionReservationModel';
import { logGuichetSessionInconsistency } from '@/modules/agence/services/guichetSessionInconsistencyLogger';
import { writeTicketGuichetActivityInTransaction } from '@/modules/compagnie/activity/activityLogsService';

const GUICHET_SESSION_INVARIANT_PREFIX = 'GUICHET_SESSION_INVARIANT:';

export type CreateGuichetReservationParams = {
  companyId: string;
  agencyId: string;
  userId: string;
  sessionId: string;
  /** Empêche les doubles encaissements (même clé → même réservation). */
  idempotencyKey: string;
  userCode: string;
  trajetId: string;
  date: string;
  heure: string;
  depart: string;
  arrivee: string;
  nomClient: string;
  telephone: string | null;
  /** Raw input for display; if omitted, telephone is used */
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
  /** Payment method for cash session expected balance (default: cash). */
  paymentMethod?: CashPaymentMethod;
  /** Optional link to trip instance (real execution of the trip). When set, reservation is attached to that instance. */
  tripInstanceId?: string | null;
  /** Segment orders on the route (for segment-based occupancy). When omitted, resolved from route + depart/arrivee when possible. */
  originStopOrder?: number | null;
  destinationStopOrder?: number | null;
  /** Stop Firestore ids (double écriture avec order). */
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

async function verifyGlobalReservationConsistency(
  companyId: string,
  agencyId: string,
  reservationId: string
): Promise<void> {
  const reservationRef = doc(db, `companies/${companyId}/agences/${agencyId}/reservations/${reservationId}`);
  const reservationSnap = await getDoc(reservationRef);
  const reservationExists = reservationSnap.exists();
  const reservation = reservationExists ? (reservationSnap.data() as { paymentId?: string | null }) : null;
  const paymentId = String(reservation?.paymentId ?? '').trim();

  const paymentExists = paymentId
    ? (await getDoc(doc(db, 'companies', companyId, 'payments', paymentId))).exists()
    : false;

  const txSnap = await getDocs(query(
    collection(db, 'companies', companyId, 'financialTransactions'),
    where('reservationId', '==', reservationId),
    where('type', '==', 'payment_received'),
    limit(1)
  ));
  const financialTransactionExists = !txSnap.empty;

  const isConsistent = reservationExists && paymentExists && financialTransactionExists;
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
  if (!isConsistent) {
    console.warn('[guichetReservationService] reservation consistency issue', {
      reservationId,
      reservationExists,
      paymentExists,
      financialTransactionExists,
    });
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

/**
 * Vérifie qu'une agence escale ne vend que depuis son escale vers les destinations autorisées.
 * Lance une erreur si depart/arrivee ne respectent pas les stops (order, dropoffAllowed).
 */
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

/**
 * Crée une réservation guichet : seule voie autorisée (transaction + session ouverte + agent = titulaire du poste).
 * Idempotence : même `idempotencyKey` → retourne la réservation déjà créée.
 */
export async function createGuichetReservation(
  params: CreateGuichetReservationParams,
  options?: { deviceFingerprint?: string | null }
): Promise<string> {
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
  const shiftRef = doc(db, `${base}/shifts/${params.sessionId}`);
  const agencyRef = doc(db, `companies/${params.companyId}/agences/${params.agencyId}`);
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
    agentId: params.userId,
    guichetierId: params.userId,
    guichetierCode: params.userCode,
    sessionId: params.sessionId,
    idempotencyKey: params.idempotencyKey,
    referenceCode: params.referenceCode,
    qrCode: newId,
    tripType: params.tripType,
    createdAt: now,
    createdByUid: params.userId,
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
      const sessionOwnerId = String(shiftData.userId ?? '').trim();
      if (sessionOwnerId !== String(params.userId).trim()) {
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
      const passengers = 1;
      const seats = (params.seatsGo ?? 0) + (params.seatsReturn ?? 0);
      if (tripInstanceIdForHold && seats > 0) {
        const tiRef = tripInstanceRef(params.companyId, tripInstanceIdForHold);
        const tiSnap = await tx.get(tiRef);
        bookSeatsOnTripInstanceInTransaction(tx, tiRef, tiSnap, seats, {
          originStopOrder: originStopOrder ?? undefined,
          destinationStopOrder: destinationStopOrder ?? undefined,
          depart: params.depart,
          arrivee: params.arrivee,
        });
      }
      tx.set(newRef, payload);
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
        agentId: params.userId,
        createdAt: serverTimestamp(),
      });
      const agencyTz = dailyStatsTimezoneFromAgencyData(agencySnap.data() as { timezone?: string } | undefined);
      updateDailyStatsOnReservationCreated(tx, params.companyId, params.agencyId, params.date, passengers, seats, agencyTz);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith(GUICHET_SESSION_INVARIANT_PREFIX)) {
      void logGuichetSessionInconsistency({
        companyId: params.companyId,
        sessionId: params.sessionId,
        agentId: params.userId,
        reason: msg,
      });
    }
    throw e;
  }

  const reservationDocRef = doc(db, `${base}/reservations/${resultReservationId}`);

  if (!isNewReservation) {
    return resultReservationId;
  }

  const montant = Number(params.montant ?? 0);
  if (montant > 0) {
    const paymentMethod = params.paymentMethod ?? 'cash';
    addToExpectedBalance(params.companyId, params.agencyId, params.userId, 'GUICHET', montant, paymentMethod).catch(() => {});
  }

  if (montant > 0) {
    let paymentId: string | null = null;
    try {
      const provider = params.paymentMethod === 'mobile_money' ? 'wave' : (params.paymentMethod === 'bank' ? 'wave' : 'cash');
      const paymentMethodLedger = params.paymentMethod === 'mobile_money'
        ? 'mobile_money'
        : params.paymentMethod === 'bank'
          ? 'card'
          : 'cash';
      paymentId = await createPayment({
        reservationId: resultReservationId,
        companyId: params.companyId,
        agencyId: params.agencyId,
        amount: montant,
        currency: 'XOF',
        channel: 'guichet',
        provider,
        status: 'validated',
        validatedBy: params.userId,
      });
      await Promise.all([
        updateDoc(reservationDocRef, {
          paymentId,
          ledgerStatus: 'pending',
          updatedAt: serverTimestamp(),
        }),
        createFinancialTransaction({
          companyId: params.companyId,
          type: 'payment_received',
          source: 'cash',
          paymentChannel: 'guichet',
          paymentMethod: paymentMethodLedger,
          paymentProvider: provider,
          amount: montant,
          currency: 'XOF',
          agencyId: params.agencyId,
          reservationId: resultReservationId,
          referenceType: 'payment',
          referenceId: paymentId,
          metadata: {
            channel: 'guichet',
            sourceType: 'guichet',
            sourceSessionId: params.sessionId,
            mode: params.offlineMeta?.mode ?? 'online',
            offlineTransactionId: params.offlineMeta?.transactionId ?? null,
            offlineDeviceId: params.offlineMeta?.deviceId ?? null,
            tripInstanceId: tripInstanceIdForHold ?? null,
            seats: (params.seatsGo ?? 0) + (params.seatsReturn ?? 0),
            routeLabel: [params.depart, params.arrivee].filter(Boolean).join('→') || null,
          },
        }),
      ]);
      await markPaymentLedgerStatus({
        companyId: params.companyId,
        paymentId,
        ledgerStatus: 'posted',
      }).catch((statusErr) => {
        console.warn('[guichetReservationService] unable to set payment ledgerStatus=posted:', statusErr);
      });
      await updateDoc(reservationDocRef, {
        ledgerStatus: 'posted',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
      logAgentHistoryEvent({
        companyId: params.companyId,
        agencyId: params.agencyId,
        agentId: params.userId,
        agentName: auth.currentUser?.displayName ?? null,
        role: 'guichetier',
        type: 'PAYMENT_RECEIVED',
        referenceId: resultReservationId,
        amount: montant,
        status: 'VALIDE',
        createdBy: params.userId,
        metadata: {
          paymentMethod: paymentMethodLedger,
          sessionId: params.sessionId,
        },
      });
    } catch (err) {
      console.error('[guichetReservationService] financial side-effects failed:', err);
      if (paymentId) {
        await markPaymentLedgerStatus({
          companyId: params.companyId,
          paymentId,
          ledgerStatus: 'failed',
          errorMessage: err instanceof Error ? err.message : String(err),
        }).catch((statusErr) => {
          console.warn('[guichetReservationService] unable to set payment ledgerStatus=failed:', statusErr);
        });
      }
      await logGuichetFinanceAuthDebug({
        companyId: params.companyId,
        agencyId: params.agencyId,
        userId: params.userId,
      });
      await updateDoc(reservationDocRef, {
        paymentStatus: 'finance_side_effects_failed',
        ledgerStatus: 'failed',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
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
    console.error('[guichetReservationService] verifyReservationIntegrity failed:', err);
  });
  void verifyGlobalReservationConsistency(params.companyId, params.agencyId, resultReservationId).catch((err) => {
    console.error('[guichetReservationService] verifyGlobalReservationConsistency failed:', err);
  });

  return resultReservationId;
}

/**
 * Vérifie si le montant d'une réservation peut encore être modifié (session non clôturée ni validée).
 */
export async function canModifyReservationAmount(
  companyId: string,
  agencyId: string,
  reservationSessionId: string | null
): Promise<boolean> {
  if (!reservationSessionId) return false;
  const shiftRef = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${reservationSessionId}`);
  const snap = await getDoc(shiftRef);
  if (!snap.exists()) return false;
  const data = snap.data() as Record<string, unknown>;
  const status = data.status as string;
  return status !== SHIFT_STATUS.CLOSED && status !== SHIFT_STATUS.VALIDATED;
}

/**
 * Met à jour une réservation (édition). Refuse la modification du montant si la session est CLOSED ou VALIDATED.
 */
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
      id: by.id,
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
