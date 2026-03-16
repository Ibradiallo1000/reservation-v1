/**
 * Manifeste passagers par tripInstance : à bord, à descendre, dépassement (fraude).
 * Compatible avec les segments dynamiques (originStopOrder / destinationStopOrder).
 */

import { collectionGroup, getDocs, query, where, QueryDocumentSnapshot } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getPassengersToDrop as getPassengersToDropFromDropoff } from "@/modules/compagnie/dropoff/dropoffService";

const CONFIRMED_STATUTS = ["paye", "payé", "confirme", "validé"];

export type ManifestPassenger = {
  id: string;
  companyId: string;
  agencyId: string;
  nomClient: string;
  depart: string;
  arrivee: string;
  boardingStatus: string;
  dropoffStatus: string;
  journeyStatus: string;
  originStopOrder?: number | null;
  destinationStopOrder?: number | null;
  connectionId?: string | null;
};

function parseReservationDoc(d: QueryDocumentSnapshot): ManifestPassenger | null {
  const data = d.data() as Record<string, unknown>;
  const statut = (data.statut ?? "").toString().toLowerCase();
  if (!CONFIRMED_STATUTS.includes(statut)) return null;
  const path = d.ref.path;
  const parts = path.split("/");
  const companyIndex = parts.indexOf("companies");
  const companyIdFromPath = companyIndex >= 0 ? parts[companyIndex + 1] : "";
  const agencesIndex = parts.indexOf("agences");
  const agencyIdFromPath = agencesIndex >= 0 ? parts[agencesIndex + 1] : "";
  return {
    id: d.id,
    companyId: (data.companyId as string) ?? companyIdFromPath,
    agencyId: (data.agencyId as string) ?? agencyIdFromPath,
    nomClient: (data.nomClient as string) ?? "",
    depart: (data.depart as string) ?? "",
    arrivee: (data.arrivee as string) ?? "",
    boardingStatus: (data.boardingStatus ?? "pending").toString().toLowerCase(),
    dropoffStatus: (data.dropoffStatus ?? "pending").toString().toLowerCase(),
    journeyStatus: (data.journeyStatus ?? "booked").toString().toLowerCase(),
    originStopOrder: data.originStopOrder != null ? Number(data.originStopOrder) : null,
    destinationStopOrder: data.destinationStopOrder != null ? Number(data.destinationStopOrder) : null,
    connectionId: (data.connectionId as string) ?? null,
  };
}

/**
 * Passagers actuellement à bord : boardingStatus == "boarded" et dropoffStatus != "dropped".
 * Index : collection group "reservations", companyId (ASC), tripInstanceId (ASC), boardingStatus (ASC).
 */
export async function getPassengersOnBoard(
  companyId: string,
  tripInstanceId: string
): Promise<ManifestPassenger[]> {
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("tripInstanceId", "==", tripInstanceId),
    where("boardingStatus", "==", "boarded")
  );
  const snap = await getDocs(q);
  const list: ManifestPassenger[] = [];
  for (const d of snap.docs) {
    const row = parseReservationDoc(d);
    if (!row) continue;
    if (row.dropoffStatus === "dropped") continue;
    list.push(row);
  }
  return list;
}

/**
 * Passagers à faire descendre à cette escale : destinationStopOrder == stopOrder, dropoffStatus == "pending".
 * Délègue au service dropoff.
 */
export async function getPassengersToDrop(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
) {
  return getPassengersToDropFromDropoff(companyId, tripInstanceId, stopOrder);
}

/**
 * Passagers en dépassement (fraude) : destination déjà dépassée (destinationStopOrder < stopOrder) et pas encore descendus.
 * Retourne les réservations confirmées du trip où destinationStopOrder < stopOrder et dropoffStatus != "dropped".
 */
export async function detectOvertravelPassengers(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<ManifestPassenger[]> {
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("tripInstanceId", "==", tripInstanceId)
  );
  const snap = await getDocs(q);
  const list: ManifestPassenger[] = [];
  for (const d of snap.docs) {
    const row = parseReservationDoc(d);
    if (!row) continue;
    if (row.dropoffStatus === "dropped") continue;
    const dest = row.destinationStopOrder;
    if (dest == null || !Number.isInteger(dest) || dest >= stopOrder) continue;
    list.push(row);
  }
  return list;
}
