/**
 * Phase 3: Confirm escale arrival for selected shipments at current agency.
 * Only shipments where destinationAgencyId === agencyId: status → ARRIVED, currentLocationAgencyId → agencyId.
 * Batch remains DEPARTED.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Shipment } from "../../domain/shipment.types";
import type { ShipmentEvent } from "../../domain/logisticsEvents.types";
import { shipmentRef, eventsRef } from "../../domain/firestorePaths";

export type ConfirmEscaleArrivalParams = {
  companyId: string;
  /** Agency where escale is confirmed (current location) */
  agencyId: string;
  shipmentIds: string[];
  performedBy: string;
};

export async function confirmEscaleArrival(params: ConfirmEscaleArrivalParams): Promise<void> {
  if (params.shipmentIds.length === 0) return;

  await runTransaction(db, async (tx) => {
    for (const sid of params.shipmentIds) {
      const sRef = shipmentRef(db, params.companyId, sid);
      const shipSnap = await tx.get(sRef);
      if (!shipSnap.exists()) throw new Error(`Envoi introuvable: ${sid}.`);
      const shipment = shipSnap.data() as Shipment;
      if (shipment.currentStatus !== "IN_TRANSIT") continue;
      if (shipment.destinationAgencyId !== params.agencyId) continue;

      tx.update(sRef, {
        currentStatus: "ARRIVED",
        currentAgencyId: params.agencyId,
        currentLocationAgencyId: params.agencyId,
      });

      const eventsCol = eventsRef(db, params.companyId);
      tx.set(doc(eventsCol), {
        shipmentId: sid,
        eventType: "ARRIVED",
        agencyId: params.agencyId,
        performedBy: params.performedBy,
        performedAt: serverTimestamp(),
      } as Omit<ShipmentEvent, "performedAt"> & { performedAt: ReturnType<typeof serverTimestamp> });
    }
  });
}
