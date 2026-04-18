import React from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { collection, getDocs, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { getNetworkCapacityOnly } from "@/modules/compagnie/networkStats/networkStatsService";
import { CASH_TRANSACTION_STATUS } from "@/modules/compagnie/cash/cashTypes";
import { isCanonicalCommercialSale, normalizeReservationDocument } from "@/modules/reservations/canonicalReservation";

export type GlobalDataSnapshot = {
  sales: number;
  cash: number;
  tickets: number;
  occupancy: number | null;
  lastUpdatedAt: Date | null;
};

type Ctx = {
  snapshot: GlobalDataSnapshot;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const GlobalDataSnapshotContext = React.createContext<Ctx | null>(null);

export function GlobalDataSnapshotProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const period = useGlobalPeriodContext();

  const [snapshot, setSnapshot] = React.useState<GlobalDataSnapshot>({
    sales: 0,
    cash: 0,
    tickets: 0,
    occupancy: null,
    lastUpdatedAt: null,
  });

  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchData = React.useCallback(async () => {
    if (!companyId) return;

    try {
      setLoading(true);
      setError(null);

      const start = Timestamp.fromDate(getStartOfDayInBamako(period.startDate));
      const end = Timestamp.fromDate(getEndOfDayInBamako(period.endDate));

      const reservationsSnap = await getDocs(
        query(
          collection(db, "companies", companyId, "reservations"),
          where("createdAt", ">=", start),
          where("createdAt", "<=", end)
        )
      );

      const cashSnap = await getDocs(
        query(
          collection(db, "companies", companyId, "cashTransactions"),
          where("createdAt", ">=", start),
          where("createdAt", "<=", end)
        )
      );

      const capacity = await getNetworkCapacityOnly(companyId, period.startDate, period.endDate);

      let sales = 0;
      let tickets = 0;

      reservationsSnap.docs.forEach((d) => {
        const canonical = normalizeReservationDocument(d.data(), { id: d.id });
        if (isCanonicalCommercialSale(canonical)) {
          sales += canonical.amounts.total;
          tickets += canonical.seats.total || 1;
        }
      });

      let cash = 0;
      cashSnap.docs.forEach((d) => {
        const data = d.data();
        if ((data.status ?? data.statut) === CASH_TRANSACTION_STATUS.PAID) {
          cash += Number(data.amount ?? data.montant ?? 0);
        }
      });

      const occupancy =
        capacity && capacity > 0 ? Math.round((tickets / capacity) * 100) : null;

      setSnapshot({
        sales,
        cash,
        tickets,
        occupancy,
        lastUpdatedAt: new Date(),
      });
    } catch (err: any) {
      setError(err?.message ?? "Erreur snapshot");
    } finally {
      setLoading(false);
    }
  }, [companyId, period]);

  React.useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <GlobalDataSnapshotContext.Provider
      value={{ snapshot, loading, error, refresh: fetchData }}
    >
      {children}
    </GlobalDataSnapshotContext.Provider>
  );
}

export function useGlobalDataSnapshot(): Ctx {
  const ctx = React.useContext(GlobalDataSnapshotContext);
  if (!ctx) throw new Error("useGlobalDataSnapshot must be used within provider");
  return ctx;
}