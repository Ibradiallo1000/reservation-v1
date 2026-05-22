import type { QueryDocumentSnapshot } from "firebase/firestore";
import { Timestamp } from "firebase/firestore";
import { normalizeReservation } from "@/lib/normalizeReservation";
import { normalizePlan, type Plan } from "@/core/subscription/plans";
import {
  SYSTEM_PLANS_DEFAULTS,
  type SystemPlanId,
  type SystemPlansConfig,
  type SystemPlanValues,
} from "./systemPlansConfig";

type FirestoreLikeRecord = Record<string, unknown>;

export type AdminCompanyRecord = {
  id: string;
  name: string;
  slug: string;
  email: string;
  telephone: string;
  pays: string;
  status: string;
  plan: Plan;
  subscriptionStatus: string;
  currentMonthOperations: number;
  totalPaymentsReceived: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  lastPaymentAt: Date | null;
  nextBillingDate: Date | null;
};

export type AdminActivityRecord = {
  id: string;
  companyId: string;
  agencyId: string;
  kind: "reservation" | "shipment";
  amount: number;
  createdAt: Date | null;
  label: string;
};

function isRecord(value: unknown): value is FirestoreLikeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toNumber(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (isRecord(value)) {
    const timestampLike = value as { toDate?: () => Date; seconds?: number };
    if (typeof timestampLike.toDate === "function") {
      const date = timestampLike.toDate();
      return Number.isNaN(date.getTime()) ? null : date;
    }
    if (typeof timestampLike.seconds === "number") {
      const date = new Date(timestampLike.seconds * 1000);
      return Number.isNaN(date.getTime()) ? null : date;
    }
  }
  return null;
}

function normalizePlanValues(raw: unknown, fallback: SystemPlanValues): SystemPlanValues {
  const data = isRecord(raw) ? raw : {};
  return {
    price: toNumber(data.price, fallback.price),
    includedOperations: toNumber(data.includedOperations, fallback.includedOperations),
    overage: toNumber(data.overage, fallback.overage),
  };
}

export function mergeAdminPlansConfig(raw: unknown): SystemPlansConfig {
  const data = isRecord(raw) ? raw : {};

  return {
    standard: {
      ...SYSTEM_PLANS_DEFAULTS.standard,
      ...normalizePlanValues(data.standard, SYSTEM_PLANS_DEFAULTS.standard),
    },
    premium: {
      ...SYSTEM_PLANS_DEFAULTS.premium,
      ...normalizePlanValues(data.premium, SYSTEM_PLANS_DEFAULTS.premium),
    },
  };
}

export function planLabel(plan: Plan): string {
  return plan === "premium" ? "PREMIUM" : "STANDARD";
}

export function formatDate(value: Date | null): string {
  if (!value) return "--";
  return value.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(value: Date | null): string {
  if (!value) return "--";
  return value.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getCompanyPlanConfig(
  plans: SystemPlansConfig,
  plan: Plan | string | null | undefined
): SystemPlansConfig[SystemPlanId] {
  return plans[normalizePlan(plan)];
}

export function getCompanyUsageRatio(
  company: Pick<AdminCompanyRecord, "plan" | "currentMonthOperations">,
  plans: SystemPlansConfig
): number {
  const config = getCompanyPlanConfig(plans, company.plan);
  if (config.includedOperations <= 0) return 0;
  return Math.min(1, company.currentMonthOperations / config.includedOperations);
}

export function isCompanyBillable(company: Pick<AdminCompanyRecord, "status" | "subscriptionStatus">): boolean {
  const status = String(company.status || "").toLowerCase();
  const subscriptionStatus = String(company.subscriptionStatus || "").toLowerCase();
  return status !== "inactif" && subscriptionStatus !== "suspended";
}

export function normalizeCompanyRecord(id: string, raw: unknown): AdminCompanyRecord {
  const data = isRecord(raw) ? raw : {};
  return {
    id,
    name: String(data.nom ?? data.name ?? id),
    slug: String(data.slug ?? ""),
    email: String(data.email ?? ""),
    telephone: String(data.telephone ?? data.phone ?? ""),
    pays: String(data.pays ?? ""),
    status: String(data.status ?? "actif"),
    plan: normalizePlan(String(data.plan ?? data.planId ?? "")),
    subscriptionStatus: String(data.subscriptionStatus ?? "active"),
    currentMonthOperations: Math.max(0, toNumber(data.currentMonthOperations, 0)),
    totalPaymentsReceived: Math.max(0, toNumber(data.totalPaymentsReceived, 0)),
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
    lastPaymentAt: toDate(data.lastPaymentAt),
    nextBillingDate: toDate(data.nextBillingDate),
  };
}

function extractPathValue(path: string, segment: string): string {
  const parts = path.split("/");
  const index = parts.indexOf(segment);
  if (index < 0 || index + 1 >= parts.length) return "";
  return parts[index + 1] ?? "";
}

function isReservationConfirmed(data: FirestoreLikeRecord): boolean {
  const normalized = normalizeReservation(data);
  const paymentStatus = String(normalized.payment.status ?? "").trim().toLowerCase();
  const reservationStatus = String(normalized.reservation.status ?? "").trim().toLowerCase();
  const rawStatus = String(data.status ?? data.statut ?? "").trim().toLowerCase();

  return (
    paymentStatus === "paid" ||
    ["confirmed", "confirme", "confirmee", "confirmee", "paye", "payee", "paye", "payee", "payé"].includes(
      reservationStatus
    ) ||
    ["confirmed", "confirme", "confirmee", "confirmee", "paye", "payee", "payee", "payé"].includes(
      rawStatus
    )
  );
}

export function normalizeReservationActivity(
  docSnap: QueryDocumentSnapshot
): AdminActivityRecord | null {
  const data = docSnap.data() as FirestoreLikeRecord;
  if (!isReservationConfirmed(data)) return null;

  const normalized = normalizeReservation(data);
  const amount = Math.max(
    0,
    toNumber(data.montant ?? data.total ?? data.amount ?? normalized.payment.amount, 0)
  );
  const companyId = String(
    data.companyId ?? normalized.companyId ?? extractPathValue(docSnap.ref.path, "companies")
  );
  const agencyId = String(
    data.agencyId ?? normalized.agencyId ?? extractPathValue(docSnap.ref.path, "agences")
  );

  return {
    id: docSnap.id,
    companyId,
    agencyId,
    kind: "reservation",
    amount,
    createdAt: toDate(data.createdAt ?? normalized.reservation.createdAt ?? data.date),
    label: "Billet",
  };
}

export function normalizeShipmentActivity(
  docSnap: QueryDocumentSnapshot
): AdminActivityRecord | null {
  const data = docSnap.data() as FirestoreLikeRecord;
  const paymentStatus = String(data.paymentStatus ?? "").trim().toUpperCase();
  if (!["PAID_ORIGIN", "PAID_DESTINATION"].includes(paymentStatus)) return null;

  return {
    id: docSnap.id,
    companyId: extractPathValue(docSnap.ref.path, "companies"),
    agencyId: String(data.originAgencyId ?? ""),
    kind: "shipment",
    amount: Math.max(0, toNumber(data.transportFee, 0) + toNumber(data.insuranceAmount, 0)),
    createdAt: toDate(data.createdAt),
    label: "Colis",
  };
}
