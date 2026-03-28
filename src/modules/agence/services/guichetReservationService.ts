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
  setDoc,
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
import { getStopOrdersFromCities } from '@/modules/compagnie/tripInstances/segmentOccupancyService';
import { createPayment } from '@/services/paymentService';
import { createFinancialTransaction } from '@/modules/compagnie/treasury/financialTransactions';
import { logAgentHistoryEvent } from '@/modules/agence/services/agentHistoryService';

export type CreateGuichetReservationParams = {
  companyId: string;
  agencyId: string;
  userId: string;
  sessionId: string;
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
  offlineMeta?: {
    mode: "online" | "offline";
    transactionId?: string;
    deviceId?: string;
    createdAt?: number;
  };
};

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

function isOfflineError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const msg = (e as { message?: string }).message ?? '';
  const code = (e as { code?: string }).code ?? '';
  return (
    code === 'unavailable' ||
    code === 'resource-exhausted' ||
    /offline|network|unavailable|failed to get document/i.test(msg)
  );
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
  const ad = agencySnap.data() as { type?: string; routeId?: string; stopOrder?: number };
  const typ = (ad.type ?? 'principale').toLowerCase();
  if (typ !== 'escale' || !ad.routeId || ad.stopOrder == null) return;

  const routeId = ad.routeId;
  const stopOrder = ad.stopOrder;

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
 * Crée une réservation guichet avec tous les champs d'audit et de traçabilité.
 * En ligne : transaction (vérification session + écriture). Hors ligne : setDoc mis en file pour sync.
 * Pour une agence type escale : valide que depart = son escale et arrivee dans les stops autorisés (order > stopOrder, dropoffAllowed).
 */
export async function createGuichetReservation(
  params: CreateGuichetReservationParams,
  options?: { deviceFingerprint?: string | null }
): Promise<string> {
  await validateEscaleAgentReservation(
    params.companyId,
    params.agencyId,
    params.depart,
    params.arrivee,
    params.tripInstanceId ?? null
  );

  let originStopOrder: number | null = params.originStopOrder ?? null;
  let destinationStopOrder: number | null = params.destinationStopOrder ?? null;
  if ((originStopOrder == null || destinationStopOrder == null) && params.tripInstanceId) {
    const ti = await getTripInstance(params.companyId, params.tripInstanceId);
    const routeId = (ti as { routeId?: string | null })?.routeId ?? null;
    if (routeId) {
      const resolved = await getStopOrdersFromCities(
        params.companyId,
        routeId,
        params.depart,
        params.arrivee
      );
      if (resolved) {
        originStopOrder = originStopOrder ?? resolved.originStopOrder;
        destinationStopOrder = destinationStopOrder ?? resolved.destinationStopOrder;
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
  const colRef = collection(db, `${base}/reservations`);
  const newRef = doc(colRef);
  const newId = newRef.id;
  const now = Timestamp.now();

  const phoneOriginal = params.telephoneOriginal ?? params.telephone;
  const phoneNormalized = normalizePhone(phoneOriginal || params.telephone || '');
  const payload = {
    trajetId: params.trajetId,
    date: params.date,
    heure: params.heure,
    depart: params.depart,
    arrivee: params.arrivee,
    ...(originStopOrder != null && { originStopOrder }),
    ...(destinationStopOrder != null && { destinationStopOrder }),
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
    paiement: params.paymentMethod === 'mobile_money' ? 'mobile_money' : params.paymentMethod === 'bank' ? 'virement' : 'espèces',
    paymentMethod: params.paymentMethod ?? 'cash',
    paiementSource: 'encaisse_guichet',
    guichetierId: params.userId,
    guichetierCode: params.userCode,
    shiftId: params.sessionId,
    referenceCode: params.referenceCode,
    qrCode: newId,
    tripType: params.tripType,
    createdAt: now,
    createdInSessionId: params.sessionId,
    createdByUid: params.userId,
    paymentStatus: 'paid',
    paymentId: null,
    creationMode: params.offlineMeta?.mode ?? 'online',
    offlineTransactionId: params.offlineMeta?.transactionId ?? null,
    offlineDeviceId: params.offlineMeta?.deviceId ?? null,
    offlineCreatedAt: params.offlineMeta?.createdAt ?? null,
    ...(tripInstanceIdForHold != null && { tripInstanceId: tripInstanceIdForHold }),
  };

  try {
    await runTransaction(db, async (tx) => {
      const [shiftSnap, agencySnap] = await Promise.all([tx.get(shiftRef), tx.get(agencyRef)]);
      if (!shiftSnap.exists()) throw new Error('Poste introuvable.');
      const shiftData = shiftSnap.data() as Record<string, unknown>;
      const status = shiftData.status as string;
      if (status !== 'active') {
        throw new Error(
          status === 'paused'
            ? 'Le poste est en pause. Reprenez la session pour enregistrer une vente.'
            : 'Le poste doit être en service pour enregistrer une vente.'
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
      const agencyTz = dailyStatsTimezoneFromAgencyData(agencySnap.data() as { timezone?: string } | undefined);
      updateDailyStatsOnReservationCreated(tx, params.companyId, params.agencyId, params.date, passengers, seats, agencyTz);
    });
  } catch (e) {
    if (isOfflineError(e)) {
      await setDoc(newRef, payload);
    } else {
      throw e;
    }
  }

  const seats = (params.seatsGo ?? 0) + (params.seatsReturn ?? 0);
  const tripInstanceId = tripInstanceIdForHold;

  // Cash control: add ticket amount to open GUICHET cash session for this agent (if any)
  const montant = Number(params.montant ?? 0);
  if (montant > 0) {
    const paymentMethod = params.paymentMethod ?? 'cash';
    addToExpectedBalance(params.companyId, params.agencyId, params.userId, 'GUICHET', montant, paymentMethod).catch(() => {});
  }

  // FINANCIAL_TRUTH: 1 vente = 1 encaissement ledger (payment_received).
  if (montant > 0) {
    try {
      const provider = params.paymentMethod === 'mobile_money' ? 'wave' : (params.paymentMethod === 'bank' ? 'wave' : 'cash');
      const paymentMethodLedger = params.paymentMethod === 'mobile_money'
        ? 'mobile_money'
        : params.paymentMethod === 'bank'
          ? 'card'
          : 'cash';
      const paymentId = await createPayment({
        reservationId: newId,
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
        updateDoc(newRef, {
          paymentId,
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
          reservationId: newId,
          referenceType: 'payment',
          referenceId: newId,
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
      logAgentHistoryEvent({
        companyId: params.companyId,
        agencyId: params.agencyId,
        agentId: params.userId,
        agentName: auth.currentUser?.displayName ?? null,
        role: 'guichetier',
        type: 'PAYMENT_RECEIVED',
        referenceId: newId,
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
      await logGuichetFinanceAuthDebug({
        companyId: params.companyId,
        agencyId: params.agencyId,
        userId: params.userId,
      });
      // Ne pas bloquer la vente guichet si le ledger/paiement n'est pas autorisé.
      // La réservation reste créée; la correction financière peut être rejouée plus tard.
      await updateDoc(newRef, {
        paymentStatus: 'finance_side_effects_failed',
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }
  }

  // CRM: sync customer (find by phone, create or update stats) — non-blocking, no breaking change
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

  // Non-bloquant: ne pas retarder l'affichage du ticket côté guichet.
  // Les contrôles d'intégrité restent exécutés, mais en arrière-plan.
  void verifyReservationIntegrity(params.companyId, params.agencyId, newId).catch((err) => {
    console.error('[guichetReservationService] verifyReservationIntegrity failed:', err);
  });
  void verifyGlobalReservationConsistency(params.companyId, params.agencyId, newId).catch((err) => {
    console.error('[guichetReservationService] verifyGlobalReservationConsistency failed:', err);
  });

  return newId;
}

/**
 * Vérifie si le montant d'une réservation peut encore être modifié (session non clôturée ni validée).
 */
export async function canModifyReservationAmount(
  companyId: string,
  agencyId: string,
  reservationShiftId: string | null
): Promise<boolean> {
  if (!reservationShiftId) return false;
  const shiftRef = doc(db, `companies/${companyId}/agences/${agencyId}/shifts/${reservationShiftId}`);
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
  const shiftId = data.shiftId as string | null;
  const canEditAmount = await canModifyReservationAmount(companyId, agencyId, shiftId);

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
