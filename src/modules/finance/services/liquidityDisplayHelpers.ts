/**
 * Affichage liquidités : le ledger reste la vérité des soldes.
 * Les encaissements « en ligne » (produit : payment_received hors espèces) servent au détail / contrôle sur la période.
 */
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import { isConfirmedTransactionStatus } from "@/modules/compagnie/treasury/financialTransactions";

/** Paiements en ligne / numériques confirmés (équivalent métier « payment_online » : pas de type Firestore dédié). */
export function sumConfirmedDigitalPaymentReceived(
  rows: Array<FinancialTransactionDoc & { id?: string }>
): number {
  let s = 0;
  for (const r of rows) {
    if (String(r.type ?? "") !== "payment_received") continue;
    if (!isConfirmedTransactionStatus(r.status)) continue;
    const pm = String(r.paymentMethod ?? "").toLowerCase();
    const ch = String(r.paymentChannel ?? "").toLowerCase();
    if (pm === "cash") continue;
    if (pm === "mobile_money" || pm === "card") {
      s += Math.abs(Number(r.amount) || 0);
      continue;
    }
    if (ch === "online" || ch.includes("ligne") || ch === "mobile_money") {
      s += Math.abs(Number(r.amount) || 0);
    }
  }
  return s;
}
