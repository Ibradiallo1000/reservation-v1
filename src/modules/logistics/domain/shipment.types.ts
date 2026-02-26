/**
 * Teliya Logistics Engine — Domain: Shipment types.
 * Backend only. No UI. Isolated from reservations and fleet.
 */

export type ShipmentStatus =
  | "CREATED"
  | "STORED"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "ARRIVED"
  | "READY_FOR_PICKUP"
  | "DELIVERED"
  | "CLOSED"
  | "CANCELLED"
  | "LOST"
  | "CLAIM_PENDING"
  | "CLAIM_PAID"
  | "RETURNED";

export type PaymentType = "ORIGIN" | "DESTINATION";

export type PaymentStatus =
  | "UNPAID"
  | "PAID_ORIGIN"
  | "PAID_DESTINATION";

export interface ShipmentSender {
  name: string;
  phone: string;
  idNumber?: string;
}

export interface ShipmentReceiver {
  name: string;
  phone: string;
}

export interface Shipment {
  shipmentId: string;
  /** User-facing number: COMPANYCODE-AGENCYCODE-AGENTCODE-SEQ (e.g. KMT-ABJ-C003-00042) */
  shipmentNumber?: string;
  originAgencyId: string;
  destinationAgencyId: string;
  sender: ShipmentSender;
  receiver: ShipmentReceiver;
  declaredValue: number;
  insuranceRate: number;
  insuranceAmount: number;
  transportFee: number;
  paymentType: PaymentType;
  paymentStatus: PaymentStatus;
  currentStatus: ShipmentStatus;
  currentAgencyId: string;
  /** Phase 3: agency where shipment physically is (origin → in transit → destination) */
  currentLocationAgencyId?: string;
  batchId?: string;
  vehicleId?: string;
  createdAt: unknown;
  createdBy: string;
  /** Courier session id (agency-scoped); required when creating from courrier module */
  sessionId?: string;
  /** Agent code at creation time */
  agentCode?: string;
  /** Nature of package (e.g. "Documents", "Colis") — required in courier UI */
  nature?: string;
  /** Amount collected at destination when paymentType is DESTINATION */
  destinationCollectedAmount?: number;
}
