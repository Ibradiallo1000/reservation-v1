/**
 * Phase 3: ChefAgence confirms departure. READY -> DEPARTED, all shipments -> IN_TRANSIT. Atomic.
 */

import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Shipment } from "../../domain/shipment.types";
import type { ShipmentEvent } from "../../domain/logisticsEvents.types";
import { shipmentRef, agencyBatchRef, eventsRef } from "../../domain/firestorePaths";

export type ConfirmCourierBatchDepartureParams = {
  companyId: string;
  originAgencyId: string;
  batchId: string;
  performedBy: string;
  userRole: string;
};

const ALLOWED_DEPARTURE_ROLES = ["chefAgence", "admin_compagnie"];

export async function confirmCourierBatchDeparture(params: ConfirmCourierBatchDepartureParams): Promise<void> {
  if (!ALLOWED_DEPARTURE_ROLES.includes(params.userRole)) throw new Error("Unauthorized action.");
  await runTransaction(db, async (tx) => {
    const bRef = agencyBatchRef(db, params.companyId, params.originAgencyId, params.batchId);
    const batchSnap = await tx.get(bRef);
    if (!batchSnap.exists()) throw new Error("Lot introuvable.");

    const batch = batchSnap.data() as { status: string; shipmentIds: string[] };
    if (batch.status !== "READY") throw new Error("Le lot doit être READY pour confirmer le départ.");

    for (const sid of batch.shipmentIds) {
      const sRef = shipmentRef(db, params.companyId, sid);
      const shipSnap = await tx.get(sRef);
      if (!shipSnap.exists()) throw new Error("Envoi introuvable: " + sid);
      const shipment = shipSnap.data() as Shipment;
      if (shipment.currentStatus !== "CREATED") throw new Error("Envoi " + sid + " statut attendu CREATED.");

      tx.update(sRef, {
        currentStatus: "IN_TRANSIT",
        currentAgencyId: params.originAgencyId,
      });

      const eventsCol = eventsRef(db, params.companyId);
      tx.set(doc(eventsCol), {
        shipmentId: sid,
        eventType: "DEPARTED",
        agencyId: params.originAgencyId,
        performedBy: params.performedBy,
        performedAt: serverTimestamp(),
      } as ShipmentEvent & { performedAt: ReturnType<typeof serverTimestamp> });
    }

    tx.update(bRef, { status: "DEPARTED", departedAt: serverTimestamp() });
  });
}
