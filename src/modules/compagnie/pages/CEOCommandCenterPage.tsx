// CEO Cockpit V2 — Executive cockpit only. FROZEN.
// 8 blocks: État global (no chart), Risques, Activité opérationnelle, Flotte, Alertes, Position financière (summary), Performance réseau (top 3), Actions rapides.
// One data load wave, minimal state, no Recharts, no heavy compute. Component < 800 lines, < 15 useMemo.
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { formatDateLongFr } from "@/utils/dateFmt";
import { canonicalStatut } from "@/utils/reservationStatusUtils";
import { getDateRangeForPeriod, type PeriodKind } from "@/shared/date/periodUtils";
import PeriodFilterBar from "@/shared/date/PeriodFilterBar";
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
import CommandCenterBlocksAtoE, { type BlocksAtoEData } from "@/modules/compagnie/commandCenter/CEOCommandCenterBlocks";
import { computeCeoGlobalStatus } from "@/modules/compagnie/commandCenter/ceoRiskRules";
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
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const maybeToDate = (value as { toDate?: () => Date }).toDate;
    if (typeof maybeToDate === "function") {
      const d = maybeToDate();
      return d instanceof Date ? d.getTime() : null;
    }
    const seconds = (value as { seconds?: number }).seconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return seconds * 1000;
  }
  return null;
}

export default function CEOCommandCenterPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const navigate = useNavigate();

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
  const [period, setPeriod] = useState<PeriodKind>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [cashDiscrepancyList, setCashDiscrepancyList] = useState<{ agencyId: string; session: CashSessionDocWithId }[]>([]);
  const [courierDiscrepancyList, setCourierDiscrepancyList] = useState<{ agencyId: string; session: CourierSessionWithId }[]>([]);

  const periodRange = React.useMemo(() => {
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
      impactText?: string;
      actionText?: string;
    }[] = [];
    const zeroRev = agencyProfits.filter((p) => p.revenue === 0);
    if (zeroRev.length > 0) {
      prioritizedRisks.push({
        id: "agencies-drop",
        label: `Agences en baisse / sans revenu (${zeroRev.length})`,
        level: zeroRev.length >= AGENCIES_AT_RISK_CRITICAL_COUNT ? "danger" : "warning",
        actionRoute: "dashboard",
        impactText: `${zeroRev.length} agence(s) impactée(s)`,
        actionText: "Analyser",
      });
    }
    if (accountsBelowCritical > 0) {
      prioritizedRisks.push({
        id: "accounts-critical",
        label: `Comptes sous seuil danger (${accountsBelowCritical})`,
        level: "danger",
        actionRoute: "revenus-liquidites",
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

  const blocksAtoEData = useMemo<BlocksAtoEData>(
    () => ({
      globalTicketRevenue,
      globalCourierRevenue,
      globalTotalRevenue,
      pendingRevenue,
      financialPosition,
      pendingPayablesAmount,
      pendingPayablesCount,
      estimatedMonthlyBurn,
      estimatedRunwayMonths,
      realizedRevenue,
      realizedCosts,
      realizedProfit,
      targetMarginPercent,
      budgetGapTop3,
      activeSessionsCount: liveOperationsMetrics.activeSessionsCount,
      pendingValidationSessionsCount: liveOperationsMetrics.pendingValidationSessionsCount,
      activeCourierSessionsCount: liveOperationsMetrics.activeCourierSessionsCount,
      pendingCourierValidationCount: liveOperationsMetrics.pendingCourierValidationCount,
      vehiclesInTransitCount: liveOperationsMetrics.vehiclesInTransitCount,
      boardingOpenCount: liveOperationsMetrics.boardingOpenCount,
      criticalCashDiscrepanciesCount: liveOperationsMetrics.criticalCashDiscrepanciesCount,
      fleetUnavailableCount: liveOperationsMetrics.fleetUnavailableCount,
      revenueVariationPercent,
      healthStatus,
      prioritizedRisks,
      top3Agencies: topAgenciesByRevenue.slice(0, 3),
    }),
    [
      globalTicketRevenue,
      globalCourierRevenue,
      globalTotalRevenue,
      pendingRevenue,
      financialPosition,
      pendingPayablesAmount,
      pendingPayablesCount,
      estimatedMonthlyBurn,
      estimatedRunwayMonths,
      realizedRevenue,
      realizedCosts,
      realizedProfit,
      targetMarginPercent,
      budgetGapTop3,
      liveOperationsMetrics,
      revenueVariationPercent,
      healthStatus,
      prioritizedRisks,
      topAgenciesByRevenue,
    ]
  );

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

  return (
    <StandardLayoutWrapper noVerticalPadding className="px-4 md:px-6 pt-2 md:pt-3 pb-4 md:pb-5 space-y-4">
      <PageHeader
        title="Poste de pilotage"
        subtitle={formatDateLongFr(new Date())}
        icon={Gauge}
        className="mb-2"
        right={
          <PeriodFilterBar
            period={period}
            customStart={customStart || undefined}
            customEnd={customEnd || undefined}
            onPeriodChange={(kind, start, end) => {
              setPeriod(kind);
              setCustomStart(start ?? "");
              setCustomEnd(end ?? "");
            }}
          />
        }
      />

      {/* ——— CEO Cockpit V2 — 8 blocs exécutifs (frozen) ——— */}
      <CommandCenterBlocksAtoE companyId={companyId} navigate={navigate} data={blocksAtoEData} />
    </StandardLayoutWrapper>
  );
}
