import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { collection, collectionGroup, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { getNetworkCapacityOnly, isSoldReservation } from "@/modules/compagnie/networkStats/networkStatsService";
import { CASH_TRANSACTION_STATUS } from "@/modules/compagnie/cash/cashTypes";

export type GlobalDataSnapshot = {
  sales: number;
  cash: number;
  validated: number;
  tickets: number;
  occupancy: number | null;
  lastUpdatedAt: Date | null;
  mode?: "realtime";
};

type Ctx = {
  snapshot: GlobalDataSnapshot;
  loading: boolean;
  error: string | null;
  /** Recompute immediately from latest snapshot data. */
  refresh: () => Promise<void>;
};

const GlobalDataSnapshotContext = React.createContext<Ctx | null>(null);

const DEFAULT_SNAPSHOT: GlobalDataSnapshot = {
  sales: 0,
  cash: 0,
  validated: 0,
  tickets: 0,
  occupancy: null,
  lastUpdatedAt: null,
};

export function GlobalDataSnapshotProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const period = useGlobalPeriodContext();

  const [snapshot, setSnapshot] = React.useState<GlobalDataSnapshot>(DEFAULT_SNAPSHOT);
  // IMPORTANT: no periodic refresh + no global loader on live updates.
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Cache for realtime computation (avoid re-fetch per page).
  const reservationsRef = React.useRef<Array<{ statut?: string; montant?: number; seatsGo?: number }>>([]);
  const cashTxRef = React.useRef<Array<{ status?: string; amount?: number }>>([]);
  const capacityRef = React.useRef<number | null>(null);
  const scheduleRef = React.useRef<number | null>(null);

  const computeAndSetSnapshot = React.useCallback(() => {
    const sold = reservationsRef.current.filter((r) => isSoldReservation(r.statut));
    const tickets = sold.reduce((s, r) => s + (Number(r.seatsGo) || 1), 0);
    const sales = sold.reduce((s, r) => s + (Number(r.montant) || 0), 0);
    const cash = cashTxRef.current
      .filter((t) => (t.status ?? "") === CASH_TRANSACTION_STATUS.PAID)
      .reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const capacity = capacityRef.current;
    const occupancy =
      capacity != null && capacity > 0 ? Math.round((tickets / capacity) * 100) : null;

    setSnapshot((prev) => ({
      ...prev,
      sales,
      cash,
      // validated requires validatedAt listener; not included in realtime sources by design for now
      validated: prev.validated,
      tickets,
      occupancy,
      lastUpdatedAt: new Date(),
      mode: "realtime",
    }));
  }, []);

  const scheduleCompute = React.useCallback(() => {
    if (scheduleRef.current != null) return;
    scheduleRef.current = window.setTimeout(() => {
      scheduleRef.current = null;
      computeAndSetSnapshot();
    }, 120);
  }, [computeAndSetSnapshot]);

  const refresh = React.useCallback(async () => {
    // Manual recompute (no re-fetch lists, just re-derive).
    computeAndSetSnapshot();
  }, [computeAndSetSnapshot]);

  // Realtime listeners (single global provider): reservations(createdAt) + cashTransactions(paidAt)
  React.useEffect(() => {
    if (!companyId) return;
    setError(null);

    setLoading(true); // only for the initial attach
    const start = getStartOfDayInBamako(period.startDate);
    const end = getEndOfDayInBamako(period.endDate);

    const qRes = query(
      collectionGroup(db, "reservations"),
      where("companyId", "==", companyId),
      where("createdAt", ">=", Timestamp.fromDate(start)),
      where("createdAt", "<=", Timestamp.fromDate(end)),
      orderBy("createdAt", "asc")
    );

    // cashTransactions est sous companies/{companyId}/cashTransactions (pas de champ companyId dans le doc).
    const cashRef = collection(db, "companies", companyId, "cashTransactions");
    const qCash =
      period.startDate === period.endDate
        ? query(cashRef, where("paidAt", "==", period.startDate))
        : query(
            cashRef,
            where("paidAt", ">=", period.startDate),
            where("paidAt", "<=", period.endDate),
            orderBy("paidAt", "asc")
          );

    // Capacity isn't realtime-critical; fetch once per period.
    capacityRef.current = null;
    getNetworkCapacityOnly(companyId, period.startDate, period.endDate)
      .then((cap) => {
        capacityRef.current = cap || null;
        scheduleCompute();
      })
      .catch(() => {
        capacityRef.current = null;
        scheduleCompute();
      });

    const unsubRes = onSnapshot(
      qRes,
      (snap) => {
        reservationsRef.current = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            statut: (data.statut ?? data.status ?? "").toString(),
            montant: Number(data.montant ?? data.amount ?? 0) || 0,
            seatsGo: Number(data.seatsGo ?? data.seats ?? data.nbPlaces ?? 1) || 1,
          };
        });
        setLoading(false);
        scheduleCompute();
      },
      (err) => {
        setError(err?.message ?? "Erreur onSnapshot reservations");
        setLoading(false);
      }
    );

    const unsubCash = onSnapshot(
      qCash,
      (snap) => {
        cashTxRef.current = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            status: (data.status ?? data.statut ?? "").toString(),
            amount: Number(data.amount ?? data.montant ?? 0) || 0,
          };
        });
        setLoading(false);
        scheduleCompute();
      },
      (err) => {
        setError(err?.message ?? "Erreur onSnapshot cashTransactions");
        setLoading(false);
      }
    );

    return () => {
      unsubRes();
      unsubCash();
      if (scheduleRef.current != null) {
        window.clearTimeout(scheduleRef.current);
        scheduleRef.current = null;
      }
    };
  }, [companyId, period.startDate, period.endDate, scheduleCompute]);

  const value = React.useMemo<Ctx>(
    () => ({ snapshot, loading, error, refresh }),
    [snapshot, loading, error, refresh]
  );

  return (
    <GlobalDataSnapshotContext.Provider value={value}>
      {children}
    </GlobalDataSnapshotContext.Provider>
  );
}

export function useGlobalDataSnapshot(): Ctx {
  const ctx = React.useContext(GlobalDataSnapshotContext);
  if (!ctx) throw new Error("useGlobalDataSnapshot must be used within GlobalDataSnapshotProvider");
  return ctx;
}

