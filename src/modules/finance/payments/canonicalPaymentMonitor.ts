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

// 🔥 cache global robuste (évite duplication multi-pages)
const canonicalPaymentMonitorCache = new Map<
  string,
  {
    expiresAt: number;
    rows: CanonicalPaymentMonitorRow[];
  }
>();

// 🔥 cache plus long pour réduire les reads
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

function toAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeMonitorProvider(value: unknown): CanonicalPaymentMonitorProvider {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;

  if (["wave", "orange", "moov", "sarali", "cash"].includes(raw)) {
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

function normalizeMonitorLedgerStatus(
  value: unknown,
  status: PaymentStatus
): PaymentLedgerStatus {
  const raw = String(value ?? "").trim().toLowerCase();

  if (raw === "posted" || raw === "failed") {
    return raw as PaymentLedgerStatus;
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

  if (["wave", "orange", "moov", "sarali"].includes(provider ?? "")) {
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

// 🔥 fonctions métier (inchangées, correctes)
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

// 🔥 VERSION CORRIGÉE PRINCIPALE
export async function loadCanonicalPaymentsForPeriod(
  companyId: string,
  start: Date,
  end: Date,
  options?: { limitCount?: number }
): Promise<CanonicalPaymentMonitorRow[]> {
  const limitCount = Math.min(options?.limitCount ?? 200, 300); // 🔥 cap dur
  const cacheKey = `${companyId}:${start.getTime()}:${end.getTime()}:${limitCount}`;

  const cached = canonicalPaymentMonitorCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.rows;
  }

  const paymentsRef = collection(db, `companies/${companyId}/payments`);

  // 🔥 UNE SEULE requête — pas de fallback dangereux
  const snap = await getDocs(
    query(
      paymentsRef,
      where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<=", Timestamp.fromDate(end)),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )
  );

  const rows = snap.docs.map((d) =>
    mapCanonicalPaymentMonitorRow(d.id, d.data() as Record<string, unknown>)
  );

  canonicalPaymentMonitorCache.set(cacheKey, {
    rows,
    expiresAt: Date.now() + CACHE_DURATION,
  });

  return rows;
}