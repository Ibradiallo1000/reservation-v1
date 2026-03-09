/**
 * Module Comptabilité TELIYA — types pour Grand livre, Balance, Compte de résultat.
 */

import type { Timestamp } from "firebase/firestore";

export interface ComptaMovementRow {
  id: string;
  performedAt: Timestamp;
  fromAccountId: string | null;
  toAccountId: string | null;
  amount: number;
  currency: string;
  movementType: string;
  referenceType: string;
  referenceId: string;
  entryType: "debit" | "credit";
  agencyId: string;
  notes: string | null;
}

export interface GrandLivreLine {
  movementId: string;
  date: Date;
  libelle: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface BalanceLine {
  accountId: string;
  accountName: string;
  accountType: string;
  agencyId: string | null;
  soldeDebut: number;
  debit: number;
  credit: number;
  soldeFin: number;
}

export interface CompteDeResultatData {
  period: { start: Date; end: Date; label: string };
  revenus: { total: number; byType: Record<string, number> };
  charges: { total: number; byType: Record<string, number> };
  resultat: number;
}
