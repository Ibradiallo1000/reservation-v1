/**
 * Totaux session courrier : agrégation opérationnelle depuis les colis payés
 * liés à la session.
 *
 * Important :
 * - Ne lit pas financialTransactions.
 * - Évite les permission-denied côté agent courrier.
 * - Le ledger financier reste réservé aux écrans finance/comptabilité autorisés.
 */

import { getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { shipmentsRef } from "../domain/firestorePaths";

export async function getCourierSessionLedgerTotal(
  companyId: string,
  courierSessionId: string,
  _options: { agencyId?: string | null; paymentChannel?: "courrier" | null } = {}
): Promise<number> {
  const shipSnap = await getDocs(
    query(shipmentsRef(db, companyId), where("sessionId", "==", courierSessionId))
  );

  return shipSnap.docs.reduce((sum, d) => {
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
}