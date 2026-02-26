// Phase C1.1 — Payment proposals (CEO approval for high amounts). C1.2: expiration, audit trail.
import type { Timestamp } from "firebase/firestore";

export type PaymentProposalApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalHistoryAction = "proposed" | "approved" | "rejected";

export interface ApprovalHistoryEntry {
  action: ApprovalHistoryAction;
  by: string;
  role: string;
  timestamp: Timestamp;
}

export interface PaymentProposalDoc {
  payableId: string;
  fromAccountId: string;
  amount: number;
  currency: string;
  agencyId: string;
  proposedBy: string;
  proposedAt: Timestamp;
  approvalStatus: PaymentProposalApprovalStatus;
  approvedBy?: string | null;
  approvedAt?: Timestamp | null;
  approvedByRole?: string | null;
  executedMovementId?: string | null;
  idempotencyKey: string;
  /** C1.2: default proposedAt + 7 days */
  expiresAt: Timestamp;
  /** C1.2: role of creator */
  createdByRole: string;
  /** C1.2: optional reason when rejected */
  rejectionReason?: string | null;
  /** C1.2: append-only audit trail */
  approvalHistory: ApprovalHistoryEntry[];
}

export const PAYMENT_PROPOSALS_COLLECTION = "paymentProposals";

/** Default validity period for a proposal (7 days). */
export const PROPOSAL_EXPIRATION_DAYS = 7;
