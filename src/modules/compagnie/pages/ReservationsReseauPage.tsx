/**
 * Réservations réseau (audit CEO) : fusion Performance Réseau + Opérations Réseau.
 * Affiche : réservations réseau, CA, remplissage et synthèse opérationnelle (source unique : getReservationsInRange).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Link } from "react-router-dom";
import { TrendingUp, Building2, Ticket, Calendar, Users, Truck } from "lucide-react";
import { Skeleton } from "@/shared/ui/skeleton";
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard } from "@/ui";
import { TimeFilterBar, RangeKey } from "@/modules/compagnie/admin/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { NetworkHealthSummary } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkHealthSummary";
import { CriticalAlertsPanel, type CriticalAlert } from "@/modules/compagnie/admin/components/CompanyDashboard/CriticalAlertsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useGlobalDataSnapshot } from "@/contexts/GlobalDataSnapshotContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageOfflineState } from "@/shared/ui/PageStates";
import {
  getReservationsInRange,
  buildChartDataFromReservations,
  isPaidReservation,
  getNetworkCapacityOnly,
} from "@/modules/compagnie/networkStats/networkStatsService";
import { getNetworkOperationalStats } from "@/modules/compagnie/networkStats/networkOperationalService";
import {
  getNetworkSales,
  type FinancialPeriod,
} from "@/modules/finance/services/financialConsistencyService";
import { getTodayBamako, getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { getPreviousPeriod, calculateChange, type PeriodKind } from "@/shared/date/periodComparisonUtils";
import { getDoc } from "firebase/firestore";
import { Percent } from "lucide-react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import CompagnieReservationsPage from "./CompagnieReservationsPage";

dayjs.extend(utc);
dayjs.extend(timezone);

function getDateKey(d: Date): string {
  return dayjs(d).tz("Africa/Bamako").format("YYYY-MM-DD");
}

export default function ReservationsReseauPage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const userRoles: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [String(user.role)] : [];
  const isFinanceView = userRoles.some((r) => ["company_accountant", "financial_director"].includes(String(r)));
  const isCeoVisual = userRoles.some((r) => String(r) === "admin_compagnie");
  const money = useFormatCurrency();
  const globalPeriod = useGlobalPeriodContext();
  const globalSnapshot = useGlobalDataSnapshot();

  const range: RangeKey =
    globalPeriod.preset === "day"
      ? "day"
      : globalPeriod.preset === "month"
        ? "month"
        : "custom";
  const customStart = globalPeriod.preset === "custom" ? globalPeriod.startDate : null;
  const customEnd = globalPeriod.preset === "custom" ? globalPeriod.endDate : null;

  const setRange = React.useCallback(
    (v: RangeKey) => {
      if (v === "day") return globalPeriod.setPreset("day");
      if (v === "month") return globalPeriod.setPreset("month");
      if (v === "custom") return globalPeriod.setPreset("custom");

      // Map legacy dashboard ranges to a locked custom range (still global, URL-synced).
      const now = new Date();
      if (v === "prev_month") {
        const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endPrev = new Date(firstOfThisMonth.getTime() - 1);
        const startPrev = new Date(endPrev.getFullYear(), endPrev.getMonth(), 1);
        const start = `${startPrev.getFullYear()}-${String(startPrev.getMonth() + 1).padStart(2, "0")}-${String(
          startPrev.getDate()
        ).padStart(2, "0")}`;
        const end = `${endPrev.getFullYear()}-${String(endPrev.getMonth() + 1).padStart(2, "0")}-${String(
          endPrev.getDate()
        ).padStart(2, "0")}`;
        return globalPeriod.setCustomRange(start, end);
      }
      if (v === "ytd") {
        const start = `${now.getFullYear()}-01-01`;
        const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        return globalPeriod.setCustomRange(start, end);
      }
      if (v === "12m") {
        const endD = now;
        const startD = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        const start = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(
          startD.getDate()
        ).padStart(2, "0")}`;
        const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(
          endD.getDate()
        ).padStart(2, "0")}`;
        return globalPeriod.setCustomRange(start, end);
      }
    },
    [globalPeriod]
  );

  const setCustomStart = React.useCallback(
    (v: string | null) => {
      if (!v) return;
      globalPeriod.setCustomRange(v, globalPeriod.endDate);
    },
    [globalPeriod]
  );

  const setCustomEnd = React.useCallback(
    (v: string | null) => {
      if (!v) return;
      globalPeriod.setCustomRange(globalPeriod.startDate, v);
    },
    [globalPeriod]
  );

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    const start = new Date(`${globalPeriod.startDate}T00:00:00.000`);
    const end = new Date(`${globalPeriod.endDate}T23:59:59.999`);
    const label = `${globalPeriod.startDate} → ${globalPeriod.endDate}`;
    return { dateFrom: start, dateTo: end, periodLabel: label };
  }, [globalPeriod.startDate, globalPeriod.endDate]);

  // ——— Une seule source de vérité : réservations chargées UNE FOIS ———
  const [reservationsInRange, setReservationsInRange] = useState<Awaited<ReturnType<typeof getReservationsInRange>>>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [company, setCompany] = useState<{ id: string; nom?: string; couleurPrimaire?: string; [k: string]: unknown } | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState<number | null>(null);
  const [prevStats, setPrevStats] = useState<{
    totalRevenue: number;
    totalTickets: number;
    activeAgencies: number;
    comparisonLabel: string;
  } | null>(null);
  const startStr = globalPeriod.startDate;
  const endStr = globalPeriod.endDate;
  const periodStart = getStartOfDayInBamako(startStr);
  const periodEnd = getEndOfDayInBamako(endStr);

  // Chargement réservations période (graphique, KPI, cartes embedded, remplissage).
  useEffect(() => {
    if (!companyId) {
      setReservationsInRange([]);
      setReservationsLoading(false);
      return;
    }
    setReservationsLoading(true);
    getReservationsInRange(companyId, periodStart, periodEnd)
      .then((list) => {
        setReservationsInRange(list);
      })
      .catch(() => setReservationsInRange([]))
      .finally(() => setReservationsLoading(false));
  }, [companyId, periodStart.getTime(), periodEnd.getTime()]);

  // Compagnie + liste agences (pour noms dans le tableau)
  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      getDoc(doc(db, "companies", companyId)),
      getDocs(collection(db, "companies", companyId, "agences")),
    ]).then(([companySnap, agencesSnap]) => {
      if (companySnap.exists()) setCompany({ id: companyId, ...companySnap.data() });
      setAgencies(
        agencesSnap.docs.map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string };
          return { id: d.id, nom: data.nom ?? data.nomAgence ?? d.id };
        })
      );
    }).catch(() => {});
  }, [companyId]);

  // Capacité réseau (remplissage = sièges réservés / capacité, dérivé avec reservationsInRange)
  useEffect(() => {
    if (!companyId) return;
    getNetworkCapacityOnly(companyId, startStr, endStr)
      .then((cap) => setCapacity(cap || null))
      .catch(() => setCapacity(null));
  }, [companyId, startStr, endStr]);

  // Période précédente (comparaison — ventes/billets couche unique, agences opérationnel)
  useEffect(() => {
    if (!companyId) return;
    const periodForCompare: PeriodKind = range === "day" ? "day" : range === "custom" ? "custom" : "month";
    const { previousStart, previousEnd, comparisonLabel } = getPreviousPeriod(dateFrom, dateTo, periodForCompare);
    const prevPeriod: FinancialPeriod = { dateFrom: previousStart, dateTo: previousEnd };
    Promise.all([
      getNetworkSales(companyId, prevPeriod),
      getNetworkOperationalStats(companyId, previousStart, previousEnd),
    ])
      .then(([sales, operational]) => {
        setPrevStats({
          totalRevenue: sales.total,
          totalTickets: sales.tickets,
          activeAgencies: operational.activeAgencies,
          comparisonLabel,
        });
      })
      .catch(() => setPrevStats(null));
  }, [companyId, range, dateFrom, dateTo]);

  // ——— Tout dérivé de reservationsInRange (aucune autre requête) ———
  const paidReservationsInRange = useMemo(
    () => reservationsInRange.filter((r) => isPaidReservation(r.statut)),
    [reservationsInRange]
  );

  const billetsVendus = useMemo(
    () => paidReservationsInRange.length,
    [paidReservationsInRange]
  );
  const caTotal = useMemo(
    () => paidReservationsInRange.reduce((sum, r) => sum + (Number(r.montant) || 0), 0),
    [paidReservationsInRange]
  );
  const activeAgenciesCount = useMemo(
    () => new Set(paidReservationsInRange.map((r) => r.agencyId).filter(Boolean)).size,
    [paidReservationsInRange]
  );

  const todayBamako = getTodayBamako();
  const reservationsTodayCount = useMemo(() => {
    return paidReservationsInRange.filter((r) => {
      const dateKeyBamako = dayjs(r.createdAt).tz("Africa/Bamako").format("YYYY-MM-DD");
      return dateKeyBamako === todayBamako;
    }).length;
  }, [paidReservationsInRange, todayBamako]);

  const perAgency = useMemo(() => {
    const map = new Map<string, { id: string; nom: string; revenus: number; billets: number }>();
    agencies.forEach((a) => map.set(a.id, { id: a.id, nom: a.nom, revenus: 0, billets: 0 }));
    paidReservationsInRange.forEach((r) => {
      const curr = map.get(r.agencyId);
      if (curr) {
        curr.revenus += r.montant;
        curr.billets += 1;
      } else {
        map.set(r.agencyId, { id: r.agencyId, nom: r.agencyId, revenus: r.montant, billets: 1 });
      }
    });
    return Array.from(map.values());
  }, [agencies, paidReservationsInRange]);

  const chartData = useMemo(
    () => buildChartDataFromReservations(paidReservationsInRange, startStr, endStr),
    [paidReservationsInRange, startStr, endStr]
  );

  /** Places réservées (sièges) — même liste que les KPI, pour remplissage = sièges / capacité. */
  const seatsReservedInPeriod = useMemo(
    () => paidReservationsInRange.reduce((s, r) => s + (Number(r.seatsGo) || 1), 0),
    [paidReservationsInRange]
  );
  const fillRatePctFromReservations = useMemo(() => {
    const cap = capacity ?? 0;
    if (cap <= 0) return null;
    return Math.round((seatsReservedInPeriod / cap) * 100);
  }, [capacity, seatsReservedInPeriod]);

  const REVENUE_DROP_RISK_THRESHOLD = 15;
  const healthyAgencies = useMemo(
    () => perAgency.filter((a) => a.revenus > 0).length,
    [perAgency]
  );
  const atRiskAgencies = useMemo(
    () => perAgency.filter((a) => a.revenus === 0).length,
    [perAgency]
  );
  const trend = "stable" as const;
  const criticalAlerts: CriticalAlert[] = [];

  // Sessions ouvertes (shifts actifs) — non inclus dans networkStats
  useEffect(() => {
    if (!companyId) return;
    (async () => {
      try {
        const agencesSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        let openSessionsCount = 0;
        for (const doc of agencesSnap.docs) {
          const agencyId = doc.id;
          const shiftsRef = collection(db, "companies", companyId, "agences", agencyId, "shifts");
          const qShifts = query(shiftsRef, where("status", "in", ["active", "paused"]), limit(20));
          const shiftsSnap = await getDocs(qShifts);
          openSessionsCount += shiftsSnap.size;
        }
        setSessionsOpen(openSessionsCount);
      } catch {
        setSessionsOpen(null);
      }
    })();
  }, [companyId]);

  const capaciteReseau = capacity ?? 0;
  const statsLoading = reservationsLoading;

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Réservations réseau" />
        <p className="text-sm text-muted-foreground">Identifiant de compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  const basePath = `/compagnie/${companyId}`;

  const breadcrumb = [
    { label: "Poste de pilotage", path: `${basePath}/command-center` },
    { label: "Réservations réseau" },
  ];

  return (
    <StandardLayoutWrapper className={isFinanceView && !isCeoVisual ? "bg-gray-50 dark:bg-slate-900 rounded-xl p-4 border border-gray-200 dark:border-slate-700" : undefined}>
      <PageHeader
        title="Réservations réseau"
        breadcrumb={breadcrumb}
        subtitle={`Ventes, réservations et remplissage (sièges / capacité) — Période : ${periodLabel}`}
        primaryColorVar={isFinanceView && !isCeoVisual ? "" : undefined}
        titleClassName={isFinanceView && !isCeoVisual ? "text-gray-900 dark:text-white" : undefined}
        right={
          <div className="flex flex-wrap items-center gap-3">
            <TimeFilterBar
              range={range}
              setRange={setRange}
              customStart={customStart}
              setCustomStart={setCustomStart}
              customEnd={customEnd}
              setCustomEnd={setCustomEnd}
            />
            <div className="text-xs text-slate-500">
              {globalSnapshot.snapshot.mode === "realtime" ? "Mis à jour en temps réel" : "Mis à jour"}{" "}
              :{" "}
              {globalSnapshot.snapshot.lastUpdatedAt
                ? globalSnapshot.snapshot.lastUpdatedAt.toLocaleTimeString("fr-FR")
                : "—"}
              <button
                type="button"
                onClick={() => void globalSnapshot.refresh()}
                className="ml-2 rounded-md border border-slate-200 bg-white px-2 py-1 hover:bg-slate-50"
              >
                Rafraîchir
              </button>
            </div>
          </div>
        }
      />
      {!isOnline && (
        <PageOfflineState message="Connexion instable: certains blocs peuvent être retardés." />
      )}

      {!isFinanceView && (
        <>
          {/* Synthèse opérationnelle — réservations aujourd'hui dérivées de reservationsInRange */}
          <SectionCard title="Synthèse opérationnelle (aujourd'hui)" icon={Calendar} className="mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                label="Réservations aujourd'hui"
                value={reservationsLoading ? "—" : String(reservationsTodayCount)}
                icon={Calendar}
              />
              <MetricCard label="Sessions ouvertes" value={reservationsLoading ? "—" : (sessionsOpen ?? "—")} icon={Users} />
              <MetricCard label="Véhicules disponibles" value="—" icon={Truck} />
              <MetricCard label="Flotte totale" value="—" icon={Truck} />
            </div>
          </SectionCard>

          {/* Taux de remplissage réseau + État du réseau (stratégique pour transporteurs) */}
          <SectionCard title="Taux de remplissage réseau" icon={Percent} className="mb-6">
            {statsLoading ? (
              <div className="flex flex-wrap items-center gap-4 text-gray-500">Chargement…</div>
            ) : (
              <>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-3">
                  Même source que les KPIs : réservations payées de la période. Remplissage = sièges réservés / capacité.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <MetricCard label="Réservations" value={String(billetsVendus)} icon={Ticket} />
                  <MetricCard label="Capacité réseau" value={String(capaciteReseau)} icon={TrendingUp} />
                  <MetricCard
                    label="Remplissage"
                    value={fillRatePctFromReservations != null ? `${fillRatePctFromReservations} %` : "—"}
                    icon={Percent}
                    valueColorVar={fillRatePctFromReservations != null && fillRatePctFromReservations >= 50 ? "var(--teliya-primary)" : undefined}
                  />
                </div>
                {/* Indicateur réseau global pour le CEO */}
                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-600">
                  <span className="text-sm font-medium text-gray-700 dark:text-slate-300">État du réseau : </span>
                  {fillRatePctFromReservations == null ? (
                    <span className="text-gray-500 dark:text-slate-400">—</span>
                  ) : fillRatePctFromReservations < 20 ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                      <span aria-hidden>🔴</span> Réseau en alerte
                    </span>
                  ) : fillRatePctFromReservations < 40 ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-400">
                      <span aria-hidden>🟠</span> Activité faible
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
                      <span aria-hidden>🟢</span> Réseau sain
                    </span>
                  )}
                </div>
              </>
            )}
          </SectionCard>
        </>
      )}

      {/* KPIs période — couche unique (aligné CEO / Finances) */}
      {statsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[110px] rounded-lg" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <Link to={`${basePath}/reservations-reseau/reservations`} className="block">
            <MetricCard
              label="Ventes"
              value={money(caTotal)}
              icon={TrendingUp}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
            />
          </Link>
          <Link to={`${basePath}/reservations-reseau/reservations`} className="block">
            <MetricCard
              label="Réservations"
              value={String(billetsVendus)}
              icon={Ticket}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
            />
          </Link>
          <Link to={`${basePath}/parametres`} className="block">
            <MetricCard
              label="Agences actives"
              value={`${activeAgenciesCount} / ${agencies.length || "—"}`}
              icon={Building2}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
            />
          </Link>
        </div>
      )}

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Évolution CA / réservations</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueReservationsChart
            data={
              chartData.length > 0
                ? chartData
                : startStr === endStr
                  ? Array.from({ length: 24 }, (_, h) => ({
                      date: `${startStr}T${String(h).padStart(2, "0")}`,
                      revenue: 0,
                      reservations: 0,
                    }))
                  : (() => {
                      const empty: { date: string; revenue: number; reservations: number }[] = [];
                      for (let t = dateFrom.getTime(); t <= dateTo.getTime(); t += 86400000) {
                        empty.push({ date: getDateKey(new Date(t)), revenue: 0, reservations: 0 });
                      }
                      return empty;
                    })()
            }
            loading={reservationsLoading}
            primaryColor={company?.couleurPrimaire as string | undefined}
            secondaryColor={company?.couleurSecondaire as string | undefined}
            range={range === "day" ? "day" : chartData.length <= 7 ? "week" : "month"}
          />
        </CardContent>
      </Card>

      {!isFinanceView && (
        <>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Santé du réseau</CardTitle>
            </CardHeader>
            <CardContent>
              <NetworkHealthSummary
                totalAgencies={agencies.length}
                healthyAgencies={healthyAgencies}
                atRiskAgencies={atRiskAgencies}
                trend={trend}
              />
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Alertes par agence</CardTitle>
            </CardHeader>
            <CardContent>
              <CriticalAlertsPanel alerts={criticalAlerts} loading={reservationsLoading} />
            </CardContent>
          </Card>
        </>
      )}

      <CompagnieReservationsPage embedded />
    </StandardLayoutWrapper>
  );
}
