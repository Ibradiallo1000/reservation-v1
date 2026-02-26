/**
 * Teliya Revenue — Minimal domain types (append-only events).
 * Backend only. No UI. No aggregator. Isolated.
 */

export type RevenueSourceType = "LOGISTICS" | "TICKET";

export type RevenueCategory =
  | "TRANSPORT"
  | "INSURANCE"
  | "DESTINATION_PAYMENT";

export interface RevenueEvent {
  eventId: string;
  sourceType: RevenueSourceType;
  sourceId: string;
  agencyId: string;
  vehicleId?: string | null;
  amount: number;
  category: RevenueCategory;
  occurredAt: unknown;
}
