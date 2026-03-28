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

/**
 * Suivi transport (lien tripInstance), distinct de {@link ShipmentStatus} / currentStatus.
 * — Sans tripInstanceId à la création → PENDING_ASSIGNMENT
 * — Avec tripInstanceId → ASSIGNED (puis IN_TRANSIT / ARRIVED selon évolutions futures)
 */
export type ShipmentTransportStatus =
  | "PENDING_ASSIGNMENT"
  | "ASSIGNED"
  | "IN_TRANSIT"
  | "ARRIVED";

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
  /** Optional link to trip instance (real execution of the trip). When set, shipment is attached to that instance. */
  tripInstanceId?: string | null;
  /** État du rattachement au transport (tripInstance), indépendant du workflow colis (currentStatus). */
  transportStatus?: ShipmentTransportStatus;
  /**
   * Contrôle agent sur un arrivage.
   * — À la création : `false`.
   * — Quand le transport enregistre une arrivée physique (ex. transportStatus ou flux ARRIVED côté transport) : passer à `true` pour file d’arrivages / contrôle (phase 2).
   */
  needsValidation?: boolean;
  /** Dernière instance de trajet remplacée lors d’une réaffectation (audit). */
  previousTripInstanceId?: string | null;
  reassignedAt?: unknown;
  reassignedBy?: string;
  /** Anomalie signalée à l’arrivage (contrôle agent) — phase transport / arrivages. */
  arrivalAnomalyFlag?: boolean;
  arrivalAnomalyAt?: unknown;
  arrivalAnomalyBy?: string;
  createdAt: unknown;
  createdBy: string;
  /** Courier session id (agency-scoped); required when creating from courrier module */
  sessionId?: string;
  /** Agent code at creation time */
  agentCode?: string;
  /** Nature of package (e.g. "Documents", "Colis") — required in courier UI */
  nature?: string;
  /** Id public pour URL /track/{id} (QR) — unique, non secret. */
  trackingPublicId?: string;
  /** Secret pour valider l’accès au suivi (?token=). Jamais dans publicShipmentTrack. */
  trackingToken?: string;
  /** Code de retrait communiqué au client (remise par tiers possible). */
  pickupCode?: string;
  /** Flag d'usage unique du code de retrait. */
  pickupCodeUsed?: boolean;
  /** Valeur du code saisi lors de la remise (traçabilité). */
  pickupCodeUsedValue?: string | null;
  /** Amount collected at destination when paymentType is DESTINATION */
  destinationCollectedAmount?: number;
}
