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
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { format } from "date-fns";
import { formatDateLongFr } from "@/utils/dateFmt";
import { canonicalStatut } from "@/utils/reservationStatusUtils";
import { getDateRangeForPeriod, type PeriodKind } from "@/shared/date/periodUtils";
import PeriodFilterBar from "@/shared/date/PeriodFilterBar";
import { Truck, AlertTriangle, Wallet } from "lucide-react";
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
  REVENUE_CRITICAL_DROP,
  REVENUE_WARNING_DROP,
  ACCOUNT_CRITICAL_THRESHOLD,
  ACCOUNT_WARNING_THRESHOLD,
  AGENCIES_AT_RISK_CRITICAL_COUNT,
} from "@/modules/compagnie/commandCenter/strategicThresholds";
import CommandCenterBlocksAtoE, { type BlocksAtoEData } from "@/modules/compagnie/commandCenter/CEOCommandCenterBlocks";
const TODAY = format(new Date(), "yyyy-MM-dd");

type DailyStatsDoc = {
  companyId?: string;
  agencyId?: string;
  date?: string;
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
};
type ShiftReportRow = { agencyId?: string; validationAudit?: { computedDifference?: number } };
type ReservationRow = {
  trajetId?: string;
  montant?: number;
  date?: string;
  statut?: string;
  shiftId?: string;
  createdInSessionId?: string;
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

export default function CEOCommandCenterPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const navigate = useNavigate();
  const { setHeader, resetHeader } = usePageHeader();

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

  const periodRange = React.useMemo(() => {
    const range = getDateRangeForPeriod(period, new Date(), customStart || undefined, customEnd || undefined);
    return {
      startStr: format(range.start, "yyyy-MM-dd"),
      endStr: format(range.end, "yyyy-MM-dd"),
    };
  }, [period, customStart, customEnd]);

  const loadRunIdRef = useRef(0);

  useEffect(() => {
    setHeader({ title: "Centre de commande" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  // PendingRevenue : calcul isolé, sans collectionGroup, sans filtre période
  useEffect(() => {
    if (!companyId) return;

    let cancelled = false;

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
          const r = d.data() as { statut?: string; shiftId?: string; createdInSessionId?: string; montant?: number };
          const shiftId = r.shiftId ?? r.createdInSessionId;
          if (canonicalStatut(r.statut) === "paye" && shiftId && nonValidatedShiftIds.has(shiftId)) {
            total += Number(r.montant) || 0;
          }
        });
      });

      if (!cancelled) setPendingRevenue(total);
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  // Load dailyStats, agencyLiveState, expenses, discrepancies, trip revenues; agencies loaded here too
  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const runId = ++loadRunIdRef.current;
    const { startStr, endStr } = periodRange;

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
        tripCostsListResult = tcSnap.docs.map((d) => d.data() as TripCostRow);
        riskSettingsResult = settingsSnap;
        shiftReportsSnap.docs.forEach((d) => {
          const data = d.data() as ShiftReportRow & { agencyId?: string };
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

  const globalRevenue = useMemo(
    () => dailyStatsList.reduce((s, d) => s + (Number(d.totalRevenue) || 0), 0),
    [dailyStatsList]
  );

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
      .map((d) => ({
        agencyId: d.agencyId ?? "",
        nom: agencyNames(d.agencyId ?? ""),
        revenue: Number(d.totalRevenue) || 0,
      }))
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
    const tripCostsByAgency = new Map<string, number>();
    tripCostsList.forEach((r) => {
      const aid = r.agencyId ?? "";
      tripCostsByAgency.set(aid, (tripCostsByAgency.get(aid) ?? 0) + tripCostPerDoc(r));
    });
    return { expensesByAgency, discrepancyDeductionByAgency, tripCostsByAgency };
  }, [expensesList, discrepancyReports, tripCostsList]);

  const agencyProfits = useMemo((): (ProfitResult & { agencyId: string; nom: string })[] => {
    const { expensesByAgency, discrepancyDeductionByAgency, tripCostsByAgency } = agencyMaps;
    const agencyIds = new Set<string>([
      ...dailyStatsList.map((d) => d.agencyId).filter(Boolean) as string[],
      ...expensesByAgency.keys(),
      ...discrepancyDeductionByAgency.keys(),
      ...tripCostsByAgency.keys(),
    ]);
    return Array.from(agencyIds).map((agencyId) => {
      const revenueFromDailyStats =
        dailyStatsList.find((d) => d.agencyId === agencyId)?.totalRevenue ?? 0;
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
    const healthStatus: "stable" | "attention" | "critical" =
      revenueDropPercent >= REVENUE_CRITICAL_DROP ||
      accountsBelowCritical > 0 ||
      agenciesAtRiskCount >= AGENCIES_AT_RISK_CRITICAL_COUNT
        ? "critical"
        : (revenueDropPercent >= REVENUE_WARNING_DROP && revenueDropPercent < REVENUE_CRITICAL_DROP) ||
            accountsBelowWarning > 0
          ? "attention"
          : "stable";
    const prioritizedRisks: { id: string; label: string; level: "critical" | "warning"; actionRoute: string }[] = [];
    const zeroRev = agencyProfits.filter((p) => p.revenue === 0);
    if (zeroRev.length > 0) {
      prioritizedRisks.push({
        id: "agencies-drop",
        label: `Agences en baisse / sans revenu (${zeroRev.length})`,
        level: zeroRev.length >= AGENCIES_AT_RISK_CRITICAL_COUNT ? "critical" : "warning",
        actionRoute: "dashboard",
      });
    }
    if (accountsBelowCritical > 0) {
      prioritizedRisks.push({
        id: "accounts-critical",
        label: `Comptes sous seuil critique (${accountsBelowCritical})`,
        level: "critical",
        actionRoute: "revenus-liquidites",
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
      globalRevenue,
      pendingRevenue,
      financialPosition,
      revenueVariationPercent,
      healthStatus,
      prioritizedRisks,
      top3Agencies: topAgenciesByRevenue.slice(0, 3),
    }),
    [globalRevenue, pendingRevenue, financialPosition, revenueVariationPercent, healthStatus, prioritizedRisks, topAgenciesByRevenue]
  );

  if (!companyId) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Compagnie introuvable.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Chargement du centre de commande…</div>
      </div>
    );
  }

  return (
    <div className="min-w-0 w-full space-y-4 sm:space-y-6 p-3 sm:p-4 md:p-6 max-w-7xl mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <p className="text-sm text-gray-600">{formatDateLongFr(new Date())}</p>
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
      </div>

      {/* ——— CEO Cockpit V2 — 8 blocs exécutifs (frozen) ——— */}
      <CommandCenterBlocksAtoE companyId={companyId} navigate={navigate} data={blocksAtoEData} />

      {/* 3. Network Operational Status (read-only, company-level) */}
      <section className="bg-white rounded-xl border p-3 sm:p-4 shadow-sm" aria-label="Network Operational Status">
        <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> 3. Network Operational Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <div className="p-2 sm:p-3 rounded-lg bg-gray-100 min-w-0">
            <div className="font-bold">{fleetOverviewCounts.total}</div>
            <div className="text-xs text-gray-600">Total véhicules</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-emerald-50 min-w-0">
            <div className="font-bold">{fleetOverviewCounts.enService}</div>
            <div className="text-xs text-emerald-700">Disponibles (Garage + Normal)</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-blue-50 min-w-0">
            <div className="font-bold">{fleetOverviewCounts.enTransit}</div>
            <div className="text-xs text-blue-700">En transit</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-orange-50 min-w-0">
            <div className="font-bold">{fleetOverviewCounts.maintenance}</div>
            <div className="text-xs text-orange-700">Maintenance</div>
          </div>
          <div className="p-2 sm:p-3 rounded-lg bg-red-50 min-w-0">
            <div className="font-bold">{fleetOverviewCounts.accidente}</div>
            <div className="text-xs text-red-700">Accidentés</div>
          </div>
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => navigate(`/compagnie/${companyId}/garage/fleet`)}
            className="px-4 py-2 rounded-lg bg-indigo-100 text-indigo-800 font-medium text-sm hover:bg-indigo-200 transition"
          >
            Voir la flotte
          </button>
        </div>
      </section>

      {/* 5. Alertes (short list) */}
      <section className="bg-white rounded-xl border p-3 sm:p-4 shadow-sm" aria-label="Alertes">
        <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> 4. Alertes
        </h2>
        {alerts.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune alerte.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.slice(0, 7).map((a, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 text-xs sm:text-sm p-2 rounded break-words min-w-0 ${
                  a.level === "error" ? "bg-red-50 text-red-800" : a.level === "warning" ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-700"
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-current" />
                {a.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 5. Position financière (summary only) */}
      <section className="bg-white rounded-xl border p-3 sm:p-4 shadow-sm" aria-label="Position financière">
        <h2 className="text-base sm:text-lg font-semibold mb-3 flex items-center gap-2">
          <Wallet className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" /> 5. Position financière
        </h2>
        <div className="flex flex-wrap items-center gap-3 sm:gap-4 min-w-0">
          <div className="p-2 sm:p-3 rounded-lg bg-emerald-50 border border-emerald-200 min-w-0">
            <div className="text-lg sm:text-xl font-bold text-emerald-800 truncate">{financialPosition.netPosition.toLocaleString("fr-FR")}</div>
            <div className="text-xs text-emerald-700">Position nette</div>
          </div>
        </div>
      </section>
    </div>
  );
}
