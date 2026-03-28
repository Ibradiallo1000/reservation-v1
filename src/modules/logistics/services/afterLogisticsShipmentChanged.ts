/**
 * Point d’entrée unique après mutation d’un envoi : synchronise le miroir public.
 * Toute nouvelle écriture sur un shipment doit appeler cette fonction (ou passer par un service qui l’appelle).
 */

import { syncPublicShipmentTrack } from "./syncPublicShipmentTrack";

export async function afterLogisticsShipmentChanged(
  companyId: string,
  shipmentId: string,
  context?: string
): Promise<void> {
  try {
    await syncPublicShipmentTrack(companyId, shipmentId);
  } catch (e) {
    const label = context ? `[${context}]` : "[afterLogisticsShipmentChanged]";
    console.warn(`${label} syncPublicShipmentTrack`, e);
  }
}
