/**
 * Règle métier : une session guichet ne compte que les réservations
 * canal guichet + même vendeur + même session (shift).
 * Les ventes en ligne sont exclues des agrégats de poste.
 */

import {
  collection,
  getDocs,
  limit,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export type ReservationLike = Record<string, unknown>;

/**
 * Lien au poste : `sessionId` est la source de vérité sur les nouvelles ventes.
 * Lecture seule : repli `shiftId` pour les réservations historiques sans `sessionId`.
 */
export function reservationLinkedSessionId(r: ReservationLike): string {
  return String(r.sessionId ?? r.shiftId ?? '').trim();
}

export function reservationAgentId(r: ReservationLike): string {
  return String(r.agentId ?? r.guichetierId ?? r.createdByUid ?? '').trim();
}

export function isOnlinePaymentChannel(r: ReservationLike): boolean {
  const pc = String(r.paymentChannel ?? '').toLowerCase();
  if (pc === 'online' || pc === 'en_ligne') return true;
  const canal = String(r.canal ?? '').toLowerCase().replace(/\s+/g, '_');
  return canal === 'en_ligne' || canal === 'online' || canal === 'web';
}

/** Guichet explicite uniquement (pas de canal vide hérité). */
export function isGuichetPaymentChannel(r: ReservationLike): boolean {
  if (isOnlinePaymentChannel(r)) return false;
  const pc = String(r.paymentChannel ?? '').toLowerCase();
  if (pc === 'guichet') return true;
  const canal = String(r.canal ?? '').toLowerCase().replace(/\s+/g, '_');
  return canal === 'guichet';
}

/**
 * Réservations liées au poste : `sessionId` (actuel) ou `shiftId` (historique), dédupliquées par id doc.
 */
export async function fetchReservationDocsForShiftSlot(
  companyId: string,
  agencyId: string,
  shiftId: string,
  opts?: { perQueryLimit?: number }
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const lim = opts?.perQueryLimit ?? 500;
  const rRef = collection(db, `companies/${companyId}/agences/${agencyId}/reservations`);
  const [a, b] = await Promise.all([
    getDocs(query(rRef, where('sessionId', '==', shiftId), limit(lim))),
    getDocs(query(rRef, where('shiftId', '==', shiftId), limit(lim))),
  ]);
  const byId = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const d of [...a.docs, ...b.docs]) {
    if (!byId.has(d.id)) byId.set(d.id, d);
  }
  return [...byId.values()];
}

export function belongsToGuichetSession(
  r: ReservationLike,
  sessionId: string,
  agentId: string
): boolean {
  if (!sessionId || !agentId) return false;
  if (!isGuichetPaymentChannel(r)) return false;
  if (reservationLinkedSessionId(r) !== sessionId) return false;
  if (reservationAgentId(r) !== agentId) return false;
  return true;
}

export function filterGuichetSessionReservations<T extends ReservationLike>(
  reservations: T[],
  sessionId: string,
  agentId: string
): T[] {
  return reservations.filter((r) => belongsToGuichetSession(r, sessionId, agentId));
}

export type GuichetSessionTotals = {
  totalReservations: number;
  tickets: number;
  totalSalesAmount: number;
  cashExpected: number;
  mmExpected: number;
};

export function computeGuichetSessionTotals(reservations: ReservationLike[]): GuichetSessionTotals {
  let totalReservations = 0;
  let tickets = 0;
  let totalSalesAmount = 0;
  let cashExpected = 0;
  let mmExpected = 0;
  for (const r of reservations) {
    totalReservations += 1;
    tickets += Number(r.seatsGo ?? 0) + Number(r.seatsReturn ?? 0);
    const m = Number(r.montant ?? 0);
    totalSalesAmount += m;
    const pay = String(r.paiement ?? '').toLowerCase();
    if (pay.includes('esp')) cashExpected += m;
    if (pay.includes('mobile') || pay.includes('mm')) mmExpected += m;
  }
  return { totalReservations, tickets, totalSalesAmount, cashExpected, mmExpected };
}

/** Côté client / services : garde-fous à l’écriture. */
export function assertReservationChannelInvariantsOnWrite(data: {
  paymentChannel?: string;
  agentId?: string;
  sessionId?: string;
  guichetierId?: string;
}): void {
  const pc = String(data.paymentChannel ?? '').toLowerCase();
  if (!pc) return;
  const agent =
    String(data.agentId ?? data.guichetierId ?? '').trim();
  const session = String(data.sessionId ?? '').trim();
  if (pc === 'online' || pc === 'en_ligne') {
    if (agent) throw new Error('Réservation en ligne : vendeur (agent) interdit.');
    if (session) throw new Error('Réservation en ligne : session de poste interdite.');
  }
  if (pc === 'guichet') {
    if (!agent || !session) {
      throw new Error('Réservation guichet : vendeur et session de poste obligatoires.');
    }
  }
}

function isSoldReservationForReporting(statut: unknown): boolean {
  const s = String(statut ?? '').toLowerCase().trim();
  if (s === 'invalide' || s === 'annule' || s === 'annulation_en_attente') return false;
  return s === 'paye' || s === 'payé' || s === 'confirme' || s === 'confirmé';
}

export type AgencyDailyReport = {
  totalTickets: number;
  totalRevenue: number;
  guichetRevenue: number;
  onlineRevenue: number;
};

/**
 * Synthèse jour + agence : tous canaux pour pilotage, avec ventilation guichet / en ligne.
 * Basé sur le champ `montant` des réservations vendues (plafond requêtes : à étendre si besoin).
 */
export async function getAgencyDailyReport(params: {
  companyId: string;
  agencyId: string;
  date: string;
}): Promise<AgencyDailyReport> {
  const rRef = collection(
    db,
    `companies/${params.companyId}/agences/${params.agencyId}/reservations`
  );
  const snap = await getDocs(query(rRef, where('date', '==', params.date), limit(2500)));
  let totalTickets = 0;
  let totalRevenue = 0;
  let guichetRevenue = 0;
  let onlineRevenue = 0;
  for (const d of snap.docs) {
    const r = d.data() as ReservationLike;
    if (!isSoldReservationForReporting(r.statut)) continue;
    const seats = Number(r.seatsGo ?? 0) + Number(r.seatsReturn ?? 0);
    const m = Number(r.montant ?? 0);
    totalTickets += seats;
    totalRevenue += m;
    if (isOnlinePaymentChannel(r)) onlineRevenue += m;
    else if (isGuichetPaymentChannel(r)) guichetRevenue += m;
  }
  return { totalTickets, totalRevenue, guichetRevenue, onlineRevenue };
}
