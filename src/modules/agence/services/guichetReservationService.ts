/**
 * Service des réservations guichet (Phase 1 — Stabilisation).
 * Création avec sessionId / agencyId / userId et champs d'audit.
 * Aucune logique financière dans les composants UI.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { normalizePhone } from '@/utils/phoneUtils';
import { SHIFT_STATUS, isShiftLocked } from '../constants/sessionLifecycle';
import { updateDailyStatsOnReservationCreated } from '../aggregates/dailyStats';
import { upsertCustomerFromReservation } from '@/modules/compagnie/crm/customerService';
import { addToExpectedBalance } from '@/modules/agence/cashControl/cashSessionService';
import type { CashPaymentMethod } from '@/modules/agence/cashControl/cashSessionTypes';
import { incrementReservedSeats, findTripInstanceBySlot, getTripInstance } from '@/modules/compagnie/tripInstances/tripInstanceService';
import { getStopByOrder, getEscaleDestinations } from '@/modules/compagnie/routes/routeStopsService';
import { getStopOrdersFromCities } from '@/modules/compagnie/tripInstances/segmentOccupancyService';
import { createCashTransaction } from '@/modules/compagnie/cash/cashService';
import { LOCATION_TYPE } from '@/modules/compagnie/cash/cashTypes';
import { getTodayBamako } from '@/shared/date/dateUtilsTz';

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
};

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

  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/shifts/${params.sessionId}`);
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
    ...(params.tripInstanceId != null && { tripInstanceId: params.tripInstanceId }),
  };

  try {
    await runTransaction(db, async (tx) => {
      const shiftSnap = await tx.get(shiftRef);
      if (!shiftSnap.exists()) throw new Error('Poste introuvable.');
      const shiftData = shiftSnap.data() as Record<string, unknown>;
      const status = shiftData.status as string;
      if (status !== 'active' && status !== 'paused') {
        throw new Error('Le poste doit être actif pour enregistrer une vente.');
      }
      if (isShiftLocked(status)) throw new Error('Poste verrouillé.');
      if (shiftData.deviceFingerprint && options?.deviceFingerprint && shiftData.deviceFingerprint !== options.deviceFingerprint) {
        throw new Error('Session ouverte sur un autre appareil.');
      }
      tx.set(newRef, payload);
      const passengers = 1;
      const seats = (params.seatsGo ?? 0) + (params.seatsReturn ?? 0);
      updateDailyStatsOnReservationCreated(tx, params.companyId, params.agencyId, params.date, passengers, seats);
    });
  } catch (e) {
    if (isOfflineError(e)) {
      await setDoc(newRef, payload);
    } else {
      throw e;
    }
  }

  const seats = (params.seatsGo ?? 0) + (params.seatsReturn ?? 0);
  let tripInstanceId = params.tripInstanceId ?? null;
  if (tripInstanceId == null && params.trajetId && String(params.trajetId).includes('_')) {
    const parts = String(params.trajetId).split('_');
    if (parts.length >= 3) {
      const [wtId, date, timePart] = parts;
      const time = timePart?.replace('-', ':') ?? '';
      const ti = await findTripInstanceBySlot(params.companyId, params.agencyId, date, time, params.depart, params.arrivee);
      if (ti) tripInstanceId = ti.id;
    }
  }
  if (tripInstanceId && seats > 0) {
    incrementReservedSeats(params.companyId, tripInstanceId, seats).catch((err) => {
      console.error('[guichetReservationService] incrementReservedSeats failed:', err);
    });
  }

  // Cash control: add ticket amount to open GUICHET cash session for this agent (if any)
  const montant = Number(params.montant ?? 0);
  if (montant > 0) {
    const paymentMethod = params.paymentMethod ?? 'cash';
    addToExpectedBalance(params.companyId, params.agencyId, params.userId, 'GUICHET', montant, paymentMethod).catch(() => {});
  }

  // Caisse TELIYA: enregistrer une cashTransaction et lier à la réservation
  if (montant > 0) {
    try {
      const agencySnap = await getDoc(doc(db, 'companies', params.companyId, 'agences', params.agencyId));
      const agencyType = (agencySnap.data() as { type?: string })?.type?.toLowerCase();
      const locationType = agencyType === 'escale' ? LOCATION_TYPE.ESCALE : LOCATION_TYPE.AGENCE;
      const paymentMethodCash = params.paymentMethod === 'bank' ? 'transfer' : (params.paymentMethod ?? 'cash');
      const cashTxId = await createCashTransaction({
        companyId: params.companyId,
        reservationId: newId,
        tripInstanceId: tripInstanceId ?? undefined,
        amount: montant,
        currency: 'XOF',
        paymentMethod: paymentMethodCash,
        locationType,
        locationId: params.agencyId,
        createdBy: params.userId,
        paidAt: getTodayBamako(),
      });
      await updateDoc(newRef, { cashTransactionId: cashTxId });
    } catch (err) {
      console.error('[guichetReservationService] createCashTransaction failed:', err);
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
