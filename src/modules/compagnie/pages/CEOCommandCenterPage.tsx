// CEO Cockpit V2 — Executive cockpit only. FROZEN.
// 8 blocks: État global (no chart), Risques, Activité opérationnelle, Flotte, Alertes, Position financière (summary), Performance réseau (top 3), Actions rapides.
// One data load wave, minimal state, no Recharts, no heavy compute. Component < 800 lines, < 15 useMemo.
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  limit,
  doc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { format } from "date-fns";
import { canonicalStatut } from "@/utils/reservationStatusUtils";
import { getDateRangeForPeriod, type PeriodKind } from "@/shared/date/periodUtils";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import { Gauge } from "lucide-react";
import { listClosedCashSessionsWithDiscrepancy } from "@/modules/agence/cashControl/cashSessionService";
import type { CashSessionDocWithId } from "@/modules/agence/cashControl/cashSessionTypes";
import {
  listCourierSessionsWithDiscrepancy,
  type CourierSessionWithId,
} from "@/modules/logistics/services/courierSessionService";
import {
  calculateAgencyProfit,
  getRiskSettings,
  DEFAULT_RISK_SETTINGS,
  type ProfitResult,
  TRIP_COSTS_COLLECTION,
} from "@/core/intelligence";
import { calculateCompanyCashPosition } from "@/core/finance";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { listUnpaidPayables } from "@/modules/compagnie/finance/payablesService";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { OPERATIONAL_STATUS, TECHNICAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import {
  ACCOUNT_CRITICAL_THRESHOLD,
  ACCOUNT_WARNING_THRESHOLD,
  AGENCIES_AT_RISK_CRITICAL_COUNT,
} from "@/modules/compagnie/commandCenter/strategicThresholds";
import { MetricCard } from "@/ui";
import { TrendingUp, Ticket, Building2, Truck, AlertTriangle, Clock } from "lucide-react";
import { computeCeoGlobalStatus } from "@/modules/compagnie/commandCenter/ceoRiskRules";
import { buildCeoDecisions, type DecisionEngineResult } from "@/modules/compagnie/commandCenter/decisionEngine";
import { getDelayedBusesCountToday } from "@/modules/compagnie/tripInstances/tripProgressService";
import { getNetworkStats } from "@/modules/compagnie/networkStats/networkStatsService";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getPreviousPeriod, calculateChange } from "@/shared/date/periodComparisonUtils";
import { getPeriodLabel } from "@/shared/date/periodUtils";
import {
  getUnifiedCompanyFinance,
  type UnifiedAgencyFinance,
} from "@/modules/finance/services/unifiedFinanceService";
const TODAY = format(new Date(), "yyyy-MM-dd");

type DailyStatsDoc = {
  companyId?: string;
  agencyId?: string;
  date?: string;
  ticketRevenue?: number;
  courierRevenue?: number;
  totalRevenue?: number;
  totalPassengers?: number;
  totalSeats?: number;
  validatedSessions?: number;
  activeSessions?: number;
  closedSessions?: number;
  boardingClosedCount?: number;
};

type AgencyLiveStateDoc = {
  companyId?: string;
  agencyId?: string;
  activeSessionsCount?: number;
  closedPendingValidationCount?: number;
  vehiclesInTransitCount?: number;
  boardingOpenCount?: number;
  lastUpdatedAt?: unknown;
};

type FleetOverviewCounts = {
  total: number;
  enService: number;
  enTransit: number;
  maintenance: number;
  accidente: number;
  horsService: number;
  garage: number;
};

type ExpenseRow = {
  companyId?: string;
  agencyId?: string | null;
  amount?: number;
  tripId?: string | null;
  vehicleId?: string | null;
  expenseCategory?: string | null;
  status?: string;
  date?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  performedAt?: unknown;
};
type ShiftReportRow = {
  agencyId?: string;
  startAt?: unknown;
  validationAudit?: { computedDifference?: number; validatedAt?: unknown };
};
type ReservationRow = {
  trajetId?: string;
  montant?: number;
  date?: string;
  statut?: string;
  shiftId?: string;
  createdInSessionId?: string;
  createdAt?: unknown;
};
type TripCostRow = {
  tripId?: string;
  agencyId?: string;
  date?: string;
  fuelCost?: number;
  driverCost?: number;
  assistantCost?: number;
  tollCost?: number;
  maintenanceCost?: number;
  otherOperationalCost?: number;
};
const SHIFT_REPORTS_COLLECTION = "shiftReports";

function tripCostPerDoc(r: TripCostRow): number {
  return (
    (Number(r.fuelCost) || 0) +
    (Number(r.driverCost) || 0) +
    (Number(r.assistantCost) || 0) +
    (Number(r.tollCost) || 0) +
    (Number(r.maintenanceCost) || 0) +
    (Number(r.otherOperationalCost) || 0)
  );
}

function toMillis(value: unknown): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const obj = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof obj.toMillis === "function") {
      try {
        const ms = obj.toMillis();
        return Number.isFinite(ms) ? ms : null;
      } catch {
        return null;
      }
    }
    const maybeToDate = obj.toDate;
    if (typeof maybeToDate === "function") {
      try {
        const d = maybeToDate();
        return d instanceof Date ? d.getTime() : null;
      } catch {
        return null;
      }
    }
    const seconds = obj.seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

export default function CEOCommandCenterPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const navigate = useNavigate();
  const money = useFormatCurrency();

  const [dailyStatsList, setDailyStatsList] = useState<DailyStatsDoc[]>([]);
  const [liveStateList, setLiveStateList] = useState<AgencyLiveStateDoc[]>([]);
  const [fleetOverviewCounts, setFleetOverviewCounts] = useState<FleetOverviewCounts>({
    total: 0,
    enService: 0,
    enTransit: 0,
    maintenance: 0,
    accidente: 0,
    horsService: 0,
    garage: 0,
  });
  const [agencies, setAgencies] = useState<{ id: string; nom: string; nomAgence?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [expensesList, setExpensesList] = useState<ExpenseRow[]>([]);
  const [discrepancyReports, setDiscrepancyReports] = useState<ShiftReportRow[]>([]);
  const [pendingRevenue, setPendingRevenue] = useState(0);
  const [tripCostsList, setTripCostsList] = useState<TripCostRow[]>([]);
  const [riskSettings, setRiskSettings] = useState(DEFAULT_RISK_SETTINGS);
  const [financialAccounts, setFinancialAccounts] = useState<{ id: string; agencyId: string | null; accountType: string; currentBalance: number }[]>([]);
  const [unpaidPayables, setUnpaidPayables] = useState<{ id: string; agencyId: string; remainingAmount: number; status: string }[]>([]);
  // Poste de pilotage simplifié (audit CEO) : uniquement aujourd'hui, pas de sélecteur de période
  const [period, setPeriod] = useState<PeriodKind>("day");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [cashDiscrepancyList, setCashDiscrepancyList] = useState<{ agencyId: string; session: CashSessionDocWithId }[]>([]);
  const [courierDiscrepancyList, setCourierDiscrepancyList] = useState<{ agencyId: string; session: CourierSessionWithId }[]>([]);
  const [delayedBusesCount, setDelayedBusesCount] = useState<number | null>(null);
  const [busesInProgressCount, setBusesInProgressCount] = useState<number | null>(null);
  const [caFromCash, setCaFromCash] = useState<number>(0);
  const [billetsFromCash, setBilletsFromCash] = useState<number>(0);
  const [agencesActivesFromCash, setAgencesActivesFromCash] = useState<number>(0);
  const [cashKpisLoading, setCashKpisLoading] = useState(false);
  /** Stats réseau du jour uniquement pour l'indicateur "État du réseau aujourd'hui" */
  const [networkStatsToday, setNetworkStatsToday] = useState<Awaited<ReturnType<typeof getNetworkStats>> | null>(null);
  /** Période précédente pour comparaison CA / billets / agences */
  const [prevStats, setPrevStats] = useState<{
    totalRevenue: number;
    totalTickets: number;
    activeAgencies: number;
    comparisonLabel: string;
  } | null>(null);
  /** Finance unifiée : live / cash / validated */
  const [unifiedFinance, setUnifiedFinance] = useState<UnifiedAgencyFinance | null>(null);
  const [unifiedFinanceLoading, setUnifiedFinanceLoading] = useState(false);

  const periodRange = React.useMemo(() => {
    if (period === "day") {
      const todayBamako = getTodayBamako();
      return { startStr: todayBamako, endStr: todayBamako };
    }
    const range = getDateRangeForPeriod(period, new Date(), customStart || undefined, customEnd || undefined);
    return {
      startStr: format(range.start, "yyyy-MM-dd"),
      endStr: format(range.end, "yyyy-MM-dd"),
    };
  }, [period, customStart, customEnd]);

  const loadRunIdRef = useRef(0);

  // PendingRevenue: aligner le calcul sur la periode selectionnee.
  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;
    const { startStr, endStr } = periodRange;
    const startMs = new Date(`${startStr}T00:00:00.000`).getTime();
    const endMs = new Date(`${endStr}T23:59:59.999`).getTime();

    const load = async () => {
      const agencesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
      if (cancelled) return;

      const ags = agencesSnap.docs.map((d) => ({
        id: d.id,
        nom: (d.data() as { nom?: string }).nom ?? d.id,
      }));

      const shiftsSnaps = await Promise.all(
        ags.map((a) =>
          getDocs(query(collection(db, "companies", companyId, "agences", a.id, "shifts"), where("status", "!=", "validated"), limit(500)))
        )
      );
      const reservationsSnaps = await Promise.all(
        ags.map((a) => getDocs(query(collection(db, "companies", companyId, "agences", a.id, "reservations"), limit(2000))))
      );

      if (cancelled) return;

      const nonValidatedShiftIds = new Set<string>();
      shiftsSnaps.forEach((snap) => snap.docs.forEach((d) => nonValidatedShiftIds.add(d.id)));

      let total = 0;
      reservationsSnaps.forEach((snap) => {
        snap.docs.forEach((d) => {
          const r = d.data() as ReservationRow;
          const shiftId = r.shiftId ?? r.createdInSessionId;
          if (!(canonicalStatut(r.statut) === "paye" && shiftId && nonValidatedShiftIds.has(shiftId))) return;
          const inPeriodByDateKey = typeof r.date === "string" && r.date >= startStr && r.date <= endStr;
          const createdAtMs = toMillis(r.createdAt);
          const inPeriodByCreatedAt =
            createdAtMs != null ? createdAtMs >= startMs && createdAtMs <= endMs : false;
          if (!inPeriodByDateKey && !inPeriodByCreatedAt) return;
          total += Number(r.montant) || 0;
        });
      });

      if (!cancelled) setPendingRevenue(total);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, periodRange.startStr, periodRange.endStr]);

  // Indicateurs réseau : source unique networkStatsService (CA, billets, agences, bus en circulation)
  useEffect(() => {
    if (!companyId) return;
    const { startStr, endStr } = periodRange;
    setCashKpisLoading(true);
    getNetworkStats(companyId, startStr, endStr)
      .then((stats) => {
        setCaFromCash(stats.totalRevenue);
        setBilletsFromCash(stats.totalTickets);
        setAgencesActivesFromCash(stats.activeAgencies);
        setBusesInProgressCount(stats.busesInTransit);
      })
      .catch(() => {
        setCaFromCash(0);
        setBilletsFromCash(0);
        setAgencesActivesFromCash(0);
        setBusesInProgressCount(null);
      })
      .finally(() => setCashKpisLoading(false));
  }, [companyId, periodRange.startStr, periodRange.endStr]);

  // Finance unifiée : 3 niveaux (live, cash, validated)
  useEffect(() => {
    if (!companyId) return;
    const { startStr, endStr } = periodRange;
    setUnifiedFinanceLoading(true);
    getUnifiedCompanyFinance(companyId, startStr, endStr)
      .then(setUnifiedFinance)
      .catch(() => setUnifiedFinance(null))
      .finally(() => setUnifiedFinanceLoading(false));
  }, [companyId, periodRange.startStr, periodRange.endStr]);

  // Bus en retard (aujourd'hui)
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    getDelayedBusesCountToday(companyId)
      .then((delayed) => {
        if (!cancelled) setDelayedBusesCount(delayed);
      })
      .catch(() => {
        if (!cancelled) setDelayedBusesCount(null);
      });
    return () => { cancelled = true; };
  }, [companyId]);

  // Stats réseau du jour pour l'indicateur "État du réseau aujourd'hui"
  useEffect(() => {
    if (!companyId) return;
    const today = getTodayBamako();
    getNetworkStats(companyId, today, today)
      .then(setNetworkStatsToday)
      .catch(() => setNetworkStatsToday(null));
  }, [companyId]);

  // Période précédente : charger stats pour comparaison
  useEffect(() => {
    if (!companyId) return;
    const startDate = new Date(periodRange.startStr + "T00:00:00");
    const endDate = new Date(periodRange.endStr + "T23:59:59");
    const { previousStart, previousEnd, comparisonLabel } = getPreviousPeriod(startDate, endDate, period);
    getNetworkStats(companyId, previousStart, previousEnd)
      .then((stats) => {
        setPrevStats({
          totalRevenue: stats.totalRevenue,
          totalTickets: stats.totalTickets,
          activeAgencies: stats.activeAgencies,
          comparisonLabel,
        });
      })
      .catch(() => setPrevStats(null));
  }, [companyId, periodRange.startStr, periodRange.endStr, period]);

  // Load dailyStats, agencyLiveState, expenses, discrepancies, trip revenues; agencies loaded here too
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const runId = ++loadRunIdRef.current;
    const { startStr, endStr } = periodRange;
    const startMs = new Date(`${startStr}T00:00:00.000`).getTime();
    const endMs = new Date(`${endStr}T23:59:59.999`).getTime();

    const load = async () => {
      setLoading(true);

      const agencesRef = collection(db, "companies", companyId, "agences");
      const qDaily = query(
        collectionGroup(db, "dailyStats"),
        where("companyId", "==", companyId),
        where("date", ">=", startStr),
        where("date", "<=", endStr),
        limit(2000)
      );
      const qLive = query(
        collectionGroup(db, "agencyLiveState"),
        where("companyId", "==", companyId),
        limit(200)
      );
      const qExp = query(
        collectionGroup(db, "expenses"),
        where("companyId", "==", companyId),
        limit(500)
      );
      const tcRef = collection(db, "companies", companyId, TRIP_COSTS_COLLECTION);
      const qTc = query(tcRef, where("date", ">=", startStr), where("date", "<=", endStr), limit(1000));
      const qShiftReports = query(
        collectionGroup(db, SHIFT_REPORTS_COLLECTION),
        where("companyId", "==", companyId),
        where("status", "==", "validated"),
        limit(500)
      );

      let ags: { id: string; nom: string; nomAgence?: string }[] = [];
      let dailyList: DailyStatsDoc[] = [];
      let liveList: AgencyLiveStateDoc[] = [];
      let expensesListResult: ExpenseRow[] = [];
      let tripCostsListResult: TripCostRow[] = [];
      let riskSettingsResult = DEFAULT_RISK_SETTINGS;
      const discList: ShiftReportRow[] = [];
      const tripRevMap = new Map<string, number>();

      try {
        const [agencesSnap, dailySnap, liveSnap, expSnap, tcSnap, settingsSnap, shiftReportsSnap] = await Promise.all([
          getDocs(agencesRef),
          getDocs(qDaily),
          getDocs(qLive),
          getDocs(qExp),
          getDocs(qTc),
          getRiskSettings(companyId),
          getDocs(qShiftReports),
        ]);
        if (loadRunIdRef.current !== runId) return;
        ags = agencesSnap.docs.map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string };
          return { id: d.id, nom: data.nom ?? d.id, nomAgence: data.nomAgence };
        });
        dailyList = dailySnap.docs.map((d) => ({ ...d.data(), agencyId: d.data().agencyId } as DailyStatsDoc));
        liveList = liveSnap.docs.map((d) => d.data() as AgencyLiveStateDoc);
        expensesListResult = expSnap.docs.map((d) => d.data() as ExpenseRow);
        expensesListResult = expensesListResult.filter((e) => {
          if (typeof e.date === "string" && e.date >= startStr && e.date <= endStr) return true;
          const bestEffortMs =
            toMillis(e.performedAt) ??
            toMillis(e.updatedAt) ??
            toMillis(e.createdAt);
          if (bestEffortMs == null) return false;
          return bestEffortMs >= startMs && bestEffortMs <= endMs;
        });
        tripCostsListResult = tcSnap.docs.map((d) => d.data() as TripCostRow);
        riskSettingsResult = settingsSnap;
        shiftReportsSnap.docs.forEach((d) => {
          const data = d.data() as ShiftReportRow & { agencyId?: string };
          const reportMs = toMillis(data.validationAudit?.validatedAt) ?? toMillis(data.startAt);
          if (reportMs == null || reportMs < startMs || reportMs > endMs) return;
          discList.push({ ...data, agencyId: data.agencyId ?? "" });
        });
        // Shifts et réservations par agence (sans collectionGroup)
        const shiftsSnaps = await Promise.all(
          ags.map((a) =>
            getDocs(query(collection(db, "companies", companyId, "agences", a.id, "shifts"), where("status", "!=", "validated"), limit(500)))
          )
        );
        const reservationsSnaps = await Promise.all(
          ags.map((a) => getDocs(query(collection(db, "companies", companyId, "agences", a.id, "reservations"), limit(2000))))
        );
        if (loadRunIdRef.current !== runId) return;
        const nonValidatedShiftIds = new Set<string>();
        shiftsSnaps.forEach((snap) => snap.docs.forEach((d) => nonValidatedShiftIds.add(d.id)));
        const resByIdForPending = new Map<string, ReservationRow>();
        reservationsSnaps.forEach((snap, i) => {
          const agencyId = ags[i].id;
          snap.docs.forEach((d) => resByIdForPending.set(`${agencyId}/${d.id}`, d.data() as ReservationRow));
        });
        // tripRevMap : filtrer par date en mémoire
        resByIdForPending.forEach((r) => {
          const tid = r.trajetId ?? "_unknown";
          const amt = Number(r.montant) || 0;
          const d = r.date ?? "";
          if (d >= startStr && d <= endStr) tripRevMap.set(tid, (tripRevMap.get(tid) ?? 0) + amt);
        });
      } catch {
        const agencesSnap = await getDocs(agencesRef);
        ags = agencesSnap.docs.slice(0, 50).map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string };
          return { id: d.id, nom: data.nom ?? d.id, nomAgence: data.nomAgence };
        });
        const [dailyResults, liveResults] = await Promise.all([
          Promise.all(
            ags.map(async (a) => {
              const ds = await getDoc(doc(db, `companies/${companyId}/agences/${a.id}/dailyStats/${TODAY}`));
              return ds.exists() ? ({ ...ds.data(), agencyId: a.id } as DailyStatsDoc) : null;
            })
          ),
          Promise.all(
            ags.map(async (a) => {
              const ls = await getDoc(doc(db, `companies/${companyId}/agences/${a.id}/agencyLiveState/current`));
              return ls.exists() ? ({ ...ls.data(), agencyId: a.id } as AgencyLiveStateDoc) : null;
            })
          ),
        ]);
        dailyList = dailyResults.filter((d): d is DailyStatsDoc => d != null);
        liveList = liveResults.filter((d): d is AgencyLiveStateDoc => d != null);
        try {
          riskSettingsResult = await getRiskSettings(companyId);
        } catch {
          /* keep default */
        }
        try {
          const tcSnap = await getDocs(qTc);
          tripCostsListResult = tcSnap.docs.map((d) => d.data() as TripCostRow);
        } catch {
          tripCostsListResult = [];
        }
        try {
          const expSnap = await getDocs(qExp);
          expensesListResult = expSnap.docs.map((d) => d.data() as ExpenseRow);
          expensesListResult = expensesListResult.filter((e) => {
            if (typeof e.date === "string" && e.date >= startStr && e.date <= endStr) return true;
            const bestEffortMs =
              toMillis(e.performedAt) ??
              toMillis(e.updatedAt) ??
              toMillis(e.createdAt);
            if (bestEffortMs == null) return false;
            return bestEffortMs >= startMs && bestEffortMs <= endMs;
          });
        } catch {
          expensesListResult = [];
        }
      }

      let financialAccountsResult: { id: string; agencyId: string | null; accountType: string; currentBalance: number }[] = [];
      let unpaidPayablesResult: { id: string; agencyId: string; remainingAmount: number; status: string }[] = [];
      try {
        const [accts, payables] = await Promise.all([
          listAccounts(companyId),
          listUnpaidPayables(companyId, { limitCount: 300 }),
        ]);
        if (loadRunIdRef.current !== runId) return;
        financialAccountsResult = accts.map((a) => ({ id: a.id, agencyId: a.agencyId, accountType: a.accountType, currentBalance: a.currentBalance }));
        unpaidPayablesResult = payables.map((p) => ({ id: p.id, agencyId: p.agencyId, remainingAmount: p.remainingAmount, status: p.status }));
      } catch {
        /* keep empty */
      }

      if (loadRunIdRef.current !== runId) return;
      setAgencies(ags);
      setDailyStatsList(dailyList);
      try {
        const cashList = await listClosedCashSessionsWithDiscrepancy(
          companyId,
          ags.map((a) => a.id)
        );
        if (loadRunIdRef.current === runId) setCashDiscrepancyList(cashList);
      } catch {
        if (loadRunIdRef.current === runId) setCashDiscrepancyList([]);
      }
      try {
        const courierList = await listCourierSessionsWithDiscrepancy(
          companyId,
          ags.map((a) => a.id)
        );
        if (loadRunIdRef.current === runId) setCourierDiscrepancyList(courierList);
      } catch {
        if (loadRunIdRef.current === runId) setCourierDiscrepancyList([]);
      }
      setLiveStateList(liveList);
      setExpensesList(expensesListResult);
      setDiscrepancyReports(discList);
      setTripCostsList(tripCostsListResult);
      setRiskSettings(riskSettingsResult);
      setFinancialAccounts(financialAccountsResult);
      setUnpaidPayables(unpaidPayablesResult);

      try {
        const vehicles = await listVehicles(companyId);
        if (loadRunIdRef.current !== runId) return;
        const total = vehicles.length;
        const available = vehicles.filter(
          (v: any) =>
            (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.GARAGE &&
            (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) === TECHNICAL_STATUS.NORMAL
        ).length;
        const enTransit = vehicles.filter((v: any) => (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.EN_TRANSIT).length;
        const maintenance = vehicles.filter((v: any) => (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) === TECHNICAL_STATUS.MAINTENANCE).length;
        const accidente = vehicles.filter((v: any) => (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) === TECHNICAL_STATUS.ACCIDENTE).length;
        const horsService = vehicles.filter((v: any) => (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) === TECHNICAL_STATUS.HORS_SERVICE).length;
        const garage = vehicles.filter((v: any) => (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.GARAGE).length;
        setFleetOverviewCounts({
          total,
          garage,
          enService: available,
          enTransit,
          maintenance,
          accidente,
          horsService,
        });
      } catch {
        setFleetOverviewCounts((prev) => prev);
      }
      setLoading(false);
    };

    load();
  }, [companyId, periodRange.startStr, periodRange.endStr]);

  const agencyNames = useMemo(() => {
    const m = new Map(agencies.map((a) => [a.id, a.nomAgence ?? a.nom]));
    return (id: string) => m.get(id) ?? id;
  }, [agencies]);

  const { globalTicketRevenue, globalCourierRevenue, globalTotalRevenue } = useMemo(() => {
    let ticket = 0;
    let courier = 0;
    let total = 0;
    dailyStatsList.forEach((d) => {
      const tr = Number(d.ticketRevenue ?? d.totalRevenue ?? 0);
      const cr = Number(d.courierRevenue ?? 0);
      const tot = Number(d.totalRevenue ?? 0) || tr + cr;
      ticket += tr;
      courier += cr;
      total += tot;
    });
    return {
      globalTicketRevenue: ticket,
      globalCourierRevenue: courier,
      globalTotalRevenue: total > 0 ? total : ticket + courier,
    };
  }, [dailyStatsList]);

  const alerts = useMemo(() => {
    const list: { type: string; message: string; level: "error" | "warning" | "info" }[] = [];
    const agenciesWithData = new Set(dailyStatsList.map((d) => d.agencyId).filter(Boolean));
    const zeroActivity = agencies.filter((a) => !agenciesWithData.has(a.id));
    if (agencies.length > 0 && zeroActivity.length === agencies.length) {
      list.push({ type: "activity", message: "Aucune activité enregistrée aujourd'hui", level: "info" });
    } else if (zeroActivity.length > 0 && zeroActivity.length <= 5) {
      list.push({
        type: "activity",
        message: `Agences sans activité aujourd'hui : ${zeroActivity.map((a) => a.nomAgence ?? a.nom).join(", ")}`,
        level: "info",
      });
    }
    return list;
  }, [dailyStatsList, agencies]);

  const topAgenciesByRevenue = useMemo(() => {
    return [...dailyStatsList]
      .map((d) => {
        const ticket = Number(d.ticketRevenue ?? d.totalRevenue ?? 0);
        const courier = Number(d.courierRevenue ?? 0);
        const revenue = Number(d.totalRevenue ?? 0) || ticket + courier;
        return {
          agencyId: d.agencyId ?? "",
          nom: agencyNames(d.agencyId ?? ""),
          revenue,
        };
      })
      .filter((a) => a.revenue > 0)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [dailyStatsList, agencyNames]);
  const agencyMaps = useMemo(() => {
    const expensesByAgency = new Map<string, number>();
    expensesList.forEach((e) => {
      const aid = e.agencyId ?? "_company";
      expensesByAgency.set(aid, (expensesByAgency.get(aid) ?? 0) + (Number(e.amount) || 0));
    });
    const discrepancyDeductionByAgency = new Map<string, number>();
    discrepancyReports.forEach((r) => {
      const aid = r.agencyId ?? "";
      const diff = Number(r.validationAudit?.computedDifference) ?? 0;
      if (diff < 0) discrepancyDeductionByAgency.set(aid, (discrepancyDeductionByAgency.get(aid) ?? 0) + Math.abs(diff));
    });
    courierDiscrepancyList.forEach(({ agencyId, session }) => {
      const diff = Number(session.difference ?? 0);
      if (diff < 0) {
        discrepancyDeductionByAgency.set(agencyId, (discrepancyDeductionByAgency.get(agencyId) ?? 0) + Math.abs(diff));
      }
    });
    const tripCostsByAgency = new Map<string, number>();
    tripCostsList.forEach((r) => {
      const aid = r.agencyId ?? "";
      tripCostsByAgency.set(aid, (tripCostsByAgency.get(aid) ?? 0) + tripCostPerDoc(r));
    });
    return { expensesByAgency, discrepancyDeductionByAgency, tripCostsByAgency };
  }, [expensesList, discrepancyReports, courierDiscrepancyList, tripCostsList]);

  const agencyProfits = useMemo((): (ProfitResult & { agencyId: string; nom: string })[] => {
    const { expensesByAgency, discrepancyDeductionByAgency, tripCostsByAgency } = agencyMaps;
    const agencyIds = new Set<string>([
      ...(dailyStatsList.map((d) => d.agencyId).filter(Boolean) as string[]),
      ...expensesByAgency.keys(),
      ...discrepancyDeductionByAgency.keys(),
      ...tripCostsByAgency.keys(),
    ]);
    return Array.from(agencyIds).map((agencyId) => {
      const ds = dailyStatsList.find((d) => d.agencyId === agencyId);
      const revenueFromDailyStats =
        Number(ds?.totalRevenue ?? 0) ||
        (Number(ds?.ticketRevenue ?? 0) + Number(ds?.courierRevenue ?? 0));
      const expensesTotal = expensesByAgency.get(agencyId) ?? 0;
      const tripCostsTotal = tripCostsByAgency.get(agencyId) ?? 0;
      const discrepancyDeduction = discrepancyDeductionByAgency.get(agencyId) ?? 0;
      const result = calculateAgencyProfit({
        agencyId,
        revenueFromDailyStats: Number(revenueFromDailyStats) || 0,
        expensesTotal,
        tripCostsTotal,
        discrepancyDeduction,
      });
      return { ...result, agencyId, nom: agencyNames(agencyId) };
    });
  }, [dailyStatsList, agencyMaps, agencyNames]);

  const financialPosition = useMemo(
    () =>
      calculateCompanyCashPosition(
        financialAccounts.map((a) => ({
          id: a.id,
          agencyId: a.agencyId,
          accountType: a.accountType,
          currentBalance: a.currentBalance,
        })),
        unpaidPayables.map((p) => ({
          id: p.id,
          agencyId: p.agencyId,
          remainingAmount: p.remainingAmount,
          status: p.status,
        }))
      ),
    [financialAccounts, unpaidPayables]
  );
  const pendingPayablesAmount = useMemo(
    () => unpaidPayables.reduce((sum, p) => sum + (Number(p.remainingAmount) || 0), 0),
    [unpaidPayables]
  );
  const pendingPayablesCount = unpaidPayables.length;
  const periodDays = useMemo(() => {
    const start = new Date(periodRange.startStr);
    const end = new Date(periodRange.endStr);
    const diffMs = Math.max(0, end.getTime() - start.getTime());
    return Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
  }, [periodRange.startStr, periodRange.endStr]);
  const estimatedMonthlyBurn = useMemo(() => {
    const periodExpenses = expensesList.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    return periodDays > 0 ? (periodExpenses / periodDays) * 30 : 0;
  }, [expensesList, periodDays]);
  const estimatedRunwayMonths = useMemo(() => {
    if (estimatedMonthlyBurn <= 0) return null;
    const availableCash = Number(financialPosition.netPosition) || 0;
    if (availableCash <= 0) return 0;
    return availableCash / estimatedMonthlyBurn;
  }, [estimatedMonthlyBurn, financialPosition.netPosition]);
  const realizedRevenue = useMemo(
    () => agencyProfits.reduce((sum, p) => sum + (Number(p.revenue) || 0), 0),
    [agencyProfits]
  );
  const realizedCosts = useMemo(
    () => agencyProfits.reduce((sum, p) => sum + (Number(p.cost) || 0), 0),
    [agencyProfits]
  );
  const realizedProfit = useMemo(() => realizedRevenue - realizedCosts, [realizedRevenue, realizedCosts]);
  const targetMarginPercent = Number(riskSettings.minimumMarginPercent) || 0;
  const budgetGapTop3 = useMemo(() => {
    return [...agencyProfits]
      .map((p) => {
        const targetProfit = (Number(p.revenue) || 0) * (targetMarginPercent / 100);
        const gap = (Number(p.profit) || 0) - targetProfit;
        return { agencyId: p.agencyId, nom: p.nom, gap };
      })
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 3);
  }, [agencyProfits, targetMarginPercent]);
  const liveOperationsMetrics = useMemo(() => {
    const activeSessionsCount = liveStateList.reduce((sum, s) => sum + (Number(s.activeSessionsCount) || 0), 0);
    const pendingValidationSessionsCount = liveStateList.reduce(
      (sum, s) => sum + (Number(s.closedPendingValidationCount) || 0),
      0
    );
    const activeCourierSessionsCount = liveStateList.reduce(
      (sum, s) => sum + (Number((s as { activeCourierSessionsCount?: number }).activeCourierSessionsCount) || 0),
      0
    );
    const pendingCourierValidationCount = liveStateList.reduce(
      (sum, s) => sum + (Number((s as { closedCourierPendingValidationCount?: number }).closedCourierPendingValidationCount) || 0),
      0
    );
    const vehiclesInTransitCount = liveStateList.reduce((sum, s) => sum + (Number(s.vehiclesInTransitCount) || 0), 0);
    const boardingOpenCount = liveStateList.reduce((sum, s) => sum + (Number(s.boardingOpenCount) || 0), 0);
    const threshold = Number(riskSettings.maxCashDiscrepancy || 0);
    const criticalCashCount = cashDiscrepancyList.filter(
      (x) => Math.abs(Number(x.session.discrepancy ?? 0)) >= threshold
    ).length;
    const criticalCourierCount = courierDiscrepancyList.filter(
      (x) => Math.abs(Number(x.session.difference ?? 0)) >= threshold
    ).length;
    const criticalCashDiscrepanciesCount = criticalCashCount + criticalCourierCount;
    const fleetUnavailableCount =
      Number(fleetOverviewCounts.maintenance || 0) +
      Number(fleetOverviewCounts.accidente || 0) +
      Number(fleetOverviewCounts.horsService || 0);
    return {
      activeSessionsCount,
      pendingValidationSessionsCount,
      activeCourierSessionsCount,
      pendingCourierValidationCount,
      vehiclesInTransitCount,
      boardingOpenCount,
      criticalCashDiscrepanciesCount,
      fleetUnavailableCount,
    };
  }, [liveStateList, cashDiscrepancyList, courierDiscrepancyList, riskSettings.maxCashDiscrepancy, fleetOverviewCounts]);

  const revenueVariationPercent = 0; // V2: no trend engine
  const revenueDropPercent = 0;

  const accountAndAgencyRisks = useMemo(
    () => ({
      accountsBelowCritical: financialAccounts.filter((a) => a.currentBalance < ACCOUNT_CRITICAL_THRESHOLD && a.currentBalance >= 0).length,
      accountsBelowWarning: financialAccounts.filter((a) => a.currentBalance < ACCOUNT_WARNING_THRESHOLD && a.currentBalance >= 0).length,
      agenciesAtRiskCount: agencyProfits.filter((p) => p.revenue === 0).length,
    }),
    [financialAccounts, agencyProfits]
  );
  const { accountsBelowCritical, accountsBelowWarning, agenciesAtRiskCount } = accountAndAgencyRisks;

  type RiskCategory = "financial" | "network" | "fleet";
  const healthAndRisks = useMemo(() => {
    const healthStatus = computeCeoGlobalStatus({
      revenueDropPercent,
      accountsBelowCritical,
      accountsBelowWarning,
      agenciesAtRiskCount,
    });
    const prioritizedRisks: {
      id: string;
      label: string;
      level: "danger" | "warning";
      actionRoute: string;
      category: RiskCategory;
      impactText?: string;
      actionText?: string;
    }[] = [];
    const zeroRev = agencyProfits.filter((p) => p.revenue === 0);
    if (zeroRev.length > 0) {
      prioritizedRisks.push({
        id: "agencies-drop",
        label: `Agences en baisse / sans revenu (${zeroRev.length})`,
        level: zeroRev.length >= AGENCIES_AT_RISK_CRITICAL_COUNT ? "danger" : "warning",
        actionRoute: "reservations-reseau",
        category: "network",
        impactText: `${zeroRev.length} agence(s) impactée(s)`,
        actionText: "Analyser",
      });
    }
    if (accountsBelowCritical > 0) {
      prioritizedRisks.push({
        id: "accounts-critical",
        label: `Comptes sous seuil danger (${accountsBelowCritical})`,
        level: "danger",
        actionRoute: "finances?tab=liquidites",
        category: "financial",
        impactText: `${accountsBelowCritical} compte(s) sous seuil`,
        actionText: "Voir trésorerie",
      });
    }
    return { healthStatus, prioritizedRisks };
  }, [
    revenueDropPercent,
    accountsBelowCritical,
    accountsBelowWarning,
    agenciesAtRiskCount,
    agencyProfits,
  ]);
  const { healthStatus, prioritizedRisks } = healthAndRisks;

  /** État du réseau aujourd'hui : Bon / Moyen / Critique (taux remplissage + agences actives + retards bus) */
  const networkStatusToday = useMemo<"bon" | "moyen" | "critique" | null>(() => {
    if (!networkStatsToday) return null;
    const totalAgencies = agencies.length || 1;
    const activeAgencies = networkStatsToday.activeAgencies;
    const capacity = networkStatsToday.networkCapacity || 0;
    const tickets = networkStatsToday.totalTickets || 0;
    const fillRatePct = capacity > 0 ? Math.round((tickets / capacity) * 100) : 0;
    const delayed = delayedBusesCount ?? 0;

    const fillCritical = fillRatePct < 20;
    const fillMedium = fillRatePct >= 20 && fillRatePct < 40;
    const agenciesCritical = totalAgencies > 0 && activeAgencies === 0;
    const agenciesMedium = totalAgencies > 0 && activeAgencies > 0 && activeAgencies < totalAgencies / 2;
    const delaysCritical = delayed >= 3;
    const delaysMedium = delayed >= 1 && delayed < 3;

    if (fillCritical || agenciesCritical || delaysCritical) return "critique";
    if (fillMedium || agenciesMedium || delaysMedium) return "moyen";
    return "bon";
  }, [networkStatsToday, agencies.length, delayedBusesCount]);

  /** Taux de remplissage réseau (0–100) pour le decision engine */
  const fillRatePct = useMemo(() => {
    if (!networkStatsToday?.networkCapacity || networkStatsToday.networkCapacity <= 0) return 0;
    return Math.round(((networkStatsToday.totalTickets ?? 0) / networkStatsToday.networkCapacity) * 100);
  }, [networkStatsToday]);

  /** Decision Engine : situation, problèmes (cause + impact + action), opportunités, actions */
  const ceoDecisions = useMemo((): DecisionEngineResult => {
    return buildCeoDecisions({
      healthStatus,
      networkStatusToday,
      agencyProfits: agencyProfits.map((p) => ({ agencyId: p.agencyId, nom: p.nom, revenue: Number(p.revenue) || 0 })),
      financialAccounts,
      cashDiscrepancyList: cashDiscrepancyList.map(({ agencyId, session }) => ({
        agencyId,
        session: { discrepancy: session.discrepancy ?? undefined },
      })),
      courierDiscrepancyList: courierDiscrepancyList.map(({ agencyId, session }) => ({
        agencyId,
        session: { difference: session.difference ?? undefined },
      })),
      topAgenciesByRevenue,
      prevStats,
      currentRevenue: caFromCash,
      delayedBusesCount,
      fillRatePct,
      totalAgencies: agencies.length,
      activeAgenciesCount: agencesActivesFromCash,
      maxCashDiscrepancyThreshold: Number(riskSettings.maxCashDiscrepancy) || 0,
      getAgencyName: agencyNames,
      financialGap:
        unifiedFinance != null
          ? {
              salesTotal: unifiedFinance.live.totalRevenue,
              cashTotal: unifiedFinance.cash.total,
              orphanAmount: unifiedFinance.cash.orphanAmount ?? 0,
            }
          : undefined,
    });
  }, [
    healthStatus,
    networkStatusToday,
    agencyProfits,
    financialAccounts,
    cashDiscrepancyList,
    courierDiscrepancyList,
    topAgenciesByRevenue,
    prevStats,
    caFromCash,
    delayedBusesCount,
    fillRatePct,
    agencies.length,
    agencesActivesFromCash,
    riskSettings.maxCashDiscrepancy,
    agencyNames,
    unifiedFinance,
  ]);

  const periodLabelShort =
    period === "day"
      ? "Aujourd'hui"
      : period === "week"
        ? "Cette semaine"
        : period === "month"
          ? "Ce mois"
          : "Personnalisé";

  if (!companyId) {
    return (
      <StandardLayoutWrapper noVerticalPadding className="px-4 md:px-6 pt-2 md:pt-3 pb-4 md:pb-5 space-y-4">
        <PageHeader title="Poste de pilotage" className="mb-2" />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  if (loading) {
    return (
      <StandardLayoutWrapper noVerticalPadding className="px-4 md:px-6 pt-2 md:pt-3 pb-4 md:pb-5 space-y-4">
        <PageHeader title="Poste de pilotage" className="mb-2" />
        <div className="flex items-center justify-center min-h-[200px] text-gray-500">Chargement du poste de pilotage…</div>
      </StandardLayoutWrapper>
    );
  }

  const base = `/compagnie/${companyId}`;
  const periodParam = period === "day" ? "today" : period === "week" ? "week" : period === "month" ? "month" : "custom";

  return (
    <StandardLayoutWrapper noVerticalPadding className="px-4 md:px-6 pt-2 md:pt-3 pb-4 md:pb-5 space-y-4">
      <PageHeader
        title="Poste de pilotage"
        subtitle={`${periodLabelShort} — ${getPeriodLabel(period, { start: new Date(periodRange.startStr), end: new Date(periodRange.endStr) }, customStart || undefined, customEnd || undefined)}`}
        icon={Gauge}
        className="mb-2"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKind)}
              className="border border-gray-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
            >
              <option value="day">Aujourd&apos;hui</option>
              <option value="week">Cette semaine</option>
              <option value="month">Ce mois</option>
              <option value="custom">Personnalisé</option>
            </select>
            {period === "custom" && (
              <>
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
                />
                <span className="text-gray-500">→</span>
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="border border-gray-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-sm bg-white dark:bg-slate-800"
                />
              </>
            )}
          </div>
        }
      />

      {/* 1. BLOC SITUATION ACTUELLE — Comprendre en 5 secondes */}
      <div
        className={[
          "rounded-xl border-2 p-4 flex flex-wrap items-center justify-between gap-4",
          ceoDecisions.status === "CRITIQUE" && "border-red-600 bg-red-50 dark:bg-red-950/30 dark:border-red-500",
          ceoDecisions.status === "SURVEILLANCE" && "border-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500",
          ceoDecisions.status === "BON" && "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-500",
        ].filter(Boolean).join(" ")}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden>
            {ceoDecisions.status === "CRITIQUE" ? "🔴" : ceoDecisions.status === "SURVEILLANCE" ? "🟠" : "🟢"}
          </span>
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Situation actuelle</h2>
            <ul className="text-sm text-gray-600 dark:text-slate-400 mt-1 list-disc list-inside space-y-0.5">
              {ceoDecisions.summary.slice(0, 3).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="text-lg font-bold text-gray-900 dark:text-white">
          {ceoDecisions.status === "CRITIQUE" ? "CRITIQUE" : ceoDecisions.status === "SURVEILLANCE" ? "SURVEILLANCE" : "BON"}
        </div>
      </div>

      {/* 2. BLOC PROBLÈMES PRIORITAIRES — Score, conséquences, options */}
      {ceoDecisions.problems.length > 0 && (
        <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">Problèmes prioritaires (triés par score de décision)</h3>
          <ul className="space-y-3">
            {ceoDecisions.problems.map((p) => (
              <li key={p.id} className="rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <span className="inline-flex items-center rounded-md bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                    Score {p.score.toLocaleString("fr-FR")}
                  </span>
                  <span className={`text-xs font-medium ${p.level === "danger" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {p.level === "danger" ? "Danger" : "Attention"}
                  </span>
                </div>
                <h4 className="font-semibold text-gray-900 dark:text-white mt-1">{p.title}</h4>
                <p className="text-sm text-gray-600 dark:text-slate-400 mt-1"><strong>Cause :</strong> {p.cause}</p>
                <p className="text-sm text-gray-700 dark:text-slate-300 mt-0.5"><strong>Impact :</strong> {p.impact}</p>
                <div className="mt-2 rounded bg-slate-50 dark:bg-slate-800/50 p-2 text-xs">
                  <p className="text-emerald-700 dark:text-emerald-400"><strong>Si vous agissez :</strong> {p.consequences.ifAction}</p>
                  <p className="text-red-700 dark:text-red-400 mt-1"><strong>Si vous ne faites rien :</strong> {p.consequences.ifNoAction}</p>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-600 dark:text-slate-400">
                  <span><strong>Demain :</strong> {p.projection.nextDay.toLocaleString("fr-FR")} FCFA</span>
                  <span><strong>7 jours :</strong> {p.projection.nextWeek.toLocaleString("fr-FR")} FCFA</span>
                </div>
                <p className="text-xs font-medium text-gray-600 dark:text-slate-400 mt-2 mb-1">Options :</p>
                <ul className="space-y-1">
                  {p.options.map((opt, idx) => (
                    <li key={idx} className={`flex flex-wrap items-center gap-2 text-sm ${idx === p.recommendedOptionIndex ? "rounded-md bg-blue-50 dark:bg-blue-900/30 p-2 border border-blue-200 dark:border-blue-700" : ""}`}>
                      {idx === p.recommendedOptionIndex && (
                        <span className="inline-flex items-center rounded bg-blue-600 px-1.5 py-0.5 text-xs font-medium text-white">Recommandé</span>
                      )}
                      <button
                        type="button"
                        onClick={() => navigate(`${base}/${p.actionRoute}`)}
                        className="text-left text-blue-600 dark:text-blue-400 hover:underline font-medium"
                      >
                        {opt.label}
                      </button>
                      <span className="text-gray-500 dark:text-slate-500">
                        {opt.estimatedImpact >= 0 ? "+" : ""}{opt.estimatedImpact.toLocaleString("fr-FR")} FCFA
                      </span>
                      <span className={`text-xs ${opt.risk === "low" ? "text-emerald-600" : opt.risk === "medium" ? "text-amber-600" : "text-red-600"}`}>
                        risque {opt.risk === "low" ? "faible" : opt.risk === "medium" ? "moyen" : "élevé"}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-500">
                        · effort {opt.effort === "low" ? "rapide" : opt.effort === "medium" ? "coordination" : "structurel"}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-slate-500">
                        · effet {opt.timeToImpact === "immediate" ? "aujourd'hui" : opt.timeToImpact === "short" ? "1–3 j" : "semaine"}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 3. BLOC OPPORTUNITÉS */}
      {ceoDecisions.opportunities.length > 0 && (
        <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/20 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Opportunités</h3>
          <ul className="space-y-2">
            {ceoDecisions.opportunities.map((o) => (
              <li key={o.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                <span className="font-medium text-gray-900 dark:text-white">{o.titre}</span>
                <span className="text-emerald-700 dark:text-emerald-300">— {o.preuve}</span>
                <span className="text-gray-600 dark:text-slate-400">→ {o.actionSuggeree}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 4. BLOC À FAIRE MAINTENANT — Max 3 actions */}
      {ceoDecisions.actions.length > 0 && (
        <div className="rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-4">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-200 mb-2">À faire maintenant</h3>
          <div className="flex flex-wrap gap-2">
            {ceoDecisions.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => navigate(`${base}/${a.route}`)}
                className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. FINANCE UNIFIÉE — Résumé contrôle */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-900/20 dark:border-blue-800 p-4">
          <MetricCard
            label="Ventes temps réel"
            value={unifiedFinanceLoading ? "—" : money(unifiedFinance?.live.totalRevenue ?? 0)}
            icon={TrendingUp}
            valueColorVar="#2563eb"
          />
          <p className="text-xs text-gray-500 mt-1">Source : reservations + shipments (vendus / payés)</p>
        </div>
        <div className="rounded-lg border-2 border-green-200 bg-green-50/50 dark:bg-green-900/20 dark:border-green-800 p-4">
          <MetricCard
            label="Encaissements"
            value={unifiedFinanceLoading ? "—" : money(unifiedFinance?.cash.total ?? 0)}
            icon={TrendingUp}
            valueColorVar="#16a34a"
          />
          <p className="text-xs text-gray-500 mt-1">Source : cashTransactions (status paid)</p>
        </div>
        <div className="rounded-lg border-2 border-violet-200 bg-violet-50/50 dark:bg-violet-900/20 dark:border-violet-800 p-4">
          <MetricCard
            label="Revenus validés"
            value={unifiedFinanceLoading ? "—" : money(unifiedFinance?.validated.totalRevenue ?? 0)}
            icon={TrendingUp}
            valueColorVar="#7c3aed"
          />
          <p className="text-xs text-gray-500 mt-1">Source : dailyStats (ticketRevenue + courierRevenue)</p>
        </div>
      </div>

      {/* 6. KPI (secondaire — détail) */}
      <p className="text-xs text-gray-500 mb-2">Indicateurs détaillés — période sélectionnée</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <Link to={`${base}/reservations-reseau?period=${periodParam}`} className="block">
          <MetricCard
            label={period === "day" ? "CA aujourd'hui" : "CA période"}
            value={cashKpisLoading ? "—" : money(caFromCash)}
            icon={TrendingUp}
            variation={prevStats ? calculateChange(caFromCash, prevStats.totalRevenue) : undefined}
            variationLabel={prevStats?.comparisonLabel}
          />
        </Link>
        <Link to={`${base}/reservations-reseau`} className="block">
          <MetricCard
            label="Billets vendus"
            value={cashKpisLoading ? "—" : String(billetsFromCash)}
            icon={Ticket}
            variation={prevStats ? calculateChange(billetsFromCash, prevStats.totalTickets) : undefined}
            variationLabel={prevStats?.comparisonLabel}
          />
        </Link>
        <Link to={`${base}/reservations-reseau#agences`} className="block">
          <MetricCard
            label="Agences actives"
            value={cashKpisLoading ? "—" : `${agencesActivesFromCash} / ${agencies.length || "—"}`}
            icon={Building2}
            variation={prevStats ? calculateChange(agencesActivesFromCash, prevStats.activeAgencies) : undefined}
            variationLabel={prevStats?.comparisonLabel}
          />
        </Link>
        <Link to={`${base}/flotte`} className="block">
          <MetricCard
            label="Bus en circulation"
            value={busesInProgressCount !== null ? String(busesInProgressCount) : "—"}
            icon={Truck}
          />
        </Link>
        <Link to={`${base}/flotte?filter=retard`} className="block">
          <MetricCard
            label="Bus en retard"
            value={delayedBusesCount !== null ? String(delayedBusesCount) : "—"}
            icon={Clock}
            valueColorVar={delayedBusesCount != null && delayedBusesCount > 0 ? "#b91c1c" : undefined}
          />
        </Link>
        <Link to={`${base}/audit-controle`} className="block">
          <MetricCard
            label="Problèmes prioritaires"
            value={ceoDecisions.problems.length > 0 ? String(ceoDecisions.problems.length) : "0"}
            icon={AlertTriangle}
            valueColorVar={ceoDecisions.problems.length > 0 ? "#b91c1c" : undefined}
          />
        </Link>
      </div>

    </StandardLayoutWrapper>
  );
}
