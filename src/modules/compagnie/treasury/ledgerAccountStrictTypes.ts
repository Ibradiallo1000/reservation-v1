/**
 * Types stricts des documents `accounts` — aucune inférence runtime hors migration (`normalizeAccountsData`).
 */

import type { LedgerAccountKind } from "./ledgerAccounts";

export const STRICT_LEDGER_ACCOUNT_TYPES = [
  "cash",
  "mobile_money",
  "bank",
  "virtual_clearing",
  "virtual_client",
] as const satisfies readonly LedgerAccountKind[];

export type StrictLedgerAccountType = (typeof STRICT_LEDGER_ACCOUNT_TYPES)[number];

const SET = new Set<string>(STRICT_LEDGER_ACCOUNT_TYPES);

/**
 * Lit uniquement le champ `type` du document. Aucun fallback sur doc id ni accountType.
 */
export function parseStrictLedgerAccountType(
  data: Record<string, unknown>,
  docId: string
): StrictLedgerAccountType {
  const raw = data.type;
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    throw new Error(
      `[ledger] Compte "${docId}" : champ "type" obligatoire manquant ou vide — exécuter normalizeAccountsData().`
    );
  }
  const s = String(raw).toLowerCase().trim();
  if (!SET.has(s)) {
    throw new Error(
      `[ledger] Compte "${docId}" : type "${String(raw)}" invalide — valeurs autorisées : ${STRICT_LEDGER_ACCOUNT_TYPES.join(", ")}.`
    );
  }
  return s as StrictLedgerAccountType;
}

export function isLiquidityBucketType(t: StrictLedgerAccountType): t is "cash" | "mobile_money" | "bank" {
  return t === "cash" || t === "mobile_money" || t === "bank";
}
