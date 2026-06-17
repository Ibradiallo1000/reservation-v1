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
  courierSessionId: string,
  options: { agencyId?: string | null; paymentChannel?: "courrier" | null } = {}
): Promise<number> {
  const shipSnap = await getDocs(
    query(shipmentsRef(db, companyId), where("sessionId", "==", courierSessionId))
  );
  const ids = shipSnap.docs.map((d) => d.id);
  const paidShipmentAmount = shipSnap.docs.reduce((sum, d) => {
    const data = d.data() as Record<string, unknown>;
    const paymentStatus = String(data.paymentStatus ?? "");
    if (!paymentStatus || paymentStatus === "UNPAID") return sum;
    const transportFee = Number(data.transportFee ?? 0);
    const insuranceAmount = Number(data.insuranceAmount ?? 0);
    const shipmentTotal =
      (Number.isFinite(transportFee) && transportFee > 0 ? transportFee : 0) +
      (Number.isFinite(insuranceAmount) && insuranceAmount > 0 ? insuranceAmount : 0);
    if (shipmentTotal > 0) return sum + shipmentTotal;

    const candidates = [
      data.paidAmount,
      data.destinationCollectedAmount,
      data.amount,
      data.totalAmount,
      data.price,
      data.transportFee,
      data.deliveryFee,
      data.shippingFee,
      data.fee,
    ];
    for (const candidate of candidates) {
      const amount = Number(candidate ?? 0);
      if (Number.isFinite(amount) && amount > 0) return sum + amount;
    }
    return sum;
  }, 0);

  try {
    const ledgerTotal = await sumPaymentReceivedForReservationIds(companyId, ids, options);
    return ledgerTotal > 0 ? ledgerTotal : paidShipmentAmount;
  } catch (error) {
    console.warn("[courierSessionLedger] Ledger total unavailable, fallback to paid shipments:", {
      companyId,
      courierSessionId,
      error,
    });
    return paidShipmentAmount;
  }
}
