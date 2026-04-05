/**
 * Activité réseau — billets + colis par agence et par trajet (hors grand livre).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { Link } from "react-router-dom";
import { TrendingUp, Building2, Ticket, Package, MapPin } from "lucide-react";
import { Skeleton } from "@/shared/ui/skeleton";
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard } from "@/ui";
import { TimeFilterBar, RangeKey } from "@/modules/compagnie/admin/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageOfflineState } from "@/shared/ui/PageStates";
import {
  getReservationsInRange,
  buildChartDataFromReservations,
  isPaidReservation,
  getNetworkCapacityOnly,
} from "@/modules/compagnie/networkStats/networkStatsService";
import {
  getNetworkActivityByAgency,
  getRouteActivityRows,
  type AgencyActivityRow,
  type RouteActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
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
  const isOnline = useOnlineStatus();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const globalPeriod = useGlobalPeriodContext();

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

  const [reservationsInRange, setReservationsInRange] = useState<Awaited<ReturnType<typeof getReservationsInRange>>>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [company, setCompany] = useState<{
    id: string;
    nom?: string;
    couleurPrimaire?: string;
    couleurSecondaire?: string;
  } | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [capacity, setCapacity] = useState<number | null>(null);
  const [agencyActivity, setAgencyActivity] = useState<AgencyActivityRow[]>([]);
  const [routeRows, setRouteRows] = useState<RouteActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const startStr = globalPeriod.startDate;
  const endStr = globalPeriod.endDate;
  const periodStart = getStartOfDayInBamako(startStr);
  const periodEnd = getEndOfDayInBamako(endStr);

  useEffect(() => {
    if (!companyId) {
      setReservationsInRange([]);
      setReservationsLoading(false);
      return;
    }
    setReservationsLoading(true);
    getReservationsInRange(companyId, periodStart, periodEnd)
      .then(setReservationsInRange)
      .catch(() => setReservationsInRange([]))
      .finally(() => setReservationsLoading(false));
  }, [companyId, periodStart.getTime(), periodEnd.getTime()]);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      getDoc(doc(db, "companies", companyId)),
      getDocs(collection(db, "companies", companyId, "agences")),
    ]).then(([companySnap, agencesSnap]) => {
      if (companySnap.exists()) {
        setCompany({
          id: companyId,
          ...companySnap.data(),
        } as {
          id: string;
          nom?: string;
          couleurPrimaire?: string;
          couleurSecondaire?: string;
        });
      }
      setAgencies(
        agencesSnap.docs.map((d) => {
          const data = d.data() as { nom?: string; nomAgence?: string };
          return { id: d.id, nom: data.nom ?? data.nomAgence ?? d.id };
        })
      );
    }).catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    getNetworkCapacityOnly(companyId, startStr, endStr)
      .then((cap) => setCapacity(cap || null))
      .catch(() => setCapacity(null));
  }, [companyId, startStr, endStr]);

  useEffect(() => {
    if (!companyId || agencies.length === 0) {
      setAgencyActivity([]);
      setRouteRows([]);
      setActivityLoading(false);
      return;
    }
    setActivityLoading(true);
    Promise.all([
      getNetworkActivityByAgency(companyId, periodStart, periodEnd, agencies),
      getRouteActivityRows(companyId, periodStart, periodEnd),
    ])
      .then(([byAg, routes]) => {
        setAgencyActivity(byAg);
        setRouteRows(routes);
      })
      .catch(() => {
        setAgencyActivity([]);
        setRouteRows([]);
      })
      .finally(() => setActivityLoading(false));
  }, [companyId, agencies, periodStart.getTime(), periodEnd.getTime()]);

  const paidReservationsInRange = useMemo(
    () => reservationsInRange.filter((r) => isPaidReservation(r.statut)),
    [reservationsInRange]
  );

  const caTotal = useMemo(
    () => paidReservationsInRange.reduce((sum, r) => sum + (Number(r.montant) || 0), 0),
    [paidReservationsInRange]
  );
  const billetsPlaces = useMemo(
    () => paidReservationsInRange.reduce((s, r) => s + (Number(r.seatsGo) || 1), 0),
    [paidReservationsInRange]
  );
  const activeAgenciesCount = useMemo(
    () => new Set(paidReservationsInRange.map((r) => r.agencyId).filter(Boolean)).size,
    [paidReservationsInRange]
  );

  const seatsReservedInPeriod = billetsPlaces;
  const fillRatePctFromReservations = useMemo(() => {
    const cap = capacity ?? 0;
    if (cap <= 0) return null;
    return Math.round((seatsReservedInPeriod / cap) * 100);
  }, [capacity, seatsReservedInPeriod]);

  const chartData = useMemo(
    () => buildChartDataFromReservations(paidReservationsInRange, startStr, endStr),
    [paidReservationsInRange, startStr, endStr]
  );

  const agencyRowsWithNames = useMemo(() => {
    const name = (id: string) => agencies.find((a) => a.id === id)?.nom ?? id;
    return agencyActivity.map((row) => ({
      ...row,
      name: name(row.agencyId),
      remplissage: fillRatePctFromReservations,
    }));
  }, [agencyActivity, agencies, fillRatePctFromReservations]);

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Activité réseau" />
        <p className="text-sm text-muted-foreground">Identifiant de compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  const basePath = `/compagnie/${companyId}`;
  const statsLoading = reservationsLoading || activityLoading;

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Activité réseau"
        breadcrumb={[
          { label: "Dashboard", path: `${basePath}/command-center` },
          { label: "Activité réseau" },
        ]}
        subtitle={`Billets, colis et remplissage — ${periodLabel}`}
        right={
          <TimeFilterBar
            range={range}
            setRange={setRange}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
          />
        }
      />
      {!isOnline && (
        <PageOfflineState message="Connexion instable : les données peuvent être incomplètes." />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statsLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[100px] rounded-lg" />)
        ) : (
          <>
            <Link to={`${basePath}/reservations-reseau/reservations`} className="block">
              <MetricCard
                label="Chiffre d'activité (billets)"
                value={money(caTotal)}
                icon={TrendingUp}
                valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
              />
            </Link>
            <MetricCard
              label="Places vendues"
              value={String(billetsPlaces)}
              icon={Ticket}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
            />
            <MetricCard
              label="Agences actives"
              value={`${activeAgenciesCount} / ${agencies.length || "—"}`}
              icon={Building2}
            />
            <MetricCard
              label="Remplissage réseau"
              value={fillRatePctFromReservations != null ? `${fillRatePctFromReservations} %` : "—"}
              icon={TrendingUp}
            />
          </>
        )}
      </div>

      <SectionCard title="Par agence" icon={Building2} className="mb-6">
        {activityLoading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {agencyRowsWithNames.map((a) => (
              <div
                key={a.agencyId}
                className="rounded-xl border border-slate-200 dark:border-slate-600 p-4 bg-white dark:bg-slate-900/40"
              >
                <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white mb-2">
                  <MapPin className="h-4 w-4 opacity-70" />
                  {a.name}
                </div>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-slate-500">Activité</dt>
                  <dd className="text-right font-medium">{money(a.ventes)}</dd>
                  <dt className="text-slate-500">Places</dt>
                  <dd className="text-right">{a.billets}</dd>
                  <dt className="text-slate-500">Colis</dt>
                  <dd className="text-right">{a.colis}</dd>
                  <dt className="text-slate-500">Remplissage</dt>
                  <dd className="text-right">
                    {a.remplissage != null ? `${a.remplissage} %` : "—"}
                  </dd>
                </dl>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Détail par trajet</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLoading ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : routeRows.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune donnée pour cette période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-600 text-left">
                    <th className="py-2 pr-3">Trajet</th>
                    <th className="py-2 pr-3 text-right">Billets (places)</th>
                    <th className="py-2 pr-3 text-right">Colis</th>
                    <th className="py-2 text-right">CA activité</th>
                  </tr>
                </thead>
                <tbody>
                  {routeRows.map((row) => (
                    <tr key={row.trajet} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-3 font-medium">{row.trajet}</td>
                      <td className="py-2 pr-3 text-right">{row.billets}</td>
                      <td className="py-2 pr-3 text-right">{row.colis}</td>
                      <td className="py-2 text-right">{money(row.caActivite)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Évolution</CardTitle>
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

      <CompagnieReservationsPage embedded />
    </StandardLayoutWrapper>
  );
}
