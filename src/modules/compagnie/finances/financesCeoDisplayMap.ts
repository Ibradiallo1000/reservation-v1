/**
 * Display mapping for Finances page (UI only).
 */
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";

/** DD/MM/YYYY */
export function formatDateFrSlash(d: Date): string {
  if (!d || Number.isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export type FluxRecentLine = {
  amountAbs: number;
  signChar: "+" | "-" | "?";
  label: string;
};

/**
 * Keep only actionable treasury flows:
 * - caisse validations
 * - caisse/bank transfers
 * - internal movements
 */
export function mapTransactionToFluxRecent(row: FinancialTransactionDoc): FluxRecentLine | null {
  const raw = Number(row.amount);
  if (!Number.isFinite(raw)) return null;
  const abs = Math.abs(raw);
  const t = String(row.type ?? "");
  const refT = String(row.referenceType ?? "");

  if (t === "remittance") {
    return {
      signChar: "+",
      amountAbs: abs,
      label: "Validation de caisse",
    };
  }

  if (t === "bank_withdrawal") {
    return {
      signChar: "+",
      amountAbs: abs,
      label: "Transfert banque vers caisse",
    };
  }

  if (t === "transfer" || t === "transfer_to_bank") {
    let label = "Mouvement interne";
    if (refT === "agency_deposit") label = "Transfert caisse vers banque";
    else if (refT === "mobile_to_bank") label = "Transfert mobile vers banque";
    else if (refT === "internal_transfer") label = "Mouvement interne";
    return {
      signChar: "?",
      amountAbs: abs,
      label,
    };
  }

  return null;
}
