/**
 * Totaux session courrier : agrégation exclusivement depuis financialTransactions
 * (via reservationId = shipmentId des colis liés à la session).
 */

import { getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { sumPaymentReceivedForReservationIds } from "@/modules/compagnie/treasury/financialTransactions";
import { shipmentsRef } from "../domain/firestorePaths";

export async function getCourierSessionLedgerTotal(
  companyId: string,
  courierSessionId: string
): Promise<number> {
  const shipSnap = await getDocs(
    query(shipmentsRef(db, companyId), where("sessionId", "==", courierSessionId))
  );
  const ids = shipSnap.docs.map((d) => d.id);
  return sumPaymentReceivedForReservationIds(companyId, ids);
}
