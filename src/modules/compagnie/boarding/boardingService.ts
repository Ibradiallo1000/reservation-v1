/**
 * Embarquement des passagers par escale/agence.
 * boardingStatus: pending | boarded | no_show
 */

import { collectionGroup, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ensureProgressArrival } from "@/modules/compagnie/tripInstances/tripProgressService";

const CONFIRMED_STATUTS = ["paye", "payé", "confirme", "validé"];

export type PassengerForBoarding = {
  id: string;
  companyId: string;
  agencyId: string;
  nomClient: string;
  arrivee: string;
  seatsGo: number;
  boardingStatus: string;
  journeyStatus?: string;
  originStopOrder?: number | null;
  destinationStopOrder?: number | null;
};

/**
 * Retourne les réservations à embarquer pour un trajet et une escale donnés :
 * tripInstanceId == tripInstanceId, originStopOrder == stopOrder, boardingStatus == "pending"
 * (ou non renseigné pour compatibilité).
 * Index Firestore requis : collection group "reservations", companyId (ASC), tripInstanceId (ASC), originStopOrder (ASC).
 */
export async function getPassengersForBoarding(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<PassengerForBoarding[]> {
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("tripInstanceId", "==", tripInstanceId),
    where("originStopOrder", "==", stopOrder)
  );
  const snap = await getDocs(q);
  const list: PassengerForBoarding[] = [];
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const statut = (data.statut ?? "").toString().toLowerCase();
    if (!CONFIRMED_STATUTS.includes(statut)) continue;
    const boarding = (data.boardingStatus ?? "pending").toString().toLowerCase();
    if (boarding === "boarded" || boarding === "no_show") continue;
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
      arrivee: (data.arrivee as string) ?? "",
      seatsGo: Number(data.seatsGo ?? 1),
      boardingStatus: boarding,
    });
  }
  return list;
}

/**
 * Marque la réservation comme embarquée (boardingStatus = "boarded", journeyStatus = "in_transit").
 * Crée automatiquement l'arrivée à l'escale (progress) si pas encore enregistrée.
 */
export async function markBoarded(
  companyId: string,
  agencyId: string,
  reservationId: string
): Promise<void> {
  const ref = doc(db, "companies", companyId, "agences", agencyId, "reservations", reservationId);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const d = snap.data() as { tripInstanceId?: string; originStopOrder?: number };
    const tiId = d.tripInstanceId;
    const stopOrder = d.originStopOrder != null ? Number(d.originStopOrder) : null;
    if (tiId && stopOrder != null) await ensureProgressArrival(companyId, tiId, stopOrder);
  }
  await updateDoc(ref, { boardingStatus: "boarded", journeyStatus: "in_transit" });
}

/**
 * Marque la réservation comme absent (boardingStatus = "no_show").
 */
export async function markNoShow(
  companyId: string,
  agencyId: string,
  reservationId: string
): Promise<void> {
  const ref = doc(db, "companies", companyId, "agences", agencyId, "reservations", reservationId);
  await updateDoc(ref, { boardingStatus: "no_show" });
}
