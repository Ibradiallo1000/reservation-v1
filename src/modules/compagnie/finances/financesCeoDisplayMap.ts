/**
 * Libellés et formats affichage page Finances (CEO) — aucun calcul métier, mapping UI uniquement.
 */
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";

/** JJ/MM/AAAA */
export function formatDateFrSlash(d: Date): string {
  if (!d || Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export type FluxRecentLine = {
  amountAbs: number;
  signChar: "+" | "−";
  label: string;
};

/**
 * Ligne « Flux récents » : libellé métier, signe indicatif (pas de jargon type remittance / payment_received).
 */
export function mapTransactionToFluxRecent(row: FinancialTransactionDoc): FluxRecentLine | null {
  const raw = Number(row.amount);
  if (!Number.isFinite(raw)) return null;
  const abs = Math.abs(raw);
  const t = String(row.type ?? "");
  const refT = String(row.referenceType ?? "");

  let sign: "+" | "−" = "+";
  let label = "Opération";

  if (t === "payment_received") {
    sign = "+";
    if (refT === "courier_session") {
      label = "Encaissement colis";
    } else if (refT === "shift" || refT === "cash_session") {
      label = "Encaissement guichet";
    } else if (refT === "reservation") {
      label = "Encaissement client";
    } else {
      label = "Paiement reçu";
    }
  } else if (t === "remittance") {
    sign = "+";
    label = "Transfert vers caisse agence";
  } else if (t === "transfer" || t === "transfer_to_bank") {
    sign = "−";
    label = "Transfert";
  } else if (t === "expense") {
    sign = "−";
    label = "Dépense";
  } else if (t === "refund") {
    sign = "−";
    label = "Remboursement client";
  } else if (t === "bank_withdrawal") {
    sign = "+";
    label = "Approvisionnement caisse";
  } else {
    label = "Opération";
    sign = raw < 0 ? "−" : "+";
  }

  return {
    signChar: sign,
    amountAbs: abs,
    label,
  };
}
