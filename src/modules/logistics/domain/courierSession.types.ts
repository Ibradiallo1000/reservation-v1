/**
 * Courier session (agency-scoped) — aligned with Ticket (Guichet) shift architecture.
 * Lifecycle: PENDING → ACTIVE → CLOSED → VALIDATED_AGENCY (comptable) → VALIDATED (chef d'agence).
 */

export type CourierSessionStatus =
  | "PENDING"
  | "ACTIVE"
  | "CLOSED"
  | "VALIDATED_AGENCY"
  | "VALIDATED";

export interface CourierSession {
  sessionId: string;
  companyId: string;
  agencyId: string;
  agentId: string;
  agentCode: string;
  status: CourierSessionStatus;
  openedAt: unknown;
  closedAt?: unknown;
  validatedAt?: unknown;
  /** Anciennes sessions uniquement — ne plus écrire ; totaux via financialTransactions */
  expectedAmount?: number;
  validatedAmount?: number;
  difference?: number;
  createdAt: unknown;
  updatedAt: unknown;
  /** Set when accountant activates */
  activatedBy?: { id: string; name?: string | null };
  /** Set when accountant validates */
  validatedBy?: { id: string; name?: string | null };
  /** Validation finale chef d'agence */
  managerValidated?: boolean;
  managerValidatedAt?: unknown;
  validatedByChef?: { id: string; name?: string | null };
  /** Remise : partielle si validatedAmount < attendu ledger */
  remittanceStatus?: "full_remittance" | "partial_remittance";
  /** Montant restant théorique en pending après remise partielle (surplus agent / manquant caisse selon cas) */
  remittanceDiscrepancyAmount?: number;
  /** Alignement suivi pending cash / audit */
  pendingCashLedgerVersion?: number;
}
