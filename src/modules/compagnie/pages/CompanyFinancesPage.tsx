// Phase 5 — Company-level consolidated finances (CEO + company_accountant). Not agency accounting.
import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  collectionGroup,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  limit,
  onSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useGlobalDataSnapshot } from "@/contexts/GlobalDataSnapshotContext";
import { useGlobalMoneyPositions } from "@/contexts/GlobalMoneyPositionsContext";
import { StandardLayoutWrapper, PageHeader, MetricCard } from "@/ui";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { DollarSign, AlertTriangle, Building2, Download, Info, Siren } from "lucide-react";
import { useCapabilities } from "@/core/hooks/useCapabilities";
import AccessDenied from "@/core/ui/AccessDenied";
import { canonicalStatut } from "@/utils/reservationStatusUtils";
import { calculateChange } from "@/shared/date/periodComparisonUtils";
import {
  getNetworkSales,
} from "@/modules/finance/services/financialConsistencyService";
import {
  getUnifiedCompanyFinance,
  type UnifiedAgencyFinance,
} from "@/modules/finance/services/unifiedFinanceService";

const SHIFT_REPORTS_COLLECTION = "shiftReports";

type DailyStatsDoc = {
  companyId?: string;
  agencyId?: string;
  date?: string;
  ticketRevenue?: number;
  courierRevenue?: number;
  totalRevenue?: number;
  totalPassengers?: number;
  validatedSessions?: number;
};

type ShiftReportDoc = {
  shiftId?: string;
  agencyId?: string;
  status?: string;
  totalRevenue?: number;
  montant?: number;
  validationAudit?: { computedDifference?: number; validatedAt?: unknown };
  startAt?: { toDate?: () => Date };
};

type ShiftDoc = {
  status?: string;
};

type ReservationDoc = {
  statut?: string;
  shiftId?: string;
  createdInSessionId?: string;
  montant?: number;
  date?: string;
  /** Date de vente (créée). Utilisé pour aligner la période (audit-proof). */
  createdAt?: unknown;
  /** Nombre de places effectivement vendues (billets = somme(seatsGo)). */
  seatsGo?: number;
};

function toDateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
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

type CompanyFinancesPageProps = {
  embedded?: boolean;
};

const WARNING_GAP_THRESHOLD = 50000;
const CRITICAL_GAP_THRESHOLD = 150000;

function InfoHint({ text }: { text: string }) {
  return (
    <button
      type="button"
      title={text}
      aria-label={text}
      className="inline-flex items-center justify-center rounded-full text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-200"
    >
      <Info className="w-4 h-4" />
    </button>
  );
}

export default function CompanyFinancesPage({ embedded = false }: CompanyFinancesPageProps) {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const { hasCapability, loading: capLoading } = useCapabilities();

  /** Données dérivées uniquement (dailyStats) : jamais pour calcul principal ventes/cash/validated. */
  const [derivedDailyStats, setDerivedDailyStats] = useState<DailyStatsDoc[]>([]);
  const [discrepancies, setDiscrepancies] = useState<ShiftReportDoc[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [agencyFilter, setAgencyFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [liveSalesByAgency, setLiveSalesByAgency] = useState<
    { agencyId: string; liveAmount: number; liveTickets: number; openSessions: number }[]
  >([]);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<Date | null>(null);
  const [currency, setCurrency] = useState("XOF");
  const [comparisonStats, setComparisonStats] = useState<{
    day: { current: number; prev: number; label: string };
    week: { current: number; prev: number; label: string };
    month: { current: number; prev: number; label: string };
  } | null>(null);
  const [unifiedFinance, setUnifiedFinance] = useState<UnifiedAgencyFinance | null>(null);
  const [unifiedFinanceLoading, setUnifiedFinanceLoading] = useState(false);
  const globalSnapshot = useGlobalDataSnapshot();
  const moneyPositions = useGlobalMoneyPositions();

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    const today = toDateKey(new Date());
    const weekStart = toDateKey(subDays(new Date(), 6));
    const monthStart = toDateKey(subDays(new Date(), 29));
    const monthStartMs = new Date(`${monthStart}T00:00:00.000`).getTime();
    const todayEndMs = new Date(`${today}T23:59:59.999`).getTime();

    (async () => {
      setLoading(true);
      try {
        const [agencesSnap, companySnap] = await Promise.all([
          getDocs(collection(db, "companies", companyId, "agences")),
          getDoc(doc(db, "companies", companyId)),
        ]);
        const companyData =
          (companySnap.data() as { currency?: string; devise?: string; defaultCurrency?: string } | undefined) ??
          {};
        const currencyCandidate = companyData.currency ?? companyData.devise ?? companyData.defaultCurrency;
        setCurrency(typeof currencyCandidate === "string" && currencyCandidate.length > 0 ? currencyCandidate : "XOF");
        const ags = agencesSnap.docs.map((d) => ({
          id: d.id,
          nom:
            (d.data() as { nom?: string; nomAgence?: string; name?: string }).nom ??
            (d.data() as { nom?: string; nomAgence?: string; name?: string }).nomAgence ??
            (d.data() as { nom?: string; nomAgence?: string; name?: string }).name ??
            d.id,
        }));
        setAgencies(ags);

        const qDaily = query(
          collectionGroup(db, "dailyStats"),
          where("companyId", "==", companyId),
          where("date", ">=", monthStart),
          where("date", "<=", today),
          limit(500)
        );
        const dailySnap = await getDocs(qDaily);
        setDerivedDailyStats(dailySnap.docs.map((d) => d.data() as DailyStatsDoc));

        const disc: ShiftReportDoc[] = [];
        for (const a of ags.slice(0, 30)) {
          const ref = collection(db, "companies", companyId, "agences", a.id, SHIFT_REPORTS_COLLECTION);
          const q = query(
            ref,
            where("status", "==", "validated"),
            limit(20)
          );
          try {
            const snap = await getDocs(q);
            snap.docs.forEach((d) => {
              const data = d.data() as ShiftReportDoc;
              const diff = data.validationAudit?.computedDifference ?? 0;
              const reportMs = toMillis(data.validationAudit?.validatedAt) ?? toMillis(data.startAt);
              const inCurrentWindow =
                reportMs != null && reportMs >= monthStartMs && reportMs <= todayEndMs;
              if (diff !== 0 && inCurrentWindow) {
                disc.push({ ...data, agencyId: a.id });
              }
            });
          } catch {
            const alt = query(ref, where("status", "==", "validated"), limit(20));
            const snap = await getDocs(alt);
            snap.docs.forEach((d) => {
              const data = d.data() as ShiftReportDoc;
              const diff = data.validationAudit?.computedDifference ?? 0;
              const reportMs = toMillis(data.validationAudit?.validatedAt) ?? toMillis(data.startAt);
              const inCurrentWindow =
                reportMs != null && reportMs >= monthStartMs && reportMs <= todayEndMs;
              if (diff !== 0 && inCurrentWindow) {
                disc.push({ ...data, agencyId: a.id });
              }
            });
          }
        }
        setDiscrepancies(disc);
      } catch (e) {
        console.error("CompanyFinances load:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const globalPeriod = useGlobalPeriodContext();

  // Finance unifiée : 3 niveaux (live, cash, validated) — période globale unique
  useEffect(() => {
    if (!companyId) return;
    const { dateFrom, dateTo } = globalPeriod.toFinancialPeriod();
    setUnifiedFinanceLoading(true);
    getUnifiedCompanyFinance(companyId, dateFrom, dateTo)
      .then(setUnifiedFinance)
      .catch(() => setUnifiedFinance(null))
      .finally(() => setUnifiedFinanceLoading(false));
  }, [companyId, globalPeriod.startDate, globalPeriod.endDate]);

  // Comparaison période précédente : ventes (getNetworkSales), pas getNetworkStats
  useEffect(() => {
    if (!companyId) return;
    const now = new Date();
    const today = toDateKey(now);
    const yesterday = toDateKey(subDays(now, 1));
    const weekStart = toDateKey(subDays(now, 6));
    const prevWeekStart = toDateKey(subDays(now, 13));
    const monthStart = toDateKey(subDays(now, 29));
    const prevMonthStart = toDateKey(subDays(now, 59));
    Promise.all([
      getNetworkSales(companyId, { dateFrom: today, dateTo: today }),
      getNetworkSales(companyId, { dateFrom: yesterday, dateTo: yesterday }),
      getNetworkSales(companyId, { dateFrom: weekStart, dateTo: today }),
      getNetworkSales(companyId, { dateFrom: prevWeekStart, dateTo: toDateKey(subDays(now, 7)) }),
      getNetworkSales(companyId, { dateFrom: monthStart, dateTo: today }),
      getNetworkSales(companyId, { dateFrom: prevMonthStart, dateTo: toDateKey(subDays(now, 30)) }),
    ])
      .then(([currDay, prevDay, currWeek, prevWeek, currMonth, prevMonth]) => {
        setComparisonStats({
          day: { current: currDay.total, prev: prevDay.total, label: "Comparé à hier" },
          week: { current: currWeek.total, prev: prevWeek.total, label: "Comparé aux 7 jours précédents" },
          month: { current: currMonth.total, prev: prevMonth.total, label: "Comparé aux 30 jours précédents" },
        });
      })
      .catch(() => setComparisonStats(null));
  }, [companyId]);

  useEffect(() => {
    if (!companyId || agencies.length === 0) {
      setLiveSalesByAgency([]);
      return;
    }

    const shiftsByAgency = new Map<string, ShiftDoc[]>();
    const reservationsByAgency = new Map<string, ReservationDoc[]>();
    // "Aujourd'hui" = borne haute de la période globale (par défaut: jour J).
    const dayKey = globalPeriod.endDate;
    const unsubs: Array<() => void> = [];

    const recompute = () => {
      const rows = agencies.map((agency) => {
        const shiftDocs = shiftsByAgency.get(agency.id) ?? [];
        const reservationDocs = reservationsByAgency.get(agency.id) ?? [];

        const nonValidatedShiftIds = new Set<string>();
        shiftDocs.forEach((s: ShiftDoc & { __id?: string }) => {
          if (s.__id && s.status !== "validated") {
            nonValidatedShiftIds.add(s.__id);
          }
        });

        let liveAmount = 0;
        let liveTickets = 0;
        reservationDocs.forEach((r) => {
          const shiftRef = r.shiftId ?? r.createdInSessionId;
          if (!shiftRef || !nonValidatedShiftIds.has(shiftRef)) return;
          if (canonicalStatut(r.statut) !== "paye") return;
          // Alignement strict sur la date de vente (createdAt) => ventes = réservations.createdAt.
          // Fallback: si createdAt absent, utiliser r.date (legacy) pour ne pas casser les données anciennes.
          const createdAtAny = r.createdAt as any;
          let reservationDateKey: string | null = null;
          try {
            if (createdAtAny?.toDate) {
              reservationDateKey = toDateKey(createdAtAny.toDate());
            } else if (typeof createdAtAny?.seconds === "number") {
              reservationDateKey = toDateKey(new Date(createdAtAny.seconds * 1000));
            }
          } catch {
            reservationDateKey = null;
          }
          const legacyDateKey = typeof r.date === "string" ? r.date : null;
          const effectiveDateKey = reservationDateKey ?? legacyDateKey;
          if (effectiveDateKey && effectiveDateKey !== dayKey) return;
          liveAmount += Number(r.montant) || 0;
          liveTickets += Number(r.seatsGo ?? 1) || 1;
        });

        return {
          agencyId: agency.id,
          liveAmount,
          liveTickets,
          openSessions: nonValidatedShiftIds.size,
        };
      });

      setLiveSalesByAgency(rows);
      setLiveUpdatedAt(new Date());
    };

    agencies.forEach((agency) => {
      const shiftsRef = collection(db, "companies", companyId, "agences", agency.id, "shifts");
      const reservationsRef = collection(db, "companies", companyId, "agences", agency.id, "reservations");

      const unsubShifts = onSnapshot(query(shiftsRef, limit(1000)), (snap) => {
        const rows = snap.docs.map((d) => ({ __id: d.id, ...(d.data() as ShiftDoc) }));
        shiftsByAgency.set(agency.id, rows);
        recompute();
      });

      const unsubReservations = onSnapshot(query(reservationsRef, limit(4000)), (snap) => {
        reservationsByAgency.set(agency.id, snap.docs.map((d) => d.data() as ReservationDoc));
        recompute();
      });

      unsubs.push(unsubShifts, unsubReservations);
    });

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [companyId, agencies, globalPeriod.endDate]);

  const agencyNames = useMemo(() => new Map(agencies.map((a) => [a.id, a.nom])), [agencies]);
  const getAgencyDisplayName = (agencyId: string) => {
    const name = agencyNames.get(agencyId);
    return name && name !== agencyId ? name : "Agence inconnue";
  };

  const sumTicket = (list: DailyStatsDoc[]) =>
    list.reduce((s, d) => s + (Number(d.ticketRevenue ?? d.totalRevenue) || 0), 0);
  const sumCourier = (list: DailyStatsDoc[]) =>
    list.reduce((s, d) => s + (Number(d.courierRevenue) || 0), 0);
  const sumTotal = (list: DailyStatsDoc[]) =>
    list.reduce((s, d) => {
      const tot = Number(d.totalRevenue) || 0;
      const ticket = Number(d.ticketRevenue ?? d.totalRevenue) || 0;
      const courier = Number(d.courierRevenue) || 0;
      return s + (tot > 0 ? tot : ticket + courier);
    }, 0);

  const revenueToday = useMemo(() => {
    const day = globalPeriod.endDate;
    const list = derivedDailyStats.filter((d) => d.date === day);
    return { ticket: sumTicket(list), courier: sumCourier(list), total: sumTotal(list) };
  }, [derivedDailyStats]);

  const revenueWeek = useMemo(() => {
    const today = new Date();
    const weekStart = subDays(today, 6);
    const list = derivedDailyStats.filter((d) => {
      if (!d.date) return false;
      const dt = new Date(d.date);
      return dt >= startOfDay(weekStart) && dt <= endOfDay(today);
    });
    return { ticket: sumTicket(list), courier: sumCourier(list), total: sumTotal(list) };
  }, [derivedDailyStats]);

  const revenueMonth = useMemo(() => ({
    ticket: sumTicket(derivedDailyStats),
    courier: sumCourier(derivedDailyStats),
    total: sumTotal(derivedDailyStats),
  }), [derivedDailyStats]);

  /** Revenus consolidés période précédente (même source que les totaux → cohérence des chiffres). */
  const revenueYesterday = useMemo(() => {
    const yesterday = toDateKey(subDays(new Date(), 1));
    const list = derivedDailyStats.filter((d) => d.date === yesterday);
    return sumTotal(list);
  }, [derivedDailyStats]);
  const revenuePrevWeek = useMemo(() => {
    const now = new Date();
    const prevWeekEnd = subDays(now, 7);
    const prevWeekStart = subDays(now, 13);
    const list = derivedDailyStats.filter((d) => {
      if (!d.date) return false;
      const dt = new Date(d.date);
      return dt >= startOfDay(prevWeekStart) && dt <= endOfDay(prevWeekEnd);
    });
    return sumTotal(list);
  }, [derivedDailyStats]);
  const revenuePrevMonth = useMemo(() => {
    const now = new Date();
    const prevMonthEnd = subDays(now, 30);
    const prevMonthStart = subDays(now, 59);
    const list = derivedDailyStats.filter((d) => {
      if (!d.date) return false;
      const dt = new Date(d.date);
      return dt >= startOfDay(prevMonthStart) && dt <= endOfDay(prevMonthEnd);
    });
    return sumTotal(list);
  }, [derivedDailyStats]);

  const byAgency = useMemo(() => {
    const today = globalPeriod.endDate;
    const map = new Map<string, { today: number; week: number; month: number; ticket: number; courier: number }>();

    // Initialize all known agencies so they always appear (even with zero activity)
    agencies.forEach((a) => {
      map.set(a.id, { today: 0, week: 0, month: 0, ticket: 0, courier: 0 });
    });

    derivedDailyStats.forEach((d) => {
      const aid = d.agencyId ?? "";
      if (!aid) return;
      const cur = map.get(aid) ?? { today: 0, week: 0, month: 0, ticket: 0, courier: 0 };
      const ticket = Number(d.ticketRevenue ?? d.totalRevenue) || 0;
      const courier = Number(d.courierRevenue) || 0;
      const rev = Number(d.totalRevenue) || 0 || ticket + courier;
      cur.month += rev;
      cur.ticket += ticket;
      cur.courier += courier;
      if (d.date === today) cur.today += rev;
      const dDate = d.date ? new Date(d.date) : null;
      if (dDate && dDate >= subDays(new Date(), 6)) cur.week += rev;
      map.set(aid, cur);
    });

    return Array.from(map.entries()).map(([agencyId, v]) => ({
      agencyId,
      nom: getAgencyDisplayName(agencyId),
      ...v,
    }));
  }, [derivedDailyStats, agencies, agencyNames]);

  const filteredDiscrepancies = useMemo(() => {
    if (!agencyFilter) return discrepancies;
    return discrepancies.filter((d) => d.agencyId === agencyFilter);
  }, [discrepancies, agencyFilter]);

  const liveByAgencyMap = useMemo(
    () => new Map(liveSalesByAgency.map((l) => [l.agencyId, l])),
    [liveSalesByAgency]
  );
  const liveSalesTotal = useMemo(
    () => liveSalesByAgency.reduce((sum, row) => sum + row.liveAmount, 0),
    [liveSalesByAgency]
  );
  const liveTicketsTotal = useMemo(
    () => liveSalesByAgency.reduce((sum, row) => sum + row.liveTickets, 0),
    [liveSalesByAgency]
  );
  const openSessionsTotal = useMemo(
    () => liveSalesByAgency.reduce((sum, row) => sum + row.openSessions, 0),
    [liveSalesByAgency]
  );
  const globalGap = useMemo(
    () => liveSalesTotal - revenueToday.total,
    [liveSalesTotal, revenueToday.total]
  );

  const moneyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      });
    } catch {
      return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
    }
  }, [currency]);
  const money = (value: number) => moneyFormatter.format(Number(value) || 0);

  const surveillanceRows = useMemo(
    () =>
      agencies
        .map((a) => {
          const live = liveByAgencyMap.get(a.id);
          const consolidated = byAgency.find((x) => x.agencyId === a.id)?.today ?? 0;
          const gap = (live?.liveAmount ?? 0) - consolidated;
          return {
            agencyId: a.id,
            name: a.nom,
            liveAmount: live?.liveAmount ?? 0,
            consolidated,
            gap,
            openSessions: live?.openSessions ?? 0,
            liveTickets: live?.liveTickets ?? 0,
          };
        })
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap)),
    [agencies, liveByAgencyMap, byAgency]
  );

  const criticalAlerts = useMemo(
    () => surveillanceRows.filter((r) => Math.abs(r.gap) >= CRITICAL_GAP_THRESHOLD),
    [surveillanceRows]
  );
  const warningAlerts = useMemo(
    () =>
      surveillanceRows.filter(
        (r) => Math.abs(r.gap) >= WARNING_GAP_THRESHOLD && Math.abs(r.gap) < CRITICAL_GAP_THRESHOLD
      ),
    [surveillanceRows]
  );

  const exportCsv = () => {
    const rows = [
      ["Agence", "Shift ID", "Écart (reçu - attendu)", "Date"].join(";"),
      ...filteredDiscrepancies.map((d) =>
        [
          agencyNames.get(d.agencyId ?? "") ?? d.agencyId,
          d.shiftId ?? "",
          (d.validationAudit?.computedDifference ?? 0).toString(),
          d.validationAudit?.validatedAt ? String(d.validationAudit.validatedAt) : "",
        ].join(";")
      ),
    ];
    const blob = new Blob(["\ufeff" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ecarts-comptables-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wrap = (node: React.ReactNode) =>
    embedded ? <>{node}</> : <StandardLayoutWrapper>{node}</StandardLayoutWrapper>;

  if (capLoading) {
    return wrap(
      <>
        {!embedded && <PageHeader title="Finances compagnie" />}
        <div className="flex items-center justify-center min-h-[200px] text-gray-500">Chargement…</div>
      </>
    );
  }

  if (!hasCapability("manage_company_finances")) {
    return <AccessDenied capability="manage_company_finances" />;
  }

  if (!companyId) {
    return wrap(
      <>
        {!embedded && <PageHeader title="Finances compagnie" />}
        <p className="text-gray-500">Compagnie introuvable.</p>
      </>
    );
  }

  if (loading) {
    return wrap(
      <>
        {!embedded && <PageHeader title="Finances compagnie" />}
        <div className="flex items-center justify-center min-h-[200px] text-gray-500">Chargement…</div>
      </>
    );
  }

  return wrap(
    <>
      {!embedded && <PageHeader title="Finances compagnie" />}

      {/* Positions d'argent (vérité métier) */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {globalSnapshot.snapshot.mode === "realtime" ? "Mis à jour en temps réel" : "Mis à jour"}{" "}
          :{" "}
          {globalSnapshot.snapshot.lastUpdatedAt
            ? globalSnapshot.snapshot.lastUpdatedAt.toLocaleTimeString("fr-FR")
            : "—"}
        </span>
        <button
          type="button"
          onClick={() => void globalSnapshot.refresh()}
          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Rafraîchir
        </button>
      </div>
      <section className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-900/20 dark:border-blue-800 p-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">En attente validation (guichet)</div>
          <div className="text-xl font-bold mt-1" style={{ color: "#2563eb" }}>
            {moneyPositions.loading ? "—" : money(moneyPositions.snapshot.pendingGuichet)}
          </div>
          <p className="text-xs text-gray-500 mt-1">sessions clôturées non validées</p>
        </div>
        <div className="rounded-lg border-2 border-green-200 bg-green-50/50 dark:bg-green-900/20 dark:border-green-800 p-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Validé agence</div>
          <div className="text-xl font-bold mt-1" style={{ color: "#16a34a" }}>
            {moneyPositions.loading ? "—" : money(moneyPositions.snapshot.validatedAgency)}
          </div>
          <p className="text-xs text-gray-500 mt-1">sessions validées par comptable agence</p>
        </div>
        <div className="rounded-lg border-2 border-violet-200 bg-violet-50/50 dark:bg-violet-900/20 dark:border-violet-800 p-4">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Centralisé (banque / mobile money)</div>
          <div className="text-xl font-bold mt-1" style={{ color: "#7c3aed" }}>
            {moneyPositions.loading ? "—" : money(moneyPositions.snapshot.centralised)}
          </div>
          <p className="text-xs text-gray-500 mt-1">financialAccounts (comptes entreprise)</p>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <h2 className="text-lg font-semibold">Surveillance financière</h2>
          <InfoHint text="Temps réel: ventes des sessions non validées du jour. Consolidé: ventes validées comptablement." />
        </div>

        {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm">
            <div className="inline-flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300">
              <Siren className="w-4 h-4" />
              Alertes automatiques d&apos;écart
            </div>
            <div className="mt-1 text-amber-700/90 dark:text-amber-200">
              {criticalAlerts.length} critique(s) (≥ {money(CRITICAL_GAP_THRESHOLD)}) · {warningAlerts.length} avertissement(s) (≥ {money(WARNING_GAP_THRESHOLD)})
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-secondary/40 bg-secondary/20 dark:bg-slate-700/40 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-600 dark:text-slate-400">
              <span>Temps réel</span>
              <InfoHint text="Montant des ventes en cours provenant des sessions non validées." />
            </div>
            <div className="mt-1 text-xl font-bold text-primary">{money(liveSalesTotal)}</div>
          </div>
          <div className="rounded-xl border border-secondary/40 bg-secondary/20 dark:bg-slate-700/40 p-4">
            <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-600 dark:text-slate-400">
              <span>Consolidé validé</span>
              <InfoHint text="Montant validé après contrôle comptable sur la journée en cours." />
            </div>
            <div className="mt-1 text-xl font-bold text-primary">{money(revenueToday.total)}</div>
          </div>
          <div className="rounded-xl border border-primary/30 bg-primary/10 dark:bg-primary/20 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-600 dark:text-slate-400">Écart à investiguer</div>
            <div className={`mt-1 text-xl font-bold ${globalGap === 0 ? "text-primary" : globalGap > 0 ? "text-amber-600" : "text-emerald-600"}`}>
              {globalGap > 0 ? "+" : ""}
              {money(globalGap)}
            </div>
          </div>
          <div className="rounded-xl border border-secondary/40 bg-secondary/20 dark:bg-slate-700/40 p-4">
            <div className="text-xs uppercase tracking-wide text-gray-600 dark:text-slate-400">Sessions / billets live</div>
            <div className="mt-1 text-xl font-bold text-primary">
              {openSessionsTotal} / {liveTicketsTotal}
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-auto max-h-[420px] rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800 border-b dark:border-slate-700">
              <tr>
                <th className="text-left py-2 px-3">Agence</th>
                <th className="text-right py-2 px-3">Temps réel</th>
                <th className="text-right py-2 px-3">Consolidé</th>
                <th className="text-right py-2 px-3">Écart</th>
                <th className="text-right py-2 px-3">Sessions</th>
                <th className="text-right py-2 px-3">Billets</th>
              </tr>
            </thead>
            <tbody>
              {surveillanceRows.map((row) => {
                const absGap = Math.abs(row.gap);
                const rowClass =
                  absGap >= CRITICAL_GAP_THRESHOLD
                    ? "bg-red-50/60 dark:bg-red-900/20"
                    : absGap >= WARNING_GAP_THRESHOLD
                      ? "bg-amber-50/60 dark:bg-amber-900/20"
                      : "";
                return (
                  <tr key={row.agencyId} className={`border-b dark:border-slate-700 ${rowClass}`}>
                    <td className="py-2 px-3 font-medium text-primary">{row.name}</td>
                    <td className="py-2 px-3 text-right">{money(row.liveAmount)}</td>
                    <td className="py-2 px-3 text-right">{money(row.consolidated)}</td>
                    <td className={`py-2 px-3 text-right font-semibold ${row.gap === 0 ? "text-primary" : row.gap > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {row.gap > 0 ? "+" : ""}
                      {money(row.gap)}
                    </td>
                    <td className="py-2 px-3 text-right">{row.openSessions}</td>
                    <td className="py-2 px-3 text-right">{row.liveTickets}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-slate-400">
          Dernière mise à jour live: {liveUpdatedAt ? liveUpdatedAt.toLocaleTimeString("fr-FR") : "—"} · Devise: {currency}
        </p>
      </section>
      {/* Consolidated Revenue */}
      <section className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="w-5 h-5" /> Revenus consolidés (billets + courrier)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Aujourd'hui (total)"
            value={money(revenueToday.total)}
            icon={DollarSign}
            valueColorVar="#4338ca"
            variation={calculateChange(revenueToday.total, revenueYesterday)}
            variationLabel="Comparé à hier"
          />
          <MetricCard
            label="7 derniers jours (total)"
            value={money(revenueWeek.total)}
            icon={DollarSign}
            valueColorVar="#7c3aed"
            variation={calculateChange(revenueWeek.total, revenuePrevWeek)}
            variationLabel="Comparé aux 7 jours précédents"
          />
          <MetricCard
            label="30 derniers jours (total)"
            value={money(revenueMonth.total)}
            icon={DollarSign}
            valueColorVar="#0f766e"
            variation={calculateChange(revenueMonth.total, revenuePrevMonth)}
            variationLabel="Comparé aux 30 jours précédents"
          />
        </div>
        <div className="mt-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="font-medium">30j :</span> Billets {money(revenueMonth.ticket)} · Courrier {money(revenueMonth.courier)}
        </div>
        <div className="mt-4 overflow-auto max-h-[380px] rounded-xl border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-slate-800 border-b dark:border-slate-700">
              <tr>
                <th className="text-left py-2 px-3">Agence</th>
                <th className="text-right py-2 px-3">Aujourd&apos;hui</th>
                <th className="text-right py-2 px-3">7 jours</th>
                <th className="text-right py-2 px-3">30 jours</th>
              </tr>
            </thead>
            <tbody>
              {byAgency.map((a) => (
                <tr key={a.agencyId} className="border-b dark:border-slate-700">
                  <td className="py-2 px-3 font-medium text-primary">{a.nom}</td>
                  <td className="py-2 px-3 text-right">{money(a.today)}</td>
                  <td className="py-2 px-3 text-right">{money(a.week)}</td>
                  <td className="py-2 px-3 text-right font-semibold">{money(a.month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Discrepancy Monitoring */}
      <section className="bg-white dark:bg-slate-800 rounded-xl border dark:border-slate-700 p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" /> Écarts comptables (computedDifference ≠ 0)
        </h2>
        <div className="flex flex-wrap gap-2 mb-3">
          <select
            className="border rounded px-3 py-1.5 text-sm"
            value={agencyFilter}
            onChange={(e) => setAgencyFilter(e.target.value)}
          >
            <option value="">Toutes les agences</option>
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>{a.nom}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded text-sm"
          >
            <Download className="w-4 h-4" /> Exporter CSV
          </button>
        </div>
        {filteredDiscrepancies.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun écart enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Agence</th>
                  <th className="text-left py-2">Shift</th>
                  <th className="text-right py-2">Écart</th>
                </tr>
              </thead>
              <tbody>
                {filteredDiscrepancies.map((d, i) => (
                  <tr key={i} className="border-b">
                    <td className="py-2">{getAgencyDisplayName(d.agencyId ?? "")}</td>
                    <td className="py-2">{d.shiftId ?? "—"}</td>
                    <td className="py-2 text-right">
                      {(d.validationAudit?.computedDifference ?? 0) >= 0 ? "+" : ""}
                      {money(d.validationAudit?.computedDifference ?? 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-gray-500">
        Accès : CEO (admin_compagnie) et comptable compagnie (company_accountant). Aucune validation ni modification des sessions depuis cette page.
      </p>
    </>
  );
}
