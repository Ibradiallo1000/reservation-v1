/**
 * Correspondances entre bus : trajets multi-segments.
 * Collection: companies/{companyId}/connections/{connectionId}
 */

import { collection, doc, getDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getTripInstance } from "@/modules/compagnie/tripInstances/tripInstanceService";
import type { Connection, ConnectionDocWithId, ConnectionSegment } from "@/types/connection";

const CONNECTIONS_COLLECTION = "connections";

function connectionDocRef(companyId: string, connectionId: string) {
  return doc(db, "companies", companyId, CONNECTIONS_COLLECTION, connectionId);
}

export type CreateConnectionParams = {
  companyId: string;
  segments: ConnectionSegment[];
};

/**
 * Crée une correspondance. Chaque segment aura une réservation avec le même connectionId.
 */
export async function createConnection(
  params: CreateConnectionParams
): Promise<string> {
  const ref = collection(db, "companies", params.companyId, CONNECTIONS_COLLECTION);
  const snap = await addDoc(ref, {
    companyId: params.companyId,
    segments: params.segments,
    status: "active",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return snap.id;
}

/**
 * Récupère une correspondance par id.
 */
export async function getConnection(
  companyId: string,
  connectionId: string
): Promise<ConnectionDocWithId | null> {
  const ref = connectionDocRef(companyId, connectionId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    companyId: (data.companyId as string) ?? "",
    segments: (data.segments as ConnectionSegment[]) ?? [],
    status: (data.status as Connection["status"]) ?? "active",
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
}

/**
 * Pour une réservation qui a un connectionId et qui descend à destinationStopOrder sur tripInstanceId,
 * retourne le segment suivant de la correspondance (s'il existe) et les infos du prochain bus.
 */
export async function getNextSegmentInfo(
  companyId: string,
  connectionId: string,
  currentTripInstanceId: string,
  currentDestinationStopOrder: number
): Promise<{ segment: ConnectionSegment; routeLabel: string; departureTime: string } | null> {
  const conn = await getConnection(companyId, connectionId);
  if (!conn || !conn.segments.length) return null;
  const idx = conn.segments.findIndex(
    (s) => s.tripInstanceId === currentTripInstanceId && s.destinationStopOrder === currentDestinationStopOrder
  );
  if (idx < 0 || idx >= conn.segments.length - 1) return null;
  const next = conn.segments[idx + 1];
  const ti = await getTripInstance(companyId, next.tripInstanceId);
  if (!ti) return null;
  const routeDeparture = (ti as { routeDeparture?: string }).routeDeparture ?? (ti as { departureCity?: string }).departureCity ?? "";
  const routeArrival = (ti as { routeArrival?: string }).routeArrival ?? (ti as { arrivalCity?: string }).arrivalCity ?? "";
  const departureTime = (ti as { departureTime?: string }).departureTime ?? "";
  return {
    segment: next,
    routeLabel: `${routeDeparture} → ${routeArrival}`,
    departureTime,
  };
}
