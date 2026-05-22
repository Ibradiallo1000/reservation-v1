import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

type OperationType = "reservation" | "parcel";

type AgencyInfo = {
  id: string;
  name: string;
};

type OperationRecord = {
  agencyId: string;
  type: OperationType;
  amount: number;
  createdAtMs: number | null;
};

export type AgencyBusinessMetric = {
  agencyId: string;
  agencyName: string;
  totalReservations: number;
  totalParcels: number;
  totalRevenue: number;
};

export type PlanBusinessMetrics = {
  loading: boolean;
  totalReservations: number;
  totalParcels: number;
  totalOperations: number;
  totalRevenue: number;
  revenuePerAgency: AgencyBusinessMetric[];
  bestAgency: AgencyBusinessMetric | null;
  todayRevenue: number;
  averageLast7DaysRevenue: number;
  revenueAnomaly: boolean;
};

const EMPTY_METRICS: PlanBusinessMetrics = {
  loading: true,
  totalReservations: 0,
  totalParcels: 0,
  totalOperations: 0,
  totalRevenue: 0,
  revenuePerAgency: [],
  bestAgency: null,
  todayRevenue: 0,
  averageLast7DaysRevenue: 0,
  revenueAnomaly: false,
};

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getAmount(data: Record<string, unknown>, type: OperationType): number {
  const direct = toNumber(
    data.totalRevenue ??
      data.totalAmount ??
      data.montant_total ??
      data.montant ??
      data.amount ??
      data.price
  );

  if (direct > 0 || type === "reservation") return direct;

  return toNumber(data.transportFee) + toNumber(data.insuranceAmount);
}

function getTimestampMs(data: Record<string, unknown>): number | null {
  const raw = data.createdAt ?? data.confirmedAt ?? data.updatedAt ?? data.date;

  if (!raw) return null;
  if (raw instanceof Date) return raw.getTime();
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof raw === "object") {
    const value = raw as { toDate?: () => Date; seconds?: number };
    if (typeof value.toDate === "function") return value.toDate().getTime();
    if (typeof value.seconds === "number") return value.seconds * 1000;
  }

  return null;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
}

function readOperationsSnapshot(
  agencyId: string,
  type: OperationType,
  docs: QueryDocumentSnapshot[]
): OperationRecord[] {
  return docs.map((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    return {
      agencyId,
      type,
      amount: getAmount(data, type),
      createdAtMs: getTimestampMs(data),
    };
  });
}

function buildMetrics(
  agencies: Map<string, AgencyInfo>,
  reservationsByAgency: Map<string, OperationRecord[]>,
  parcelsByAgency: Map<string, OperationRecord[]>,
  totalOperations: number,
  loading: boolean
): PlanBusinessMetrics {
  const rows: AgencyBusinessMetric[] = Array.from(agencies.values()).map((agency) => {
    const reservations = reservationsByAgency.get(agency.id) ?? [];
    const parcels = parcelsByAgency.get(agency.id) ?? [];
    const totalReservations = reservations.length;
    const totalParcels = parcels.length;
    const totalRevenue = [...reservations, ...parcels].reduce((sum, row) => sum + row.amount, 0);

    return {
      agencyId: agency.id,
      agencyName: agency.name,
      totalReservations,
      totalParcels,
      totalRevenue,
    };
  });

  rows.sort((a, b) => b.totalRevenue - a.totalRevenue);

  const allOperations = [
    ...Array.from(reservationsByAgency.values()).flat(),
    ...Array.from(parcelsByAgency.values()).flat(),
  ];

  const today = new Date();
  const todayKey = dateKey(today);
  const last7Keys = Array.from({ length: 7 }, (_, index) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (index + 1));
    return dateKey(d);
  });
  const revenueByDay = new Map<string, number>();

  for (const operation of allOperations) {
    if (operation.createdAtMs == null) continue;
    const key = dateKey(new Date(operation.createdAtMs));
    revenueByDay.set(key, (revenueByDay.get(key) ?? 0) + operation.amount);
  }

  const todayRevenue = revenueByDay.get(todayKey) ?? 0;
  const averageLast7DaysRevenue =
    last7Keys.reduce((sum, key) => sum + (revenueByDay.get(key) ?? 0), 0) / 7;

  return {
    loading,
    totalReservations: rows.reduce((sum, row) => sum + row.totalReservations, 0),
    totalParcels: rows.reduce((sum, row) => sum + row.totalParcels, 0),
    totalOperations: Math.max(0, totalOperations),
    totalRevenue: rows.reduce((sum, row) => sum + row.totalRevenue, 0),
    revenuePerAgency: rows,
    bestAgency: rows[0] ?? null,
    todayRevenue,
    averageLast7DaysRevenue,
    revenueAnomaly: averageLast7DaysRevenue > 0 && todayRevenue < averageLast7DaysRevenue * 0.5,
  };
}

export function usePlanBusinessMetrics(companyId: string): PlanBusinessMetrics {
  const [metrics, setMetrics] = useState<PlanBusinessMetrics>(EMPTY_METRICS);

  useEffect(() => {
    if (!companyId) {
      setMetrics({ ...EMPTY_METRICS, loading: false });
      return;
    }

    let childUnsubs: Unsubscribe[] = [];
    const agencies = new Map<string, AgencyInfo>();
    const reservationsByAgency = new Map<string, OperationRecord[]>();
    const parcelsByAgency = new Map<string, OperationRecord[]>();
    let totalOperations = 0;
    let companyReady = false;
    let agenciesReady = false;

    const cleanupChildren = () => {
      childUnsubs.forEach((unsubscribe) => unsubscribe());
      childUnsubs = [];
      reservationsByAgency.clear();
      parcelsByAgency.clear();
    };

    const emit = (loading = false) => {
      setMetrics(
        buildMetrics(
          agencies,
          reservationsByAgency,
          parcelsByAgency,
          totalOperations,
          loading || !companyReady || !agenciesReady
        )
      );
    };

    const unsubscribeCompany = onSnapshot(
      doc(db, "companies", companyId),
      (companySnap) => {
        const data = companySnap.exists() ? (companySnap.data() as Record<string, unknown>) : {};
        totalOperations = Math.max(0, Number(data.currentMonthOperations ?? 0) || 0);
        companyReady = true;
        emit(false);
      },
      () => {
        totalOperations = 0;
        companyReady = true;
        emit(false);
      }
    );

    const unsubscribeAgencies = onSnapshot(
      collection(db, "companies", companyId, "agences"),
      (agencySnap) => {
        cleanupChildren();
        agencies.clear();
        agenciesReady = true;

        agencySnap.docs.forEach((agencyDoc) => {
          const data = agencyDoc.data() as Record<string, unknown>;
          agencies.set(agencyDoc.id, {
            id: agencyDoc.id,
            name: String(data.nom ?? data.name ?? "Agence inconnue"),
          });
        });

        if (agencies.size === 0) {
          emit(false);
          return;
        }

        emit(true);

        agencies.forEach((agency) => {
          childUnsubs.push(
            onSnapshot(
              collection(db, "companies", companyId, "agences", agency.id, "reservations"),
              (snap) => {
                reservationsByAgency.set(
                  agency.id,
                  readOperationsSnapshot(agency.id, "reservation", snap.docs)
                );
                emit(false);
              },
              () => {
                reservationsByAgency.set(agency.id, []);
                emit(false);
              }
            )
          );

          childUnsubs.push(
            onSnapshot(
              collection(db, "companies", companyId, "agences", agency.id, "parcels"),
              (snap) => {
                parcelsByAgency.set(agency.id, readOperationsSnapshot(agency.id, "parcel", snap.docs));
                emit(false);
              },
              () => {
                parcelsByAgency.set(agency.id, []);
                emit(false);
              }
            )
          );
        });
      },
      () => {
        cleanupChildren();
        agencies.clear();
        agenciesReady = true;
        setMetrics({ ...EMPTY_METRICS, loading: false });
      }
    );

    return () => {
      cleanupChildren();
      unsubscribeCompany();
      unsubscribeAgencies();
    };
  }, [companyId]);

  return useMemo(() => metrics, [metrics]);
}
