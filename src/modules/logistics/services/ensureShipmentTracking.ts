/**
 * Génère trackingPublicId / trackingToken manquants (anciens envois) et synchronise le miroir public.
 */

import { getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { shipmentRef } from "../domain/firestorePaths";
import { generateTrackingPublicId, generateTrackingToken } from "../utils/shipmentTrackingCrypto";
import { afterLogisticsShipmentChanged } from "./afterLogisticsShipmentChanged";

export async function ensureShipmentTracking(
  companyId: string,
  shipmentId: string
): Promise<{ trackingPublicId: string; trackingToken: string } | null> {
  const ref = shipmentRef(db, companyId, shipmentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const sh = snap.data() as { trackingPublicId?: string; trackingToken?: string };
  let pid = sh.trackingPublicId?.trim();
  let tok = sh.trackingToken?.trim();

  if (pid && tok) {
    await afterLogisticsShipmentChanged(companyId, shipmentId, "ensureShipmentTracking");
    return { trackingPublicId: pid, trackingToken: tok };
  }

  pid = generateTrackingPublicId();
  tok = generateTrackingToken();
  await updateDoc(ref, { trackingPublicId: pid, trackingToken: tok });
  await afterLogisticsShipmentChanged(companyId, shipmentId, "ensureShipmentTracking");
  return { trackingPublicId: pid, trackingToken: tok };
}
