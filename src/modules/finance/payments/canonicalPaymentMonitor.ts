import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type {
  PaymentChannel,
  PaymentLedgerStatus,
  PaymentProvider,
  PaymentStatus,
} from "@/types/payment";
import { normalizeChannel } from "@/utils/reservationStatusUtils";

export type CanonicalPaymentMonitorChannel = PaymentChannel | "other";
export type CanonicalPaymentMonitorProvider = PaymentProvider | "other" | null;

export type CanonicalPaymentMonitorRow = {
  id: string;
  reservationId: string | null;
  companyId: string | null;
  agencyId: string | null;
  channel: CanonicalPaymentMonitorChannel;
  provider: CanonicalPaymentMonitorProvider;
  status: PaymentStatus;
  ledgerStatus: PaymentLedgerStatus;
  amount: number;
  currency: string;
  createdAt?: unknown;
  validatedAt?: unknown;
  validatedBy: string | null;
  ledgerError: string | null;
};

function toAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const asObj = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof asObj.toMillis === "function") {
      const ms = asObj.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof asObj.toDate === "function") {
      const d = asObj.toDate();
      return d instanceof Date ? d.getTime() : null;
    }
    if (typeof asObj.seconds === "number" && Number.isFinite(asObj.seconds)) {
      return asObj.seconds * 1000;
    }
  }
  return null;
}

function inWindow(ms: number | null, startMs: number, endMs: number): boolean {
  if (ms == null) return false;
  return ms >= startMs && ms <= endMs;
}

function normalizeMonitorProvider(value: unknown): CanonicalPaymentMonitorProvider {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  if (raw === "wave" || raw === "orange" || raw === "moov" || raw === "sarali" || raw === "cash") {
    return raw as PaymentProvider;
  }
  return "other";
}

function normalizeMonitorStatus(value: unknown): PaymentStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "validated" || raw === "rejected" || raw === "refunded") {
    return raw as PaymentStatus;
  }
  return "pending";
}

function normalizeMonitorLedgerStatus(value: unknown, status: PaymentStatus): PaymentLedgerStatus {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "posted" || raw === "failed") {
    return raw as PaymentLedgerStatus;
  }
  if (raw === "pending") {
    return "pending";
  }
  return status === "validated" ? "pending" : "pending";
}

function normalizeMonitorChannel(
  value: unknown,
  provider: CanonicalPaymentMonitorProvider
): CanonicalPaymentMonitorChannel {
  const normalized = normalizeChannel(String(value ?? ""));
  if (normalized === "guichet" || normalized === "online" || normalized === "courrier") {
    return normalized;
  }
  if (provider === "cash") return "guichet";
  if (provider === "wave" || provider === "orange" || provider === "moov" || provider === "sarali") {
    return "online";
  }
  return "other";
}

export function mapCanonicalPaymentMonitorRow(
  id: string,
  raw: Record<string, unknown>
): CanonicalPaymentMonitorRow {
  const provider = normalizeMonitorProvider(raw.provider);
  const status = normalizeMonitorStatus(raw.status);

  return {
    id,
    reservationId: typeof raw.reservationId === "string" ? raw.reservationId : null,
    companyId: typeof raw.companyId === "string" ? raw.companyId : null,
    agencyId: typeof raw.agencyId === "string" ? raw.agencyId : null,
    channel: normalizeMonitorChannel(raw.channel, provider),
    provider,
    status,
    ledgerStatus: normalizeMonitorLedgerStatus(raw.ledgerStatus, status),
    amount: toAmount(raw.amount),
    currency: typeof raw.currency === "string" ? raw.currency : "XOF",
    createdAt: raw.createdAt,
    validatedAt: raw.validatedAt,
    validatedBy: typeof raw.validatedBy === "string" ? raw.validatedBy : null,
    ledgerError:
      raw.ledgerError == null
        ? null
        : typeof raw.ledgerError === "string"
          ? raw.ledgerError
          : String(raw.ledgerError),
  };
}

export function isCanonicalPendingOperatorPayment(row: CanonicalPaymentMonitorRow): boolean {
  return row.channel === "online" && row.status === "pending";
}

export function isCanonicalLedgerPendingPayment(row: CanonicalPaymentMonitorRow): boolean {
  return row.status === "validated" && row.ledgerStatus === "pending";
}

export function isCanonicalLedgerFailedPayment(row: CanonicalPaymentMonitorRow): boolean {
  return row.ledgerStatus === "failed";
}

export function isCanonicalOnlinePaymentToMonitor(row: CanonicalPaymentMonitorRow): boolean {
  return row.channel === "online" && (row.status !== "validated" || row.ledgerStatus !== "posted");
}

export async function loadCanonicalPaymentsForPeriod(
  companyId: string,
  start: Date,
  end: Date,
  options?: { limitCount?: number }
): Promise<CanonicalPaymentMonitorRow[]> {
  const paymentsRef = collection(db, `companies/${companyId}/payments`);
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);
  const limitCount = options?.limitCount ?? 2000;

  try {
    const snap = await getDocs(
      query(
        paymentsRef,
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "desc"),
        limit(limitCount)
      )
    );
    return snap.docs.map((d) => mapCanonicalPaymentMonitorRow(d.id, d.data() as Record<string, unknown>));
  } catch (err) {
    console.warn("[canonicalPaymentMonitor] payments range query fallback:", err);
    const snap = await getDocs(query(paymentsRef, orderBy("createdAt", "desc"), limit(limitCount)));
    const startMs = start.getTime();
    const endMs = end.getTime();
    return snap.docs
      .map((d) => mapCanonicalPaymentMonitorRow(d.id, d.data() as Record<string, unknown>))
      .filter((row) => inWindow(toMillis(row.createdAt) ?? toMillis(row.validatedAt), startMs, endMs));
  }
}
