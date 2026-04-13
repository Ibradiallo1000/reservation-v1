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
  orderBy,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useGlobalDataSnapshot } from "@/contexts/GlobalDataSnapshotContext";
import { useGlobalMoneyPositions } from "@/contexts/GlobalMoneyPositionsContext";
import { StandardLayoutWrapper, PageHeader, MetricCard } from "@/ui";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import {
  DollarSign,
  AlertTriangle,
  Download,
  Info,
  Siren,
  Landmark,
  Clock,
  CreditCard,
} from "lucide-react";
import { useCapabilities } from "@/core/hooks/useCapabilities";
import AccessDenied from "@/core/ui/AccessDenied";
import { canonicalStatut } from "@/utils/reservationStatusUtils";
import { calculateChange } from "@/shared/date/periodComparisonUtils";
import {
  getUnifiedCompanyFinance,
  type UnifiedAgencyFinance,
} from "@/modules/finance/services/unifiedFinanceService";
import { PENDING_STATUSES } from "@/modules/compagnie/treasury/expenses";

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

const EXPENSE_PENDING_SET = new Set<string>(PENDING_STATUSES as unknown as string[]);

function BlockTitle({
  title,
  tooltip,
  subtitle,
  icon: Icon,
}: {
  title: string;
  tooltip: string;
  subtitle?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="mb-4 border-b border-slate-200/80 dark:border-slate-600 pb-3">
      <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-900 dark:text-slate-100">
        {Icon ? <Icon className="h-5 w-5 shrink-0 text-slate-600 dark:text-slate-300" /> : null}
        {title}
        <InfoHint text={tooltip} />
      </h2>
      {subtitle ? <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 max-w-3xl">{subtitle}</p> : null}
    </div>
  );
}

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

  /** Données dérivées uniquement (dailyStats) : jamais pour calcul principal ventes / ledger. */
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
  const [unifiedFinance, setUnifiedFinance] = useState<UnifiedAgencyFinance | null>(null);
  const [unifiedFinanceLoading, setUnifiedFinanceLoading] = useState(false);
  const [expenseDash, setExpenseDash] = useState({
    pendingCount: 0,
    pendingAmount: 0,
    paidInPeriodAmount: 0,
    submittedInPeriodAmount: 0,
    loading: false,
  });
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

  // Finance unifiée (ledger + ventes) — période globale unique
  useEffect(() => {
    if (!companyId) return;
    const { dateFrom, dateTo } = globalPeriod.toFinancialPeriod();
    setUnifiedFinanceLoading(true);
    getUnifiedCompanyFinance(companyId, dateFrom, dateTo)
      .then(setUnifiedFinance)
      .catch(() => setUnifiedFinance(null))
      .finally(() => setUnifiedFinanceLoading(false));
  }, [companyId, globalPeriod.startDate, globalPeriod.endDate]);

  useEffect(() => {
    if (!companyId) return;
    const { dateFrom, dateTo } = globalPeriod.toFinancialPeriod();
    const fromMs = new Date(`${dateFrom}T00:00:00.000`).getTime();
    const toMs = new Date(`${dateTo}T23:59:59.999`).getTime();

    let cancelled = false;
    setExpenseDash((s) => ({ ...s, loading: true }));

    (async () => {
      try {
        const snap = await getDocs(
          query(
            collection(db, "companies", companyId, "expenses"),
            orderBy("createdAt", "desc"),
            limit(500)
          )
        );
        if (cancelled) return;

        let pendingCount = 0;
        let pendingAmount = 0;
        let paidInPeriodAmount = 0;
        let submittedInPeriodAmount = 0;

        snap.forEach((d) => {
          const x = d.data() as {
            amount?: number;
            status?: string;
            createdAt?: unknown;
            paidAt?: unknown;
          };
          const amt = Number(x.amount) || 0;
          const st = String(x.status ?? "");
          const createdMs = toMillis(x.createdAt);
          const paidMs = toMillis(x.paidAt);

          if (EXPENSE_PENDING_SET.has(st)) {
            pendingCount += 1;
            pendingAmount += amt;
          }
          if (createdMs != null && createdMs >= fromMs && createdMs <= toMs) {
            submittedInPeriodAmount += amt;
          }
          if (st === "paid" && paidMs != null && paidMs >= fromMs && paidMs <= toMs) {
            paidInPeriodAmount += amt;
          }
        });

        setExpenseDash({
          pendingCount,
          pendingAmount,
          paidInPeriodAmount,
          submittedInPeriodAmount,
          loading: false,
        });
      } catch (e) {
        console.error("CompanyFinances expenses load:", e);
        if (!cancelled) {
          setExpenseDash({
            pendingCount: 0,
            pendingAmount: 0,
            paidInPeriodAmount: 0,
            submittedInPeriodAmount: 0,
            loading: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, globalPeriod.startDate, globalPeriod.endDate]);

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
  }, [derivedDailyStats, globalPeriod.endDate]);

  const periodLabelFr = useMemo(() => {
    try {
      const a = new Date(`${globalPeriod.startDate}T12:00:00`);
      const b = new Date(`${globalPeriod.endDate}T12:00:00`);
      return `${format(a, "d MMM yyyy", { locale: fr })} – ${format(b, "d MMM yyyy", { locale: fr })}`;
    } catch {
      return `${globalPeriod.startDate} – ${globalPeriod.endDate}`;
    }
  }, [globalPeriod.startDate, globalPeriod.endDate]);

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

      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/90 pb-3 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
        <span>
          Actualisation des positions (live) :{" "}
          {globalSnapshot.snapshot.lastUpdatedAt
            ? globalSnapshot.snapshot.lastUpdatedAt.toLocaleTimeString("fr-FR")
            : "—"}
        </span>
        <button
          type="button"
          onClick={() => void globalSnapshot.refresh()}
          className="rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
        >
          Rafraîchir
        </button>
      </div>

      <div className="space-y-10">
        {/* 1 — Trésorerie réelle (ledger uniquement) */}
        <section className="rounded-2xl border-2 border-emerald-300/80 bg-emerald-50/40 p-5 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/25">
          <BlockTitle
            icon={Landmark}
            title="Trésorerie réelle (ledger)"
            tooltip="Trésorerie réelle : argent disponible actuellement selon les comptes du grand livre. Sans stats journalières ni montants encore dans les sessions ouvertes."
            subtitle="Source : soldes agrégés des comptes liquidités (espèces caisse agences, digital mobile money, banque). À ne pas lire comme chiffre d'affaires."
          />
          {unifiedFinanceLoading && (
            <p className="text-sm text-slate-600 dark:text-slate-400">Chargement des soldes…</p>
          )}
          {!unifiedFinanceLoading && !unifiedFinance && (
            <p className="text-sm text-amber-800 dark:text-amber-200">Synthèse indisponible pour le moment.</p>
          )}
          {!unifiedFinanceLoading && unifiedFinance && (
            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <div className="rounded-lg border border-emerald-200/90 bg-white/70 p-3 dark:border-emerald-900/60 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Espèces en caisses agences
                  <InfoHint text="Argent réel en caisse au sens ledger (toutes agences). Hors ventes seulement déclarées dans une session non clôturée." />
                </div>
                <div className="mt-1 font-semibold text-emerald-950 dark:text-emerald-100">
                  {money(unifiedFinance.realMoney.cash)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200/90 bg-white/70 p-3 dark:border-emerald-900/60 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Digital mobile money
                  <InfoHint text="Soldes ledger des comptes digitaux mobile money entreprise. A ne pas lire comme caisse physique agence." />
                </div>
                <div className="mt-1 font-semibold text-emerald-950 dark:text-emerald-100">
                  {money(unifiedFinance.realMoney.mobileMoney)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-200/90 bg-white/70 p-3 dark:border-emerald-900/60 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Comptes bancaires
                  <InfoHint text="Soldes ledger des comptes banque." />
                </div>
                <div className="mt-1 font-semibold text-emerald-950 dark:text-emerald-100">
                  {money(unifiedFinance.realMoney.bank)}
                </div>
              </div>
              <div className="rounded-lg border-2 border-emerald-400/70 bg-emerald-100/50 p-3 dark:border-emerald-700 dark:bg-emerald-900/40">
                <div className="flex items-center gap-1 text-xs font-medium text-emerald-900 dark:text-emerald-100">
                  Liquidité totale
                  <InfoHint text="Somme espèces caisses + digital mobile money + banque selon le ledger." />
                </div>
                <div className="mt-1 text-lg font-bold text-emerald-950 dark:text-emerald-50">
                  {money(unifiedFinance.realMoney.total)}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* 2 — Chiffre d'affaires / activité (pas la trésorerie) */}
        <section className="rounded-2xl border-2 border-sky-300/80 bg-sky-50/40 p-5 shadow-sm dark:border-sky-800 dark:bg-sky-950/25">
          <BlockTitle
            icon={DollarSign}
            title="Chiffre d'affaires (activité)"
            tooltip="Chiffre d'affaires : total des ventes et mouvements d'activité sur la période. Ce n'est pas l'équivalent de l'argent disponible dans les caisses."
            subtitle={`Période : ${periodLabelFr}. Ventes = activité commerciale ; encaissements et répartition par canal = transactions confirmées sur cette période.`}
          />
          {unifiedFinanceLoading && (
            <p className="text-sm text-slate-600 dark:text-slate-400">Chargement de l'activité…</p>
          )}
          {!unifiedFinanceLoading && unifiedFinance && (
            <div className="grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
              <div className="rounded-lg border border-sky-200/90 bg-white/70 p-3 dark:border-sky-900/60 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Ventes période (réservations)
                  <InfoHint text="Montant des réservations payées comptées sur la période sélectionnée (activité)." />
                </div>
                <div className="mt-1 font-semibold text-sky-950 dark:text-sky-100">
                  {unifiedFinance.activity.sales.reservationCount} ventes · {money(unifiedFinance.activity.sales.amountHint)}
                </div>
              </div>
              <div className="rounded-lg border border-sky-200/90 bg-white/70 p-3 dark:border-sky-900/60 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Encaissements canal guichet
                  <InfoHint text="Encaissements classés guichet sur la période : espèces et mobile money saisis au guichet. Toujours distincts du solde caisse instantané." />
                </div>
                <div className="mt-1 font-semibold text-sky-950 dark:text-sky-100">
                  {money(unifiedFinance.activity.split.paiementsGuichet)}
                </div>
              </div>
              <div className="rounded-lg border border-sky-200/90 bg-white/70 p-3 dark:border-sky-900/60 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Encaissements digitaux
                  <InfoHint text="Encaissements classés online sur la période : mobile money et autres paiements digitaux validés. Hors caisse physique agence." />
                </div>
                <div className="mt-1 font-semibold text-sky-950 dark:text-sky-100">
                  {money(unifiedFinance.activity.split.paiementsEnLigne)}
                </div>
              </div>
              <div className="rounded-lg border border-sky-200/90 bg-white/70 p-3 dark:border-sky-900/60 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                  Encaissements totaux (période)
                  <InfoHint text="Somme des paiements reçus confirmés sur la période, toutes méthodes." />
                </div>
                <div className="mt-1 font-semibold text-sky-950 dark:text-sky-100">
                  {money(unifiedFinance.activity.encaissements.total)}
                </div>
              </div>
            </div>
          )}
          {!unifiedFinanceLoading && unifiedFinance && (
            <div className="mt-3 rounded-lg border border-sky-200/80 bg-white/50 p-3 text-sm dark:border-sky-900/50 dark:bg-slate-900/40">
              <span className="text-slate-600 dark:text-slate-400">Résultat net sur transactions (période) : </span>
              <span className="font-semibold text-sky-950 dark:text-sky-100">{money(unifiedFinance.activity.caNet)}</span>
              <InfoHint text="Paiements reçus moins remboursements confirmés sur la période — indicateur d'activité, pas trésorerie instantanée." />
            </div>
          )}

          <div className="mt-8 rounded-xl border-2 border-indigo-200/90 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/30">
            <h3 className="mb-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-indigo-950 dark:text-indigo-100">
              Tendance depuis les stats journalières
              <InfoHint text="Chiffres issus des agrégats journaliers chargés (30 derniers jours environ). Utile pour la tendance ; ce n'est ni le ledger ni les ventes live des sessions." />
            </h3>
            <p className="mb-4 text-xs text-indigo-900/80 dark:text-indigo-200/90">
              Libellés volontairement distincts du bloc trésorerie : il s'agit d'activité historisée, pas d'argent disponible.
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <MetricCard
                label="CA jour (dailyStats)"
                value={money(revenueToday.total)}
                icon={DollarSign}
                valueColorVar="#4338ca"
                variation={calculateChange(revenueToday.total, revenueYesterday)}
                variationLabel="Veille (même source)"
              />
              <MetricCard
                label="CA 7 jours (dailyStats)"
                value={money(revenueWeek.total)}
                icon={DollarSign}
                valueColorVar="#7c3aed"
                variation={calculateChange(revenueWeek.total, revenuePrevWeek)}
                variationLabel="7 jours précédents"
              />
              <MetricCard
                label="CA 30 jours (dailyStats)"
                value={money(revenueMonth.total)}
                icon={DollarSign}
                valueColorVar="#0f766e"
                variation={calculateChange(revenueMonth.total, revenuePrevMonth)}
                variationLabel="30 jours précédents"
              />
            </div>
            <div className="mt-3 text-sm text-indigo-900/90 dark:text-indigo-200">
              Détail 30 j. : billets {money(revenueMonth.ticket)} · courrier {money(revenueMonth.courier)}
            </div>
            <div className="mt-4 overflow-auto max-h-[380px] rounded-xl border border-indigo-200/70 dark:border-indigo-900/60">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-indigo-200/80 bg-indigo-50/95 dark:border-indigo-800 dark:bg-indigo-950/90">
                  <tr>
                    <th className="px-3 py-2 text-left">Agence</th>
                    <th className="px-3 py-2 text-right">CA jour (stats)</th>
                    <th className="px-3 py-2 text-right">CA 7 j. (stats)</th>
                    <th className="px-3 py-2 text-right">CA 30 j. (stats)</th>
                  </tr>
                </thead>
                <tbody>
                  {byAgency.map((a) => (
                    <tr key={a.agencyId} className="border-b border-indigo-100/80 dark:border-indigo-900/40">
                      <td className="px-3 py-2 font-medium text-indigo-950 dark:text-indigo-100">{a.nom}</td>
                      <td className="px-3 py-2 text-right">{money(a.today)}</td>
                      <td className="px-3 py-2 text-right">{money(a.week)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{money(a.month)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* 3 — En attente / opérationnel */}
        <section className="rounded-2xl border-2 border-amber-300/80 bg-amber-50/35 p-5 shadow-sm dark:border-amber-800 dark:bg-amber-950/25">
          <BlockTitle
            icon={Clock}
            title="Montants en attente (non inclus dans la caisse)"
            tooltip="En attente : argent lié au guichet ou aux flux suivis en direct, pas encore reflété comme la même chose que la trésorerie ledger du bloc 1."
            subtitle="Sessions ouvertes, positions live et écarts de clôture : pilotage opérationnel."
          />

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-lg border-2 border-blue-300/80 bg-white/80 p-4 dark:border-blue-800 dark:bg-slate-900/50">
              <div className="flex items-center gap-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                En attente guichet
                <InfoHint text="Montant signalé comme en attente côté guichet — non confondre avec la liquidité ledger du haut de page." />
              </div>
              <div className="mt-1 text-xl font-bold text-blue-700 dark:text-blue-300">
                {moneyPositions.loading ? "—" : money(moneyPositions.snapshot.pendingGuichet)}
              </div>
            </div>
            {typeof moneyPositions.snapshot.paymentsConfirmedTotal === "number" && (
              <div className="rounded-lg border-2 border-violet-300/80 bg-white/80 p-4 dark:border-violet-900 dark:bg-slate-900/50">
                <div className="flex items-center gap-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                  Paiements suivis (période)
                  <InfoHint text="Total des paiements confirmés dans le suivi des positions — indicateur de flux, pas le solde de trésorerie." />
                </div>
                <div className="mt-1 text-xl font-bold text-violet-700 dark:text-violet-300">
                  {moneyPositions.loading ? "—" : money(moneyPositions.snapshot.paymentsConfirmedTotal)}
                </div>
              </div>
            )}
            <div className="rounded-lg border-2 border-amber-300/80 bg-white/80 p-4 dark:border-amber-900 dark:bg-slate-900/50">
              <div className="flex items-center gap-1 text-sm font-medium text-slate-800 dark:text-slate-200">
                Sessions ouvertes
                <InfoHint text="Nombre de sessions de guichet non encore validées (comptage opérationnel)." />
              </div>
              <div className="mt-1 text-xl font-bold text-amber-800 dark:text-amber-200">{openSessionsTotal}</div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Billets vendus en live (jour de référence) : {liveTicketsTotal}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200/90 bg-white/60 p-4 dark:border-amber-900/50 dark:bg-slate-900/40">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Surveillance guichet vs stats du jour</h3>
              <InfoHint text="Compare les ventes des sessions encore ouvertes à l'agrégat dailyStats du jour de référence. Écart = suivi opérationnel, pas erreur de trésorerie ledger." />
            </div>

            {(criticalAlerts.length > 0 || warningAlerts.length > 0) && (
              <div className="mb-4 rounded-lg border border-amber-400 bg-amber-100/50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950/40">
                <div className="inline-flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-200">
                  <Siren className="h-4 w-4" />
                  Alertes d'écart
                </div>
                <div className="mt-1 text-amber-900/90 dark:text-amber-100">
                  {criticalAlerts.length} critique(s) (≥ {money(CRITICAL_GAP_THRESHOLD)}) · {warningAlerts.length}{" "}
                  avertissement(s) (≥ {money(WARNING_GAP_THRESHOLD)})
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  <span>Ventes sessions ouvertes</span>
                  <InfoHint text="Montant des ventes comptées dans les sessions non validées pour le jour de référence." />
                </div>
                <div className="mt-1 text-xl font-bold text-primary">{money(liveSalesTotal)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/60">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">
                  <span>CA jour (dailyStats)</span>
                  <InfoHint text="Agrégat journalier pour le jour de référence — autre source que les sessions ouvertes." />
                </div>
                <div className="mt-1 text-xl font-bold text-primary">{money(revenueToday.total)}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/60">
                <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">Écart (live − stats jour)</div>
                <div
                  className={`mt-1 text-xl font-bold ${globalGap === 0 ? "text-primary" : globalGap > 0 ? "text-amber-600" : "text-emerald-600"}`}
                >
                  {globalGap > 0 ? "+" : ""}
                  {money(globalGap)}
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-600 dark:bg-slate-800/60">
                <div className="text-xs uppercase tracking-wide text-slate-600 dark:text-slate-400">Sessions / billets (live)</div>
                <div className="mt-1 text-xl font-bold text-primary">
                  {openSessionsTotal} / {liveTicketsTotal}
                </div>
              </div>
            </div>

            <div className="mt-4 overflow-auto max-h-[420px] rounded-xl border border-slate-200 dark:border-slate-600">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
                  <tr>
                    <th className="px-3 py-2 text-left">Agence</th>
                    <th className="px-3 py-2 text-right">Ventes sessions ouvertes</th>
                    <th className="px-3 py-2 text-right">CA jour (stats)</th>
                    <th className="px-3 py-2 text-right">Écart</th>
                    <th className="px-3 py-2 text-right">Sessions</th>
                    <th className="px-3 py-2 text-right">Billets</th>
                  </tr>
                </thead>
                <tbody>
                  {surveillanceRows.map((row) => {
                    const absGap = Math.abs(row.gap);
                    const rowClass =
                      absGap >= CRITICAL_GAP_THRESHOLD
                        ? "bg-red-50/70 dark:bg-red-900/25"
                        : absGap >= WARNING_GAP_THRESHOLD
                          ? "bg-amber-50/70 dark:bg-amber-900/25"
                          : "";
                    return (
                      <tr key={row.agencyId} className={`border-b border-slate-100 dark:border-slate-700 ${rowClass}`}>
                        <td className="px-3 py-2 font-medium text-primary">{row.name}</td>
                        <td className="px-3 py-2 text-right">{money(row.liveAmount)}</td>
                        <td className="px-3 py-2 text-right">{money(row.consolidated)}</td>
                        <td
                          className={`px-3 py-2 text-right font-semibold ${row.gap === 0 ? "text-primary" : row.gap > 0 ? "text-amber-600" : "text-emerald-600"}`}
                        >
                          {row.gap > 0 ? "+" : ""}
                          {money(row.gap)}
                        </td>
                        <td className="px-3 py-2 text-right">{row.openSessions}</td>
                        <td className="px-3 py-2 text-right">{row.liveTickets}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-slate-600 dark:text-slate-400">
              Dernière mise à jour live : {liveUpdatedAt ? liveUpdatedAt.toLocaleTimeString("fr-FR") : "—"} · Devise affichée : {currency}
            </p>
          </div>

          <div className="mt-8 border-t border-amber-200/90 pt-6 dark:border-amber-900/50">
            <h3 className="mb-3 flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900 dark:text-slate-100">
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-700 dark:text-amber-400" />
              Écarts constatés à la clôture de session
              <InfoHint text="Shifts validés avec écart entre montant constaté et attendu. Contrôle opérationnel, distinct du solde ledger." />
            </h3>
            <div className="mb-3 flex flex-wrap gap-2">
              <select
                className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-900"
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
              >
                <option value="">Toutes les agences</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.nom}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={exportCsv}
                className="inline-flex items-center gap-1 rounded bg-slate-100 px-3 py-1.5 text-sm hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
              >
                <Download className="h-4 w-4" /> Exporter CSV
              </button>
            </div>
            {filteredDiscrepancies.length === 0 ? (
              <p className="text-sm text-slate-600 dark:text-slate-400">Aucun écart enregistré sur la fenêtre chargée.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-600">
                      <th className="py-2 text-left">Agence</th>
                      <th className="py-2 text-left">Session</th>
                      <th className="py-2 text-right">Écart constaté</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDiscrepancies.map((d, i) => (
                      <tr key={i} className="border-b border-slate-100 dark:border-slate-700">
                        <td className="py-2">{getAgencyDisplayName(d.agencyId ?? "")}</td>
                        <td className="py-2">{d.shiftId ?? "—"}</td>
                        <td className="py-2 text-right font-medium">
                          {(d.validationAudit?.computedDifference ?? 0) >= 0 ? "+" : ""}
                          {money(d.validationAudit?.computedDifference ?? 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* 4 — Dépenses */}
        <section className="rounded-2xl border-2 border-rose-300/80 bg-rose-50/35 p-5 shadow-sm dark:border-rose-900 dark:bg-rose-950/25">
          <BlockTitle
            icon={CreditCard}
            title="Dépenses"
            tooltip="Dépenses : demandes et règlements suivis en comptabilité. Une dépense saisie ou en attente n'est pas la même chose que l'argent disponible au ledger."
            subtitle="Lecture directe des fiches dépense (500 plus récentes). Les montants de période peuvent être incomplets si l'historique est plus long."
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-rose-200/90 bg-white/80 p-4 dark:border-rose-900/60 dark:bg-slate-900/50">
              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                Dépenses saisies sur la période
                <InfoHint text="Somme des montants des dépenses créées entre les dates de la période globale (échantillon 500 dernières fiches)." />
              </div>
              <div className="mt-1 text-xl font-bold text-rose-900 dark:text-rose-100">
                {expenseDash.loading ? "—" : money(expenseDash.submittedInPeriodAmount)}
              </div>
            </div>
            <div className="rounded-lg border border-rose-200/90 bg-white/80 p-4 dark:border-rose-900/60 dark:bg-slate-900/50">
              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                En attente de paiement
                <InfoHint text="Dépenses dont le statut est encore en circuit de validation ou de paiement (toutes dates, sur l'échantillon chargé)." />
              </div>
              <div className="mt-1 text-xl font-bold text-rose-900 dark:text-rose-100">
                {expenseDash.loading ? "—" : money(expenseDash.pendingAmount)}
              </div>
              <p className="mt-1 text-xs text-slate-500">{expenseDash.pendingCount} fiche(s)</p>
            </div>
            <div className="rounded-lg border border-rose-200/90 bg-white/80 p-4 dark:border-rose-900/60 dark:bg-slate-900/50">
              <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                Payées sur la période
                <InfoHint text="Dépenses marquées payées dont la date de paiement tombe dans la période sélectionnée (échantillon chargé)." />
              </div>
              <div className="mt-1 text-xl font-bold text-rose-900 dark:text-rose-100">
                {expenseDash.loading ? "—" : money(expenseDash.paidInPeriodAmount)}
              </div>
            </div>
          </div>
        </section>
      </div>

      <p className="text-xs text-gray-500">
        Accès : CEO (admin_compagnie) et comptable compagnie (company_accountant). Aucune validation ni modification des sessions depuis cette page.
      </p>
    </>
  );
}
