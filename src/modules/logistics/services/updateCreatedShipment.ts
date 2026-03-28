/**
 * Mise à jour d'un envoi encore au statut CREATED (poste courrier).
 * Ajuste parcelCount sur les trajets si tripInstanceId change. Pas de changement des paiements / ledger.
 */

import { getDoc, runTransaction } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { ShipmentReceiver, ShipmentSender } from "../domain/shipment.types";
import { shipmentRef } from "../domain/firestorePaths";
import { decrementParcelCount, incrementParcelCount } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { afterLogisticsShipmentChanged } from "./afterLogisticsShipmentChanged";

export type UpdateCreatedShipmentParams = {
  companyId: string;
  shipmentId: string;
  originAgencyId: string;
  destinationAgencyId: string;
  sender: ShipmentSender;
  receiver: ShipmentReceiver;
  nature: string;
  declaredValue: number;
  transportFee: number;
  tripInstanceId?: string | null;
};

export async function updateCreatedShipment(params: UpdateCreatedShipmentParams): Promise<void> {
  const sRef = shipmentRef(db, params.companyId, params.shipmentId);
  const before = await getDoc(sRef);
  if (!before.exists()) throw new Error("Envoi introuvable.");
  const prev = before.data() as { currentStatus?: string; originAgencyId?: string; tripInstanceId?: string | null };
  if (prev.currentStatus !== "CREATED") {
    throw new Error("Seuls les envois au statut CREATED peuvent être modifiés.");
  }
  if (prev.originAgencyId !== params.originAgencyId) {
    throw new Error("Modification non autorisée depuis cette agence.");
  }

  const oldTrip = prev.tripInstanceId?.trim() || null;
  const newTripRaw = params.tripInstanceId?.trim() || "";
  const newTrip = newTripRaw || null;
  const hasTrip = Boolean(newTrip);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(sRef);
    if (!snap.exists()) throw new Error("Envoi introuvable.");
    const s = snap.data() as { currentStatus?: string; originAgencyId?: string };
    if (s.currentStatus !== "CREATED" || s.originAgencyId !== params.originAgencyId) {
      throw new Error("Envoi non modifiable.");
    }
    tx.update(sRef, {
      destinationAgencyId: params.destinationAgencyId,
      sender: params.sender,
      receiver: params.receiver,
      nature: params.nature,
      declaredValue: params.declaredValue,
      transportFee: params.transportFee,
      tripInstanceId: newTrip,
      transportStatus: hasTrip ? "ASSIGNED" : "PENDING_ASSIGNMENT",
    });
  });

  if (oldTrip && oldTrip !== newTrip) {
    await decrementParcelCount(params.companyId, oldTrip, 1).catch(() => {});
  }
  if (newTrip && newTrip !== oldTrip) {
    await incrementParcelCount(params.companyId, newTrip, 1).catch(() => {});
  }

  await afterLogisticsShipmentChanged(params.companyId, params.shipmentId, "updateCreatedShipment");
}
