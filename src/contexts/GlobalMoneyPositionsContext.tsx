import React from "react";
import { useParams } from "react-router-dom";
import { collection, collectionGroup, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { CASH_TRANSACTION_STATUS, LOCATION_TYPE } from "@/modules/compagnie/cash/cashTypes";
import { isConfirmedTransactionStatus } from "@/modules/compagnie/treasury/financialTransactions";
import { USE_PAYMENTS_AS_SOURCE } from "@/config/featureFlags";

export type MoneyPositionsSnapshot = {
  /** GUICHET (en attente validation) */
  pendingGuichet: number;
  /** VALIDÉ AGENCE */
  validatedAgency: number;
  /** CENTRALISÉ (comptes entreprise banque / mobile money) */
  centralised: number;
  /** Détails par agence (clé = agencyId) */
  byAgency: Record<
    string,
    {
      cashPaid: number;
      validatedAgency: number;
      pendingGuichet: number;
      centralised: number;
    }
  >;
  /** Détails par session (clé = agencyId -> sessionId). */
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
  /** Incohérences détectées (ex: pendingGuichet négatif). */
  inconsistencies: Array<
    | { agencyId: string; type: "NEGATIVE_PENDING"; value: number }
    | { agencyId: string; type: "TX_WITHOUT_SESSION"; count: number }
    | { agencyId: string; type: "VALIDATED_WITHOUT_TX"; sessionId: string }
  >;
  /** Total des payments validés ET ledger postés sur la période (pas de pending/failed). */
  paymentsConfirmedTotal?: number;
  lastUpdatedAt: Date | null;
  mode?: "realtime";
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
  mode: "realtime",
};

const CENTRAL_ACCOUNT_TYPES = ["company_bank", "company_mobile_money", "mobile_money"];

export function GlobalMoneyPositionsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const period = useGlobalPeriodContext();

  const [snapshot, setSnapshot] = React.useState<MoneyPositionsSnapshot>(DEFAULT);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const pendingGuichetRef = React.useRef(0);
  const validatedAgencyRef = React.useRef(0);
  const centralisedRef = React.useRef(0);
  const cashPaidTotalRef = React.useRef(0);
  const cashPaidByAgencyRef = React.useRef<Record<string, number>>({});
  const validatedAgencyByAgencyRef = React.useRef<Record<string, number>>({});
  const centralisedByAgencyRef = React.useRef<Record<string, number>>({});
  const cashPaidBySessionRef = React.useRef<Record<string, Record<string, number>>>({});
  const validatedAgencyBySessionRef = React.useRef<Record<string, Record<string, number>>>({});
  const centralisedBySessionRef = React.useRef<Record<string, Record<string, number>>>({});
  const byAgencyRef = React.useRef<MoneyPositionsSnapshot["byAgency"]>({});
  const bySessionRef = React.useRef<MoneyPositionsSnapshot["bySession"]>({});
  const inconsistenciesRef = React.useRef<MoneyPositionsSnapshot["inconsistencies"]>([]);
  const paymentsConfirmedRef = React.useRef(0);
  const validatedAgencyShiftOnlyRef = React.useRef(0);
  const validatedAgencyByAgencyShiftOnlyRef = React.useRef<Record<string, number>>({});
  const validatedAgencyBySessionShiftOnlyRef = React.useRef<Record<string, Record<string, number>>>({});
  const scheduleRef = React.useRef<number | null>(null);

  const commit = React.useCallback(() => {
    setSnapshot({
      pendingGuichet: pendingGuichetRef.current,
      validatedAgency: validatedAgencyRef.current,
      centralised: centralisedRef.current,
      byAgency: byAgencyRef.current,
      bySession: bySessionRef.current,
      inconsistencies: inconsistenciesRef.current,
      paymentsConfirmedTotal: paymentsConfirmedRef.current,
      lastUpdatedAt: new Date(),
      mode: "realtime",
    });
  }, []);

  const scheduleCommit = React.useCallback(() => {
    if (scheduleRef.current != null) return;
    scheduleRef.current = window.setTimeout(() => {
      scheduleRef.current = null;
      commit();
    }, 120);
  }, [commit]);

  React.useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    const start = getStartOfDayInBamako(period.startDate);
    const end = getEndOfDayInBamako(period.endDate);
    const startTs = Timestamp.fromDate(start);
    const endTs = Timestamp.fromDate(end);

    // 1) Encaissements cash : filtre createdAt + période (Bamako) — interdit : where/orderBy sur paidAt (string).
    const cashTxRefCol = collection(db, "companies", companyId, "cashTransactions");
    const qCashTx = query(
      cashTxRefCol,
      where("createdAt", ">=", startTs),
      where("createdAt", "<=", endTs),
      orderBy("createdAt", "asc")
    );

    const movementsRefCol = collection(db, "companies", companyId, "financialTransactions");
    const qMovementsPayment = query(
      movementsRefCol,
      where("type", "==", "payment_received"),
      where("performedAt", ">=", startTs),
      where("performedAt", "<=", endTs),
      orderBy("performedAt", "asc")
    );

    // 2) VALIDÉ AGENCE = sessions validées par comptable agence (source unique = validationAudit)
    // On utilise shiftReports car il contient status=validated_agency + validationAudit + validatedAt.
    const qShiftReportsValidatedAgency = query(
      collectionGroup(db, "shiftReports"),
      where("companyId", "==", companyId),
      where("status", "==", "validated_agency"),
      where("validatedAt", ">=", startTs),
      where("validatedAt", "<=", endTs),
      orderBy("validatedAt", "asc")
    );

    // 3) CENTRALISÉ = financialTransactions vers comptes entreprise (source unique = flux)
    // Étape A: écouter les comptes entreprise pour obtenir les IDs de comptes "central".
    const qCentralAccounts = query(
      collection(db, "companies", companyId, "financialAccounts"),
      where("isActive", "==", true),
      where("accountType", "in", CENTRAL_ACCOUNT_TYPES as any)
    );

    const centralAccountIdsRef = { current: [] as string[] };
    let unsubCentralMovements: null | (() => void) = null;

    const attachCentralMovementsListener = (accountIds: string[]) => {
      if (unsubCentralMovements) {
        unsubCentralMovements();
        unsubCentralMovements = null;
      }
      // Firestore "in" max 10; if more, truncate to avoid crashing (rare).
      const ids = accountIds.slice(0, 10);
      if (ids.length === 0) {
        centralisedRef.current = 0;
        scheduleCommit();
        return;
      }
      const qMov = query(
        collection(db, "companies", companyId, "financialTransactions"),
        where("creditAccountId", "in", ids as any),
        where("performedAt", ">=", startTs),
        where("performedAt", "<=", endTs),
        orderBy("performedAt", "asc")
      );
      unsubCentralMovements = onSnapshot(
        qMov,
        (snap) => {
          let total = 0;
          const byAgency: Record<string, number> = {};
          const seen = new Set<string>();
          let duplicates = 0;
          snap.docs.forEach((d) => {
            const m = d.data() as any;
            if (!isConfirmedTransactionStatus(String(m.status ?? "") as any)) return;
            const key = String(m.uniqueReferenceKey ?? d.id);
            if (seen.has(key)) duplicates += 1;
            else seen.add(key);
            // Source de vérité = mouvements crédit vers comptes central.
            const amt = Number(m.amount ?? 0) || 0;
            total += amt;
            const agencyId = String(m.agencyId ?? "");
            if (agencyId) byAgency[agencyId] = (byAgency[agencyId] ?? 0) + amt;
          });
          centralisedRef.current = total;
          centralisedByAgencyRef.current = byAgency;
          // best-effort par session via sourceSessionId si présent
          const bySession: Record<string, Record<string, number>> = {};
          snap.docs.forEach((d) => {
            const m = d.data() as any;
            if (!isConfirmedTransactionStatus(String(m.status ?? "") as any)) return;
            const agencyId = String(m.agencyId ?? "");
            const sid = String(m.sourceSessionId ?? "");
            if (!agencyId || !sid) return;
            const amt = Number(m.amount ?? 0) || 0;
            bySession[agencyId] = bySession[agencyId] ?? {};
            bySession[agencyId][sid] = (bySession[agencyId][sid] ?? 0) + amt;
          });
          centralisedBySessionRef.current = bySession;
          // Note: duplicates is computed for debug; expose via inconsistencies if needed.
          setLoading(false);
          scheduleCommit();
        },
        (err) => {
          setError(err?.message ?? "Erreur onSnapshot financialTransactions");
          setLoading(false);
        }
      );
    };

    const applyCashPayload = (
      totalPaid: number,
      byAgency: Record<string, number>,
      bySession: Record<string, Record<string, number>>,
      txWithoutSessionByAgency: Record<string, number>
    ) => {
      cashPaidTotalRef.current = totalPaid;
      cashPaidByAgencyRef.current = byAgency;
      cashPaidBySessionRef.current = bySession;
      pendingGuichetRef.current = cashPaidTotalRef.current - validatedAgencyRef.current;
      const validatedByAgency = validatedAgencyByAgencyRef.current;
      const pendingByAgency: Record<string, number> = {};
      Object.keys(byAgency).forEach((aid) => {
        pendingByAgency[aid] = (byAgency[aid] ?? 0) - (validatedByAgency[aid] ?? 0);
      });
      Object.keys(validatedByAgency).forEach((aid) => {
        if (pendingByAgency[aid] === undefined) pendingByAgency[aid] = 0 - (validatedByAgency[aid] ?? 0);
      });
      const out: MoneyPositionsSnapshot["byAgency"] = {};
      const outSessions: MoneyPositionsSnapshot["bySession"] = {};
      const inconsistencies: MoneyPositionsSnapshot["inconsistencies"] = [];
      const centralByAgency = centralisedByAgencyRef.current;
      const cashByAgency = byAgency;
      Object.keys({ ...cashByAgency, ...validatedByAgency, ...centralByAgency }).forEach((aid) => {
        const cashPaid = cashByAgency[aid] ?? 0;
        const val = validatedByAgency[aid] ?? 0;
        const pend = pendingByAgency[aid] ?? 0;
        const cent = centralByAgency[aid] ?? 0;
        out[aid] = { cashPaid, validatedAgency: val, pendingGuichet: pend, centralised: cent };
        if (pend < 0) inconsistencies.push({ agencyId: aid, type: "NEGATIVE_PENDING", value: pend });
      });
      Object.keys(txWithoutSessionByAgency).forEach((aid) => {
        inconsistencies.push({ agencyId: aid, type: "TX_WITHOUT_SESSION", count: txWithoutSessionByAgency[aid] ?? 0 });
      });
      const hasCashSessionInfo = Object.keys(bySession).length > 0;
      if (hasCashSessionInfo) {
        const validatedSessions = validatedAgencyBySessionRef.current;
        const centralSessions = centralisedBySessionRef.current;
        Object.keys({ ...bySession, ...validatedSessions, ...centralSessions }).forEach((aid) => {
          const cashS = bySession[aid] ?? {};
          const valS = validatedSessions[aid] ?? {};
          const centS = centralSessions[aid] ?? {};
          const allSessionIds = new Set<string>([...Object.keys(cashS), ...Object.keys(valS), ...Object.keys(centS)]);
          outSessions[aid] = outSessions[aid] ?? {};
          allSessionIds.forEach((sid) => {
            const cashPaid = cashS[sid] ?? 0;
            const validatedAgency = valS[sid] ?? 0;
            outSessions[aid][sid] = {
              cashPaid,
              validatedAgency,
              pendingGuichet: cashPaid - validatedAgency,
              centralised: centS[sid] ?? 0,
            };
            if (validatedAgency > 0 && cashPaid === 0) {
              inconsistencies.push({ agencyId: aid, type: "VALIDATED_WITHOUT_TX", sessionId: sid });
            }
          });
        });
      }
      byAgencyRef.current = out;
      bySessionRef.current = outSessions;
      inconsistenciesRef.current = inconsistencies;
      setLoading(false);
      scheduleCommit();
    };

    const recomputeValidatedAgencyTotals = () => {
      // Source de verite "valide agence" : uniquement shiftReports (validation comptable agence).
      const totalValidated = validatedAgencyShiftOnlyRef.current;
      const byAgencyMerged: Record<string, number> = {
        ...validatedAgencyByAgencyShiftOnlyRef.current,
      };

      validatedAgencyRef.current = totalValidated;
      validatedAgencyByAgencyRef.current = byAgencyMerged;
      // Les validations online n'ont pas de session guichet: on garde le detail session base sur shiftReports.
      validatedAgencyBySessionRef.current = validatedAgencyBySessionShiftOnlyRef.current;
      pendingGuichetRef.current = cashPaidTotalRef.current - validatedAgencyRef.current;
    };

    let unsubCash: () => void;
    // Phase 3 : si USE_PAYMENTS_AS_SOURCE, source = financialTransactions (payment_received) ; cashTransactions non utilisés.
    if (USE_PAYMENTS_AS_SOURCE) {
      unsubCash = onSnapshot(
        qMovementsPayment,
        (snap) => {
          let totalPaid = 0;
          const byAgency: Record<string, number> = {};
          const bySession: Record<string, Record<string, number>> = {};
          snap.docs.forEach((d) => {
            const m = d.data() as {
              amount?: number;
              agencyId?: string;
              sourceSessionId?: string;
              sourceType?: string;
              paymentChannel?: string;
              source?: string;
              status?: string;
            };
            if (!isConfirmedTransactionStatus(String(m?.status ?? "") as any)) return;
            // Le KPI "pendingGuichet" doit rester aligné sur encaissements guichet/online.
            // Les paiements courrier (sourceType="courrier") alimentent le ledger mais ne doivent pas polluer ce KPI.
            const st = String(m?.sourceType ?? m?.paymentChannel ?? m?.source ?? "");
            if (st !== "guichet" && st !== "online") return;
            const amt = Number(m?.amount ?? 0) || 0;
            totalPaid += amt;
            const agencyId = String(m?.agencyId ?? "");
            if (agencyId) byAgency[agencyId] = (byAgency[agencyId] ?? 0) + amt;
            const sid = String(m?.sourceSessionId ?? "");
            if (agencyId && sid) {
              bySession[agencyId] = bySession[agencyId] ?? {};
              bySession[agencyId][sid] = (bySession[agencyId][sid] ?? 0) + amt;
            }
          });
          recomputeValidatedAgencyTotals();
          applyCashPayload(totalPaid, byAgency, bySession, {});
        },
        (err) => {
          setError(err?.message ?? "Erreur onSnapshot financialTransactions (payment_received)");
          setLoading(false);
        }
      );
    } else {
      unsubCash = onSnapshot(
        qCashTx,
        (snap) => {
          let totalPaid = 0;
          const byAgency: Record<string, number> = {};
          const bySession: Record<string, Record<string, number>> = {};
          const txWithoutSessionByAgency: Record<string, number> = {};
          snap.docs.forEach((d) => {
            const t = d.data() as any;
            const status = String(t.status ?? "");
            const locType = String(t.locationType ?? "");
            if (status !== CASH_TRANSACTION_STATUS.PAID) return;
            if (locType !== LOCATION_TYPE.AGENCE && locType !== LOCATION_TYPE.ESCALE) return;
            const amt = Number(t.amount ?? 0) || 0;
            totalPaid += amt;
            const agencyId = String(t.locationId ?? "");
            if (agencyId) byAgency[agencyId] = (byAgency[agencyId] ?? 0) + amt;
            const sid = String(t.sessionId ?? "");
            const sourceType = String(t.sourceType ?? "");
            if (sourceType === "guichet" && (!sid || sid.trim().length === 0)) {
              if (agencyId) txWithoutSessionByAgency[agencyId] = (txWithoutSessionByAgency[agencyId] ?? 0) + 1;
            }
            if (agencyId && sid) {
              bySession[agencyId] = bySession[agencyId] ?? {};
              bySession[agencyId][sid] = (bySession[agencyId][sid] ?? 0) + amt;
            }
          });
          recomputeValidatedAgencyTotals();
          applyCashPayload(totalPaid, byAgency, bySession, txWithoutSessionByAgency);
        },
        (err) => {
          setError(err?.message ?? "Erreur onSnapshot cashTransactions");
          setLoading(false);
        }
      );
    }

    const unsubValidatedAgency = onSnapshot(
      qShiftReportsValidatedAgency,
      (snap) => {
        let validatedAgency = 0;
        const byAgency: Record<string, number> = {};
        const bySession: Record<string, Record<string, number>> = {};
        snap.docs.forEach((d) => {
          const r = d.data() as any;
          const auditCash = Number(r.validationAudit?.receivedCashAmount ?? 0) || 0;
          const totalCash = Number(r.totalCash ?? r.totalRevenue ?? r.amount ?? 0) || 0;
          const amt = auditCash > 0 ? auditCash : totalCash;
          validatedAgency += amt;
          const agencyId = String(r.agencyId ?? "");
          if (agencyId) byAgency[agencyId] = (byAgency[agencyId] ?? 0) + amt;
          const sid = String(r.shiftId ?? d.id);
          if (agencyId && sid) {
            bySession[agencyId] = bySession[agencyId] ?? {};
            bySession[agencyId][sid] = (bySession[agencyId][sid] ?? 0) + amt;
          }
        });
        validatedAgencyShiftOnlyRef.current = validatedAgency;
        validatedAgencyByAgencyShiftOnlyRef.current = byAgency;
        validatedAgencyBySessionShiftOnlyRef.current = bySession;
        recomputeValidatedAgencyTotals();
        // NB: byAgencyRef + inconsistenciesRef are rebuilt on cash snapshot (which is fine; cash changes more often).
        setLoading(false);
        scheduleCommit();
      },
      (err) => {
        setError(err?.message ?? "Erreur onSnapshot shiftReports(validated_agency)");
        setLoading(false);
      }
    );

    // Temporarily disabled to reduce Firestore listeners - centralised amounts calculated on demand
    // const unsubCentralAccounts = onSnapshot(
    //   qCentralAccounts,
    //   (snap) => {
    //     const ids = snap.docs.map((d) => d.id);
    //     centralAccountIdsRef.current = ids;
    //     attachCentralMovementsListener(ids);
    //     setLoading(false);
    //     scheduleCommit();
    //   },
    //   (err) => {
    //     setError(err?.message ?? "Erreur onSnapshot financialAccounts");
    //     setLoading(false);
    //   }
    // );

    // Lecture payments (valides + ledger poste sur la periode), en parallele des flux operationnels.
    const paymentsRef = collection(db, "companies", companyId, "payments");
    const qPayments = query(
      paymentsRef,
      where("validatedAt", ">=", startTs),
      where("validatedAt", "<=", endTs),
      orderBy("validatedAt", "asc")
    );
    // Temporarily disabled to reduce Firestore listeners - payments can be calculated on demand
    // const unsubPayments = onSnapshot(
    //   qPayments,
    //   (snap) => {
    //     let total = 0;
    //     const byAgency: Record<string, number> = {};
    //     snap.docs.forEach((d) => {
    //       const data = d.data() as {
    //         amount?: number;
    //         agencyId?: string;
    //         status?: string;
    //         ledgerStatus?: string;
    //       };
    //       if (String(data?.status ?? "") !== "validated") return;
    //       if (String(data?.ledgerStatus ?? "pending") !== "posted") return;
    //       const amount = Number(data?.amount ?? 0) || 0;
    //       total += amount;
    //       const aid = String(data?.agencyId ?? "");
    //       if (aid) byAgency[aid] = (byAgency[aid] ?? 0) + amount;
    //     });
    //     paymentsConfirmedRef.current = total;
    //     recomputeValidatedAgencyTotals();
    //     // Migration progressive : fallback sur payments si cashTransactions indisponibles.
    //     if (cashPaidTotalRef.current <= 0 && total > 0) {
    //       cashPaidTotalRef.current = total;
    //       pendingGuichetRef.current = cashPaidTotalRef.current - validatedAgencyRef.current;
    //       const validatedByAgency = validatedAgencyByAgencyRef.current;
    //       const out: MoneyPositionsSnapshot["byAgency"] = {};
    //       Object.keys({ ...byAgency, ...validatedByAgency }).forEach((aid) => {
    //         const cashPaid = byAgency[aid] ?? 0;
    //         const val = validatedByAgency[aid] ?? 0;
    //         const pend = cashPaid - val;
    //         const cent = centralisedByAgencyRef.current[aid] ?? 0;
    //         out[aid] = { cashPaid, validatedAgency: val, pendingGuichet: pend, centralised: cent };
    //       });
    //       byAgencyRef.current = out;
    //     }
    //     setLoading(false);
    //     scheduleCommit();
    //   },
    //   (err) => {
    //     console.warn("[GlobalMoneyPositions] payments snapshot:", err?.message);
    //     setLoading(false);
    //     scheduleCommit();
    //   }
    // );

    return () => {
      unsubCash();
      unsubValidatedAgency();
      // unsubCentralAccounts();
      // unsubPayments();
      if (unsubCentralMovements) unsubCentralMovements();
      if (scheduleRef.current != null) {
        window.clearTimeout(scheduleRef.current);
        scheduleRef.current = null;
      }
    };
  }, [companyId, period.startDate, period.endDate, scheduleCommit]);

  const value = React.useMemo<Ctx>(() => ({ snapshot, loading, error }), [snapshot, loading, error]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useGlobalMoneyPositions(): Ctx {
  const ctx = React.useContext(C);
  if (!ctx) throw new Error("useGlobalMoneyPositions must be used within GlobalMoneyPositionsProvider");
  return ctx;
}
