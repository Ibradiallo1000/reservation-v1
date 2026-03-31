/**
 * Descente des passagers par escale.
 * dropoffStatus: pending | dropped
 */

import { collectionGroup, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ensureProgressArrival } from "@/modules/compagnie/tripInstances/tripProgressService";
import { maybeFinishTripExecutionAfterFinalDropoff } from "@/modules/compagnie/tripExecutions/tripExecutionService";

const CONFIRMED_STATUTS = ["paye", "payé", "confirme", "validé"];

export type PassengerToDrop = {
  id: string;
  companyId: string;
  agencyId: string;
  nomClient: string;
  depart: string;
  arrivee: string;
  dropoffStatus: string;
  boardingStatus?: string;
  connectionId?: string | null;
  tripInstanceId?: string;
  destinationStopOrder?: number | null;
};

/**
 * Retourne les réservations dont la destination est cette escale et qui sont encore en attente de descente :
 * destinationStopOrder == stopOrder, dropoffStatus == "pending" (ou non renseigné).
 * Index Firestore : collection group "reservations", companyId (ASC), tripInstanceId (ASC), destinationStopOrder (ASC).
 */
export async function getPassengersToDrop(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<PassengerToDrop[]> {
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("tripInstanceId", "==", tripInstanceId),
    where("destinationStopOrder", "==", stopOrder)
  );
  const snap = await getDocs(q);
  const list: PassengerToDrop[] = [];
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const statut = (data.statut ?? "").toString().toLowerCase();
    if (!CONFIRMED_STATUTS.includes(statut)) continue;
    const dropoff = (data.dropoffStatus ?? "pending").toString().toLowerCase();
    if (dropoff === "dropped") continue;
    const path = d.ref.path;
    const parts = path.split("/");
    const companyIndex = parts.indexOf("companies");
    const companyIdFromPath = companyIndex >= 0 ? parts[companyIndex + 1] : "";
    const agencesIndex = parts.indexOf("agences");
    const agencyIdFromPath = agencesIndex >= 0 ? parts[agencesIndex + 1] : "";
    list.push({
      id: d.id,
      companyId: (data.companyId as string) ?? companyIdFromPath,
      agencyId: (data.agencyId as string) ?? agencyIdFromPath,
      nomClient: (data.nomClient as string) ?? "",
      depart: (data.depart as string) ?? "",
      arrivee: (data.arrivee as string) ?? "",
      dropoffStatus: dropoff,
      connectionId: (data.connectionId as string) ?? null,
      tripInstanceId,
      destinationStopOrder: stopOrder,
    });
  }
  return list;
}

/**
 * Marque la réservation comme descendue (dropoffStatus = "dropped", journeyStatus = "dropped").
 * Crée automatiquement l'arrivée à l'escale (progress) si pas encore enregistrée.
 */
export async function markDropped(
  companyId: string,
  agencyId: string,
  reservationId: string
): Promise<void> {
  const ref = doc(db, "companies", companyId, "agences", agencyId, "reservations", reservationId);
  const snap = await getDoc(ref);
  let tiId: string | undefined;
  let destinationStopOrder: number | null = null;
  if (snap.exists()) {
    const d = snap.data() as { tripInstanceId?: string; destinationStopOrder?: number };
    tiId = d.tripInstanceId;
    destinationStopOrder = d.destinationStopOrder != null ? Number(d.destinationStopOrder) : null;
    if (tiId && destinationStopOrder != null) await ensureProgressArrival(companyId, tiId, destinationStopOrder);
  }
  await updateDoc(ref, { dropoffStatus: "dropped", journeyStatus: "dropped" });

  // finished (v2) : passe en "finished" uniquement si plus de passagers en attente de descente sur la dernière escale.
  if (tiId && destinationStopOrder != null) {
    await maybeFinishTripExecutionAfterFinalDropoff({ companyId, tripInstanceId: tiId, destinationStopOrder });
  }
}
