// Phase C — Payables service. No cash movement at creation; ledger only on payment.
import {
  collection,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { PayableDoc, PayableDocCreate, PayableStatus, ApprovalStatus } from "./payablesTypes";
import { PAYABLES_COLLECTION } from "./payablesTypes";

function payablesRef(companyId: string) {
  return collection(db, `companies/${companyId}/${PAYABLES_COLLECTION}`);
}

export function payableRef(companyId: string, payableId: string) {
  return doc(db, `companies/${companyId}/${PAYABLES_COLLECTION}/${payableId}`);
}

function computeStatus(totalAmount: number, amountPaid: number): PayableStatus {
  if (amountPaid <= 0) return "pending";
  if (amountPaid >= totalAmount) return "paid";
  return "partially_paid";
}

/** Create payable (pending approval). No ledger movement. */
export async function createPayable(
  companyId: string,
  input: PayableDocCreate
): Promise<string> {
  const ref = doc(payablesRef(companyId));
  const totalAmount = Number(input.totalAmount) || 0;
  const now = Timestamp.now();
  const data: Omit<PayableDoc, "updatedAt"> & { updatedAt: ReturnType<typeof serverTimestamp> } = {
    supplierName: input.supplierName,
    vehicleId: input.vehicleId ?? null,
    agencyId: input.agencyId,
    category: input.category,
    description: input.description,
    totalAmount,
    amountPaid: 0,
    remainingAmount: totalAmount,
    status: "pending",
    dueDate: input.dueDate ?? null,
    createdBy: input.createdBy,
    approvalStatus: "pending",
    createdAt: now,
    lastPaymentAt: null,
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return ref.id;
}

/** Approve payable (company_accountant | financial_director | admin_compagnie). */
export async function approvePayable(
  companyId: string,
  payableId: string,
  approvedBy: string,
  approvedByRole?: string | null
): Promise<void> {
  const ref = payableRef(companyId, payableId);
  await updateDoc(ref, {
    approvalStatus: "approved" as ApprovalStatus,
    approvedBy,
    approvedAt: serverTimestamp(),
    approvedByRole: approvedByRole ?? null,
    updatedAt: serverTimestamp(),
  });
}

/** Reject payable. */
export async function rejectPayable(
  companyId: string,
  payableId: string,
  approvedBy: string,
  approvedByRole?: string | null
): Promise<void> {
  const ref = payableRef(companyId, payableId);
  await updateDoc(ref, {
    approvalStatus: "rejected" as ApprovalStatus,
    approvedBy,
    approvedAt: serverTimestamp(),
    approvedByRole: approvedByRole ?? null,
    updatedAt: serverTimestamp(),
  });
}

/** List payables by agency. */
export async function listPayablesByAgency(
  companyId: string,
  agencyId: string,
  options?: { status?: PayableStatus; limitCount?: number }
): Promise<(PayableDoc & { id: string })[]> {
  const ref = payablesRef(companyId);
  const constraints: ReturnType<typeof where>[] = [where("agencyId", "==", agencyId)];
  if (options?.status) constraints.push(where("status", "==", options.status));
  const q = query(
    ref,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayableDoc & { id: string }));
}

/** List payables by status (company-wide). */
export async function listPayablesByStatus(
  companyId: string,
  status: PayableStatus,
  options?: { agencyId?: string; limitCount?: number }
): Promise<(PayableDoc & { id: string })[]> {
  const ref = payablesRef(companyId);
  const constraints: ReturnType<typeof where>[] = [where("status", "==", status)];
  if (options?.agencyId) constraints.push(where("agencyId", "==", options.agencyId));
  const q = query(
    ref,
    ...constraints,
    orderBy("createdAt", "desc"),
    limit(options?.limitCount ?? 100)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PayableDoc & { id: string }));
}

/** List all payables with remainingAmount > 0 (pending + partially_paid). */
export async function listUnpaidPayables(
  companyId: string,
  options?: { limitCount?: number }
): Promise<(PayableDoc & { id: string })[]> {
  const [pending, partial] = await Promise.all([
    listPayablesByStatus(companyId, "pending", { limitCount: options?.limitCount ?? 200 }),
    listPayablesByStatus(companyId, "partially_paid", { limitCount: options?.limitCount ?? 200 }),
  ]);
  const byId = new Map<string, PayableDoc & { id: string }>();
  pending.forEach((p) => byId.set(p.id, p));
  partial.forEach((p) => byId.set(p.id, p));
  return Array.from(byId.values());
}

export type { PayableDoc, PayableDocCreate, PayableStatus, ApprovalStatus };
