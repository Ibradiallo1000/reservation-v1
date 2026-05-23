import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { collection, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { getNetworkCapacityOnly } from "@/modules/compagnie/networkStats/networkStatsService";
import { CASH_TRANSACTION_STATUS } from "@/modules/compagnie/cash/cashTypes";
import { getUnifiedCommercialActivity } from "@/modules/compagnie/networkStats/activityCore";
import { isInteractiveRangeTooLarge, largeRangeMessage } from "@/shared/date/periodUtils";

export type GlobalDataSnapshot = {
  sales: number;
  cash: number;
  tickets: number;
  occupancy: number | null;
  lastUpdatedAt: Date | null;
  mode?: "realtime" | "snapshot";
};

type Ctx = {
  snapshot: GlobalDataSnapshot;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const GlobalDataSnapshotContext = React.createContext<Ctx | null>(null);

const DEFAULT_SNAPSHOT: GlobalDataSnapshot = {
  sales: 0,
  cash: 0,
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
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    if (!companyId) {
      setSnapshot(DEFAULT_SNAPSHOT);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const start = getStartOfDayInBamako(period.startDate);
      const end = getEndOfDayInBamako(period.endDate);
      if (isInteractiveRangeTooLarge(start, end)) {
        setError(largeRangeMessage());
        setSnapshot(DEFAULT_SNAPSHOT);
        return;
      }
      const startTs = Timestamp.fromDate(start);
      const endTs = Timestamp.fromDate(end);

      const cashRef = collection(db, "companies", companyId, "cashTransactions");
      const qCash = query(
        cashRef,
        where("createdAt", ">=", startTs),
        where("createdAt", "<=", endTs),
        orderBy("createdAt", "asc")
      );

      const [activity, cashSnap, capacity] = await Promise.all([
        getUnifiedCommercialActivity(companyId, { dateFrom: period.startDate, dateTo: period.endDate }),
        getDocs(qCash),
        getNetworkCapacityOnly(companyId, period.startDate, period.endDate),
      ]);

      const tickets = activity.billets.tickets;
      const sales = activity.totalAmount;
      const cash = cashSnap.docs.reduce((sum, docSnap) => {
        const data = docSnap.data() as { status?: string; statut?: string; amount?: number; montant?: number };
        const status = (data.status ?? data.statut ?? "").toString();
        if (status !== CASH_TRANSACTION_STATUS.PAID) return sum;
        return sum + (Number(data.amount ?? data.montant ?? 0) || 0);
      }, 0);
      const occupancy = capacity && capacity > 0 ? Math.round((tickets / capacity) * 100) : null;

      setSnapshot({
        sales,
        cash,
        tickets,
        occupancy,
        lastUpdatedAt: new Date(),
        mode: "snapshot",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur snapshot global");
      setSnapshot(DEFAULT_SNAPSHOT);
    } finally {
      setLoading(false);
    }
  }, [companyId, period.startDate, period.endDate]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

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
