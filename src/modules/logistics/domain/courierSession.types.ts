/**
 * Courier session (agency-scoped) — aligned with Ticket (Guichet) shift architecture.
 * Lifecycle: PENDING → ACTIVE → CLOSED → VALIDATED.
 */

export type CourierSessionStatus =
  | "PENDING"
  | "ACTIVE"
  | "CLOSED"
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
  expectedAmount: number;
  validatedAmount?: number;
  difference?: number;
  createdAt: unknown;
  updatedAt: unknown;
  /** Set when accountant activates */
  activatedBy?: { id: string; name?: string | null };
  /** Set when accountant validates */
  validatedBy?: { id: string; name?: string | null };
}
