/**
 * Teliya Logistics Engine — Financial session & ledger domain types.
 * Backend only. No UI. Isolated from reservations and fleet.
 */

export type SessionStatus =
  | "OPEN"
  | "CLOSED"
  | "VALIDATED";

export type LedgerEntryType =
  | "TRANSPORT_FEE"
  | "INSURANCE"
  | "DESTINATION_PAYMENT"
  | "REFUND"
  | "ADJUSTMENT";

export interface LogisticsSession {
  sessionId: string;
  agencyId: string;
  openedBy: string;
  openedAt: unknown;
  closedAt?: unknown;
  closedBy?: string;
  status: SessionStatus;
  expectedAmount: number;
  countedAmount?: number;
  difference?: number;
  validatedBy?: string;
  validatedAt?: unknown;
}

export interface LogisticsLedgerEntry {
  entryId: string;
  sessionId: string;
  shipmentId: string;
  agencyId: string;
  agentId: string;
  type: LedgerEntryType;
  amount: number;
  createdAt: unknown;
}
