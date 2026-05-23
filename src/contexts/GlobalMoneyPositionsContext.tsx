import React from "react";
import { useParams } from "react-router-dom";
import { collection, collectionGroup, getDocs, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { CASH_TRANSACTION_STATUS, LOCATION_TYPE } from "@/modules/compagnie/cash/cashTypes";
import { USE_PAYMENTS_AS_SOURCE } from "@/config/featureFlags";
import { isInteractiveRangeTooLarge, largeRangeMessage } from "@/shared/date/periodUtils";

export type MoneyPositionsSnapshot = {
  pendingGuichet: number;
  validatedAgency: number;
  centralised: number;
  byAgency: Record<
    string,
    {
      cashPaid: number;
      validatedAgency: number;
      pendingGuichet: number;
      centralised: number;
    }
  >;
  bySession: Record<
    string,
    Record<
      string,
      {
        cashPaid: number;
        validatedAgency: number;
        pendingGuichet: number;
        centralised: number;
      }
    >
  >;
  inconsistencies: Array<
    | { agencyId: string; type: "NEGATIVE_PENDING"; value: number }
    | { agencyId: string; type: "TX_WITHOUT_SESSION"; count: number }
    | { agencyId: string; type: "VALIDATED_WITHOUT_TX"; sessionId: string }
  >;
  paymentsConfirmedTotal?: number;
  lastUpdatedAt: Date | null;
  mode?: "realtime" | "snapshot";
};

type Ctx = {
  snapshot: MoneyPositionsSnapshot;
  loading: boolean;
  error: string | null;
};

const C = React.createContext<Ctx | null>(null);

const DEFAULT: MoneyPositionsSnapshot = {
  pendingGuichet: 0,
  validatedAgency: 0,
  centralised: 0,
  byAgency: {},
  bySession: {},
  inconsistencies: [],
  lastUpdatedAt: null,
  mode: "snapshot",
};

const CENTRAL_ACCOUNT_TYPES = ["company_bank", "company_mobile_money", "mobile_money"];

function addAmount(target: Record<string, number>, key: string, amount: number) {
  if (!key) return;
  target[key] = (target[key] ?? 0) + amount;
}

function addSessionAmount(
  target: Record<string, Record<string, number>>,
  agencyId: string,
  sessionId: string,
  amount: number
) {
  if (!agencyId || !sessionId) return;
  target[agencyId] = target[agencyId] ?? {};
  target[agencyId][sessionId] = (target[agencyId][sessionId] ?? 0) + amount;
}

function mergeByAgency(params: {
  cashByAgency: Record<string, number>;
  validatedByAgency: Record<string, number>;
  centralByAgency: Record<string, number>;
  txWithoutSessionByAgency: Record<string, number>;
}): Pick<MoneyPositionsSnapshot, "byAgency" | "inconsistencies"> {
  const byAgency: MoneyPositionsSnapshot["byAgency"] = {};
  const inconsistencies: MoneyPositionsSnapshot["inconsistencies"] = [];
  const keys = new Set([
    ...Object.keys(params.cashByAgency),
    ...Object.keys(params.validatedByAgency),
    ...Object.keys(params.centralByAgency),
  ]);

  keys.forEach((agencyId) => {
    const cashPaid = params.cashByAgency[agencyId] ?? 0;
    const validatedAgency = params.validatedByAgency[agencyId] ?? 0;
    const pendingGuichet = cashPaid - validatedAgency;
    const centralised = params.centralByAgency[agencyId] ?? 0;
    byAgency[agencyId] = { cashPaid, validatedAgency, pendingGuichet, centralised };
    if (pendingGuichet < 0) {
      inconsistencies.push({ agencyId, type: "NEGATIVE_PENDING", value: pendingGuichet });
    }
  });

  Object.entries(params.txWithoutSessionByAgency).forEach(([agencyId, count]) => {
    inconsistencies.push({ agencyId, type: "TX_WITHOUT_SESSION", count });
  });

  return { byAgency, inconsistencies };
}

function mergeBySession(params: {
  cashBySession: Record<string, Record<string, number>>;
  validatedBySession: Record<string, Record<string, number>>;
  centralBySession: Record<string, Record<string, number>>;
  inconsistencies: MoneyPositionsSnapshot["inconsistencies"];
}): MoneyPositionsSnapshot["bySession"] {
  const bySession: MoneyPositionsSnapshot["bySession"] = {};
  const agencyIds = new Set([
    ...Object.keys(params.cashBySession),
    ...Object.keys(params.validatedBySession),
    ...Object.keys(params.centralBySession),
  ]);

  agencyIds.forEach((agencyId) => {
    const cash = params.cashBySession[agencyId] ?? {};
    const validated = params.validatedBySession[agencyId] ?? {};
    const central = params.centralBySession[agencyId] ?? {};
    const sessionIds = new Set([...Object.keys(cash), ...Object.keys(validated), ...Object.keys(central)]);
    bySession[agencyId] = {};
    sessionIds.forEach((sessionId) => {
      const cashPaid = cash[sessionId] ?? 0;
      const validatedAgency = validated[sessionId] ?? 0;
      bySession[agencyId][sessionId] = {
        cashPaid,
        validatedAgency,
        pendingGuichet: cashPaid - validatedAgency,
        centralised: central[sessionId] ?? 0,
      };
      if (validatedAgency > 0 && cashPaid === 0) {
        params.inconsistencies.push({ agencyId, type: "VALIDATED_WITHOUT_TX", sessionId });
      }
    });
  });

  return bySession;
}

export function GlobalMoneyPositionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const period = useGlobalPeriodContext();

  const [snapshot, setSnapshot] = React.useState<MoneyPositionsSnapshot>(DEFAULT);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const start = getStartOfDayInBamako(period.startDate);
    const end = getEndOfDayInBamako(period.endDate);
    if (isInteractiveRangeTooLarge(start, end)) {
      setSnapshot(DEFAULT);
      setError(largeRangeMessage());
      setLoading(false);
      return;
    }
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);

    (async () => {
      const cashByAgency: Record<string, number> = {};
      const cashBySession: Record<string, Record<string, number>> = {};
      const txWithoutSessionByAgency: Record<string, number> = {};
      const onlineValidatedByAgency: Record<string, number> = {};
      let cashPaidTotal = 0;
      let onlineValidatedTotal = 0;

      if (USE_PAYMENTS_AS_SOURCE) {
        const movementsSnap = await getDocs(
          query(
            collection(db, "companies", companyId, "financialTransactions"),
            where("type", "==", "payment_received"),
            where("performedAt", ">=", startTs),
            where("performedAt", "<=", endTs),
            orderBy("performedAt", "asc")
          )
        );
        movementsSnap.docs.forEach((d) => {
          const m = d.data() as {
            amount?: number;
            agencyId?: string;
            sourceSessionId?: string;
            sourceType?: string;
            paymentChannel?: string;
            source?: string;
          };
          const sourceType = String(m.sourceType ?? m.paymentChannel ?? m.source ?? "");
          if (sourceType !== "guichet" && sourceType !== "online") return;
          const amount = Number(m.amount ?? 0) || 0;
          const agencyId = String(m.agencyId ?? "");
          cashPaidTotal += amount;
          addAmount(cashByAgency, agencyId, amount);
          addSessionAmount(cashBySession, agencyId, String(m.sourceSessionId ?? ""), amount);
          if (sourceType === "online") {
            onlineValidatedTotal += amount;
            addAmount(onlineValidatedByAgency, agencyId, amount);
          }
        });
      } else {
        const cashSnap = await getDocs(
          query(
            collection(db, "companies", companyId, "cashTransactions"),
            where("createdAt", ">=", startTs),
            where("createdAt", "<=", endTs),
            orderBy("createdAt", "asc")
          )
        );
        cashSnap.docs.forEach((d) => {
          const t = d.data() as any;
          const status = String(t.status ?? "");
          const locType = String(t.locationType ?? "");
          if (status !== CASH_TRANSACTION_STATUS.PAID) return;
          if (locType !== LOCATION_TYPE.AGENCE && locType !== LOCATION_TYPE.ESCALE) return;
          const amount = Number(t.amount ?? 0) || 0;
          const agencyId = String(t.locationId ?? "");
          const sessionId = String(t.sessionId ?? "");
          const sourceType = String(t.sourceType ?? "");
          cashPaidTotal += amount;
          addAmount(cashByAgency, agencyId, amount);
          addSessionAmount(cashBySession, agencyId, sessionId, amount);
          if (sourceType === "online") {
            onlineValidatedTotal += amount;
            addAmount(onlineValidatedByAgency, agencyId, amount);
          }
          if (sourceType === "guichet" && !sessionId.trim()) {
            txWithoutSessionByAgency[agencyId] = (txWithoutSessionByAgency[agencyId] ?? 0) + 1;
          }
        });
      }

      const shiftValidatedByAgency: Record<string, number> = {};
      const shiftValidatedBySession: Record<string, Record<string, number>> = {};
      let shiftValidatedTotal = 0;
      const shiftSnap = await getDocs(
        query(
          collectionGroup(db, "shiftReports"),
          where("companyId", "==", companyId),
          where("status", "==", "validated_agency"),
          where("validatedAt", ">=", startTs),
          where("validatedAt", "<=", endTs),
          orderBy("validatedAt", "asc")
        )
      );
      shiftSnap.docs.forEach((d) => {
        const r = d.data() as any;
        const auditCash = Number(r.validationAudit?.receivedCashAmount ?? 0) || 0;
        const totalCash = Number(r.totalCash ?? r.totalRevenue ?? r.amount ?? 0) || 0;
        const amount = auditCash > 0 ? auditCash : totalCash;
        const agencyId = String(r.agencyId ?? "");
        const sessionId = String(r.shiftId ?? d.id);
        shiftValidatedTotal += amount;
        addAmount(shiftValidatedByAgency, agencyId, amount);
        addSessionAmount(shiftValidatedBySession, agencyId, sessionId, amount);
      });

      const paymentsByAgency: Record<string, number> = {};
      let paymentsConfirmedTotal = 0;
      const paymentsSnap = await getDocs(
        query(
          collection(db, "companies", companyId, "payments"),
          where("status", "==", "validated"),
          where("validatedAt", ">=", startTs),
          where("validatedAt", "<=", endTs),
          orderBy("validatedAt", "asc")
        )
      );
      paymentsSnap.docs.forEach((d) => {
        const data = d.data() as { amount?: number; agencyId?: string };
        const amount = Number(data.amount ?? 0) || 0;
        const agencyId = String(data.agencyId ?? "");
        paymentsConfirmedTotal += amount;
        addAmount(paymentsByAgency, agencyId, amount);
      });

      const centralAccountsSnap = await getDocs(
        query(
          collection(db, "companies", companyId, "financialAccounts"),
          where("isActive", "==", true),
          where("accountType", "in", CENTRAL_ACCOUNT_TYPES as any)
        )
      );
      const centralAccountIds = centralAccountsSnap.docs.map((d) => d.id).slice(0, 10);
      const centralByAgency: Record<string, number> = {};
      const centralBySession: Record<string, Record<string, number>> = {};
      let centralised = 0;
      if (centralAccountIds.length > 0) {
        const centralSnap = await getDocs(
          query(
            collection(db, "companies", companyId, "financialTransactions"),
            where("creditAccountId", "in", centralAccountIds as any),
            where("performedAt", ">=", startTs),
            where("performedAt", "<=", endTs),
            orderBy("performedAt", "asc")
          )
        );
        centralSnap.docs.forEach((d) => {
          const m = d.data() as any;
          const amount = Number(m.amount ?? 0) || 0;
          const agencyId = String(m.agencyId ?? "");
          const sessionId = String(m.sourceSessionId ?? "");
          centralised += amount;
          addAmount(centralByAgency, agencyId, amount);
          addSessionAmount(centralBySession, agencyId, sessionId, amount);
        });
      }

      const validatedByAgency = { ...shiftValidatedByAgency };
      Object.entries(paymentsByAgency).forEach(([agencyId, amount]) => addAmount(validatedByAgency, agencyId, amount));
      Object.entries(onlineValidatedByAgency).forEach(([agencyId, amount]) => addAmount(validatedByAgency, agencyId, amount));

      const validatedAgency = shiftValidatedTotal + paymentsConfirmedTotal + onlineValidatedTotal;
      if (cashPaidTotal <= 0 && paymentsConfirmedTotal > 0) {
        Object.assign(cashByAgency, paymentsByAgency);
        cashPaidTotal = paymentsConfirmedTotal;
      }

      const mergedAgency = mergeByAgency({
        cashByAgency,
        validatedByAgency,
        centralByAgency,
        txWithoutSessionByAgency,
      });
      const bySession = mergeBySession({
        cashBySession,
        validatedBySession: shiftValidatedBySession,
        centralBySession,
        inconsistencies: mergedAgency.inconsistencies,
      });

      if (!cancelled) {
        setSnapshot({
          pendingGuichet: cashPaidTotal - validatedAgency,
          validatedAgency,
          centralised,
          byAgency: mergedAgency.byAgency,
          bySession,
          inconsistencies: mergedAgency.inconsistencies,
          paymentsConfirmedTotal,
          lastUpdatedAt: new Date(),
          mode: "snapshot",
        });
        setLoading(false);
      }
    })().catch((err: any) => {
      if (!cancelled) {
        setError(err?.message ?? "Erreur chargement positions financieres");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [companyId, period.startDate, period.endDate]);

  const value = React.useMemo<Ctx>(() => ({ snapshot, loading, error }), [snapshot, loading, error]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useGlobalMoneyPositions(): Ctx {
  const ctx = React.useContext(C);
  if (!ctx) throw new Error("useGlobalMoneyPositions must be used within GlobalMoneyPositionsProvider");
  return ctx;
}
