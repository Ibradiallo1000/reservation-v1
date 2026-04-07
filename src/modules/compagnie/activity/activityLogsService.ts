/**
 * Journal d’activité commercial persisté (hors ledger).
 * Une écriture = un événement métier (billet guichet, billet en ligne, colis payé).
 */
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  type Transaction,
  type QueryDocumentSnapshot,
  type DocumentData,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export const ACTIVITY_LOG_COLLECTION = "activityLogs";

export type ActivityLogType = "ticket" | "online" | "courier";
export type ActivityLogSource = "guichet" | "online";

export type ActivityLogDoc = {
  type: ActivityLogType;
  source: ActivityLogSource;
  amount: number;
  seats: number;
  agencyId: string;
  companyId: string;
  createdAt: Timestamp;
  status: "confirmed";
  reservationId?: string;
  shipmentId?: string;
  depart?: string;
  arrivee?: string;
};

export function activityLogsCol(companyId: string) {
  return collection(db, "companies", companyId, ACTIVITY_LOG_COLLECTION);
}

export function activityLogRef(companyId: string, logDocId: string) {
  return doc(activityLogsCol(companyId), logDocId);
}

export function activityLogDocIdTicket(reservationId: string) {
  return `ticket_${reservationId}`;
}

export function activityLogDocIdOnline(reservationId: string) {
  return `online_${reservationId}`;
}

export function activityLogDocIdCourier(shipmentId: string) {
  return `courier_${shipmentId}`;
}

/** Écrit un log billet guichet dans la transaction de vente (idempotent : même id de document). */
export function writeTicketGuichetActivityInTransaction(
  tx: Transaction,
  params: {
    companyId: string;
    agencyId: string;
    reservationId: string;
    amount: number;
    seats: number;
    createdAt: Timestamp;
    depart: string;
    arrivee: string;
  }
): void {
  const ref = activityLogRef(params.companyId, activityLogDocIdTicket(params.reservationId));
  const payload: ActivityLogDoc = {
    type: "ticket",
    source: "guichet",
    amount: Number(params.amount) || 0,
    seats: Math.max(0, Number(params.seats) || 0),
    agencyId: params.agencyId,
    companyId: params.companyId,
    createdAt: params.createdAt,
    status: "confirmed",
    reservationId: params.reservationId,
    depart: String(params.depart ?? "").trim() || undefined,
    arrivee: String(params.arrivee ?? "").trim() || undefined,
  };
  tx.set(ref, payload);
}

/** Log billet en ligne : une seule fois à la confirmation / paiement (idempotent). */
export function writeOnlineTicketActivityInTransaction(
  tx: Transaction,
  params: {
    companyId: string;
    agencyId: string;
    reservationId: string;
    amount: number;
    seats: number;
    depart?: string;
    arrivee?: string;
  }
): void {
  const ref = activityLogRef(params.companyId, activityLogDocIdOnline(params.reservationId));
  const payload: ActivityLogDoc = {
    type: "online",
    source: "online",
    amount: Number(params.amount) || 0,
    seats: Math.max(1, Number(params.seats) || 1),
    agencyId: params.agencyId,
    companyId: params.companyId,
    createdAt: Timestamp.now(),
    status: "confirmed",
    reservationId: params.reservationId,
    depart: params.depart?.trim() || undefined,
    arrivee: params.arrivee?.trim() || undefined,
  };
  tx.set(ref, payload);
}

/** Log courrier payé à la création (origine ou destination payée). */
export function writeCourierActivityInTransaction(
  tx: Transaction,
  params: {
    companyId: string;
    originAgencyId: string;
    shipmentId: string;
    amount: number;
    source: ActivityLogSource;
    /** Colis = 1 « unité »; places non utilisées pour le courrier. */
    seats?: number;
    depart?: string;
    arrivee?: string;
  }
): void {
  const ref = activityLogRef(params.companyId, activityLogDocIdCourier(params.shipmentId));
  const payload: ActivityLogDoc = {
    type: "courier",
    source: params.source,
    amount: Number(params.amount) || 0,
    seats: params.seats ?? 1,
    agencyId: params.originAgencyId,
    companyId: params.companyId,
    createdAt: Timestamp.now(),
    status: "confirmed",
    shipmentId: params.shipmentId,
    depart: params.depart?.trim() || undefined,
    arrivee: params.arrivee?.trim() || undefined,
  };
  tx.set(ref, payload);
}

const QUERY_LIMIT = 10000;

export async function queryActivityLogsInRange(
  companyId: string,
  start: Date,
  end: Date,
  agencyId?: string
): Promise<QueryDocumentSnapshot<DocumentData>[]> {
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);
  const col = activityLogsCol(companyId);
  const constraints = [
    where("createdAt", ">=", startTs),
    where("createdAt", "<=", endTs),
    orderBy("createdAt", "asc"),
    limit(QUERY_LIMIT),
  ];
  if (agencyId) {
    (constraints as unknown[]).unshift(where("agencyId", "==", agencyId));
  }
  const q = query(col, ...constraints);
  try {
    const snap = await getDocs(q);
    return snap.docs;
  } catch {
    return [];
  }
}
