/**
 * Test de cohérence interne : somme des écritures par compte vs solde stocké.
 * Hypothèse : soldes initiaux à 0 pour tous les comptes (pas d’ouverture manuelle hors journal).
 */

import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FinancialTransactionDoc } from "./types";
import { ledgerAccountsRef } from "./ledgerAccounts";

function isConfirmedLedgerTxStatus(s: string | undefined): boolean {
  if (!s) return true;
  if (s === "failed" || s === "pending" || s === "rejected") return false;
  return true;
}

const FINANCIAL_TRANSACTIONS = "financialTransactions";

function financialTransactionsColl(companyId: string) {
  return collection(db, "companies", companyId, FINANCIAL_TRANSACTIONS);
}

export type LedgerIntegrityTestResult = {
  ok: boolean;
  errors: string[];
  accountsChecked: number;
  transactionsScanned: number;
};

/**
 * Vérifie double entrée (debit/credit présents) et rapprochement soldes ↔ flux cumulés.
 */
export async function runLedgerIntegrityTest(companyId: string): Promise<LedgerIntegrityTestResult> {
  const errors: string[] = [];
  const flows = new Map<string, number>();

  const txSnap = await getDocs(query(financialTransactionsColl(companyId), limit(5000)));
  let scanned = 0;
  for (const d of txSnap.docs) {
    const row = d.data() as FinancialTransactionDoc;
    if (!isConfirmedLedgerTxStatus(row.status)) continue;
    scanned += 1;
    const amt = Number(row.amount) || 0;
    const mag = Math.abs(amt);
    if (mag <= 0) {
      errors.push(`Transaction ${d.id} : montant invalide (${row.amount})`);
      continue;
    }
    const debit = String(row.debitAccountId ?? "").trim();
    const credit = String(row.creditAccountId ?? "").trim();
    if (!debit || !credit) {
      errors.push(`Transaction ${d.id} : écriture incomplète (débit ou crédit manquant)`);
      continue;
    }
    flows.set(debit, (flows.get(debit) ?? 0) - mag);
    flows.set(credit, (flows.get(credit) ?? 0) + mag);
  }

  const accSnap = await getDocs(query(ledgerAccountsRef(companyId), limit(500)));
  let accountsChecked = 0;
  for (const d of accSnap.docs) {
    accountsChecked += 1;
    const bal = Number((d.data() as { balance?: number }).balance ?? 0);
    const expected = flows.get(d.id) ?? 0;
    if (Math.abs(bal - expected) > 0.02) {
      errors.push(
        `Compte "${d.id}" : solde ${bal} ≠ cumul transactions (${expected}) — vérifier soldes d’ouverture ou écritures manquantes.`
      );
    }
  }

  return { ok: errors.length === 0, errors, accountsChecked, transactionsScanned: scanned };
}
