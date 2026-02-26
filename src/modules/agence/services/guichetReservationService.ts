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
import { SHIFT_STATUS, isShiftLocked } from '../constants/sessionLifecycle';
import { updateDailyStatsOnReservationCreated } from '../aggregates/dailyStats';

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
  seatsGo: number;
  seatsReturn: number;
  montant: number;
  companySlug: string;
  compagnieNom: string;
  agencyNom: string;
  agencyTelephone?: string | null;
  referenceCode: string;
  tripType: string;
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
 * Crée une réservation guichet avec tous les champs d'audit et de traçabilité.
 * En ligne : transaction (vérification session + écriture). Hors ligne : setDoc mis en file pour sync.
 */
export async function createGuichetReservation(
  params: CreateGuichetReservationParams,
  options?: { deviceFingerprint?: string | null }
): Promise<string> {
  const base = `companies/${params.companyId}/agences/${params.agencyId}`;
  const shiftRef = doc(db, `${base}/shifts/${params.sessionId}`);
  const colRef = collection(db, `${base}/reservations`);
  const newRef = doc(colRef);
  const newId = newRef.id;
  const now = Timestamp.now();

  const payload = {
    trajetId: params.trajetId,
    date: params.date,
    heure: params.heure,
    depart: params.depart,
    arrivee: params.arrivee,
    nomClient: params.nomClient,
    telephone: params.telephone,
    email: null,
    seatsGo: params.seatsGo,
    seatsReturn: params.seatsReturn,
    montant: params.montant,
    statut: 'paye',
    statutEmbarquement: 'en_attente',
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
    paiement: 'espèces',
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
  if (updates.telephone !== undefined) patch.telephone = updates.telephone;
  if (updates.seatsGo !== undefined) patch.seatsGo = Math.max(1, updates.seatsGo);
  if (updates.seatsReturn !== undefined) patch.seatsReturn = Math.max(0, updates.seatsReturn);
  if (updates.montant !== undefined) {
    if (!canEditAmount) throw new Error('Impossible de modifier le montant : session clôturée ou validée.');
    patch.montant = Math.max(0, updates.montant);
  }

  await updateDoc(resRef, patch);
}
