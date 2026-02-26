/**
 * Teliya Logistics Engine — Domain: Logistics event types.
 * Backend only. No UI. Events are append-only; history is never overwritten.
 */

export type ShipmentEventType =
  | "CREATED"
  | "ASSIGNED_TO_BATCH"
  | "DEPARTED"
  | "ARRIVED"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "CANCELLED"
  | "LOST"
  | "CLAIM_PAID";

export interface ShipmentEvent {
  shipmentId: string;
  eventType: ShipmentEventType;
  agencyId: string;
  performedBy: string;
  performedAt: unknown;
}
