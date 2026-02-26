// Phase C — Payables (credit supplier). companies/{companyId}/payables/{payableId}
import type { Timestamp } from "firebase/firestore";

export const PAYABLE_CATEGORIES = ["fuel", "parts", "maintenance", "other"] as const;
export type PayableCategory = (typeof PAYABLE_CATEGORIES)[number];

export const PAYABLE_STATUSES = ["pending", "partially_paid", "paid"] as const;
export type PayableStatus = (typeof PAYABLE_STATUSES)[number];

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export interface PayableDoc {
  supplierName: string;
  vehicleId?: string | null;
  agencyId: string;
  category: PayableCategory;
  description: string;
  totalAmount: number;
  amountPaid: number;
  remainingAmount: number;
  status: PayableStatus;
  dueDate?: Timestamp | null;
  createdBy: string;
  approvedBy?: string | null;
  approvalStatus: ApprovalStatus;
  approvedAt?: Timestamp | null;
  approvedByRole?: string | null;
  createdAt: Timestamp;
  lastPaymentAt?: Timestamp | null;
  updatedAt: Timestamp;
}

export interface PayableDocCreate {
  supplierName: string;
  vehicleId?: string | null;
  agencyId: string;
  category: PayableCategory;
  description: string;
  totalAmount: number;
  createdBy: string;
  dueDate?: Timestamp | null;
}

export const PAYABLES_COLLECTION = "payables";
