/**
 * Activité réseau — une seule source : `activityLogs` (billets + colis), hors ledger / réservations / sessions / dailyStats.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { TrendingUp, Building2, Ticket, Package } from "lucide-react";
import { Skeleton } from "@/shared/ui/skeleton";
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard } from "@/ui";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { cn } from "@/lib/utils";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageOfflineState } from "@/shared/ui/PageStates";
import { queryActivityLogsInRange } from "@/modules/compagnie/activity/activityLogsService";
import { aggregateActivityLogDocs } from "@/modules/compagnie/networkStats/activityCore";
import {
  buildNetworkChartDataFromActivityLogDocs,
  type ChartDataPoint,
} from "@/modules/compagnie/networkStats/networkStatsService";
import {
  aggregateNetworkActivityByAgencyFromDocs,
  aggregateRouteActivityRowsFromDocs,
  type AgencyActivityRow,
  type RouteActivityRow,
} from "@/modules/compagnie/networkStats/networkActivityService";
import { getStartOfDayInBamako, getEndOfDayInBamako, getTodayBamako, TZ_BAMAKO } from "@/shared/date/dateUtilsTz";
import { formatActivityPeriodLabelFr } from "@/shared/date/formatActivityPeriodFr";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import InfoTooltip from "@/shared/ui/InfoTooltip";

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

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    const start = new Date(`${globalPeriod.startDate}T00:00:00.000`);
    const end = new Date(`${globalPeriod.endDate}T23:59:59.999`);
    const label = formatActivityPeriodLabelFr(
      globalPeriod.startDate,
      globalPeriod.endDate,
      getTodayBamako()
    );
    return { dateFrom: start, dateTo: end, periodLabel: label };
  }, [globalPeriod.startDate, globalPeriod.endDate]);

  const [logActivity, setLogActivity] = useState<Awaited<ReturnType<typeof aggregateActivityLogDocs>> | null>(null);
  const [chartSeries, setChartSeries] = useState<ChartDataPoint[]>([]);
  const [company, setCompany] = useState<{
    id: string;
    nom?: string;
    couleurPrimaire?: string;
    couleurSecondaire?: string;
  } | null>(null);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [agencyActivity, setAgencyActivity] = useState<AgencyActivityRow[]>([]);
  const [routeRows, setRouteRows] = useState<RouteActivityRow[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const lastActivityLogDocsRef = useRef<QueryDocumentSnapshot<DocumentData>[] | null>(null);
  const agenciesRef = useRef(agencies);
  agenciesRef.current = agencies;

  const startStr = globalPeriod.startDate;
  const endStr = globalPeriod.endDate;
  const periodStart = getStartOfDayInBamako(startStr);
  const periodEnd = getEndOfDayInBamako(endStr);

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      getDoc(doc(db, "companies", companyId)),
      getDocs(collection(db, "companies", companyId, "agences")),
    ])
      .then(([companySnap, agencesSnap]) => {
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
      })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      lastActivityLogDocsRef.current = null;
      setLogActivity(null);
      setChartSeries([]);
      setAgencyActivity([]);
      setRouteRows([]);
      setActivityLoading(false);
      return;
    }
    setActivityLoading(true);
    queryActivityLogsInRange(companyId, periodStart, periodEnd)
      .then((docs) => {
        lastActivityLogDocsRef.current = docs;
        setLogActivity(aggregateActivityLogDocs(docs));
        setChartSeries(buildNetworkChartDataFromActivityLogDocs(docs, startStr, endStr, TZ_BAMAKO));
        setAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(docs, agenciesRef.current));
        setRouteRows(aggregateRouteActivityRowsFromDocs(docs));
      })
      .catch(() => {
        lastActivityLogDocsRef.current = null;
        setLogActivity(null);
        setChartSeries([]);
        setAgencyActivity([]);
        setRouteRows([]);
      })
      .finally(() => setActivityLoading(false));
  }, [companyId, periodStart.getTime(), periodEnd.getTime(), startStr, endStr]);

  useEffect(() => {
    const docs = lastActivityLogDocsRef.current;
    if (!docs || !companyId) return;
    setAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(docs, agencies));
  }, [agencies, companyId]);

  const caTotal = logActivity?.totalAmount ?? 0;
  const billetsPlaces = logActivity?.billets.tickets ?? 0;
  const colisCount = logActivity?.courier.parcels ?? 0;

  const activeAgenciesCount = useMemo(
    () => agencyActivity.filter((a) => a.ventes > 0 || a.colis > 0).length,
    [agencyActivity]
  );

  const agencyRowsWithNames = useMemo(() => {
    const name = (id: string) => agencies.find((a) => a.id === id)?.nom ?? id;
    return agencyActivity.map((row) => ({
      ...row,
      name: name(row.agencyId),
    }));
  }, [agencyActivity, agencies]);

  if (!companyId) {
    return (
      <StandardLayoutWrapper maxWidthClass="w-full" className="px-4 bg-gray-50 dark:bg-gray-950">
        <PageHeader title="Activité réseau" />
        <p className="text-sm text-muted-foreground">Identifiant de compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  const basePath = `/compagnie/${companyId}`;
  const primaryAccent = company?.couleurPrimaire ?? "var(--teliya-primary)";
  const isSingleDayChart = startStr === endStr;

  const kpiCardClass = cn(
    "!shadow-sm hover:!shadow-md !transition-shadow !border-gray-200 dark:!border-gray-700",
    "border-l-[4px] bg-white dark:bg-gray-900",
    "[background-image:linear-gradient(105deg,color-mix(in_srgb,var(--teliya-primary)_7%,white)_0%,white_42%)]",
    "dark:[background-image:linear-gradient(105deg,color-mix(in_srgb,var(--teliya-primary)_12%,rgb(17_24_39))_0%,rgb(17_24_39)_45%)]"
  );
  const kpiIconWrap = cn(
    "!h-10 !w-10 !rounded-xl",
    "[color:var(--teliya-primary)] [background-color:color-mix(in_srgb,var(--teliya-primary)_12%,rgb(249_250_251))]",
    "dark:[background-color:color-mix(in_srgb,var(--teliya-primary)_18%,rgb(31_41_55))]"
  );
  const kpiValueClass = "!text-2xl !font-bold sm:!text-3xl";

  return (
    <StandardLayoutWrapper maxWidthClass="w-full" className="px-4 bg-gray-50 dark:bg-gray-950">
      <div className="space-y-4 pb-6">
        <PageHeader
          title="Activité réseau"
          breadcrumb={[
            { label: "Dashboard", path: `${basePath}/command-center` },
            { label: "Activité réseau" },
          ]}
          subtitle={
            <span className="text-gray-600 dark:text-gray-400">
              <span className="font-medium text-gray-900 dark:text-gray-100">{periodLabel}</span>
              <span className="mx-2 text-gray-300 dark:text-gray-600" aria-hidden>
                ·
              </span>
              Billets et colis (journal d&apos;activité)
            </span>
          }
          right={
            <NetworkActivityPeriodBar
              preset={globalPeriod.preset}
              startDate={globalPeriod.startDate}
              endDate={globalPeriod.endDate}
              setPreset={globalPeriod.setPreset}
              setCustomRange={globalPeriod.setCustomRange}
            />
          }
        />
        {!isOnline && (
          <PageOfflineState message="Connexion instable : les données peuvent être incomplètes." />
        )}

        <section className="w-full rounded-xl bg-white p-6 shadow-sm dark:bg-gray-900">
          {activityLoading ? (
            <Skeleton className="h-[118px] rounded-xl" />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Montant encaissé</p>
                <InfoTooltip label="Total issu du journal d'activité sur la période sélectionnée." />
              </div>
              <p className="text-4xl font-bold tabular-nums text-slate-900 dark:text-white">{money(caTotal)}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{periodLabel}</p>
              <div className="pt-2 text-sm text-slate-600 dark:text-slate-300">
                Agences actives: <span className="font-semibold">{activeAgenciesCount}</span> / {agencies.length || "—"}
              </div>
            </div>
          )}
        </section>

        <SectionCard
          title="Par agence"
          icon={Building2}
          className="overflow-x-hidden rounded-xl border-0 bg-white shadow-sm dark:bg-gray-900"
          description={null}
          help={<InfoTooltip label="Classement des agences par montant encaissé sur la période." />}
        >
          {activityLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Chargement…</p>
          ) : (
            <ul className="w-full space-y-2">
              {agencyRowsWithNames.map((a) => {
                const ventesFormatted = money(a.ventes);
                return (
                  <li
                    key={a.agencyId}
                    className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{a.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Transactions: {a.placesGuichet + a.placesOnline + a.colis}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-white" title={ventesFormatted}>
                      {ventesFormatted}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>

        <Card className="mb-0 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="px-5 pb-2 pt-5 md:px-6">
            <CardTitle className="text-lg">Détail par trajet</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5 md:px-6 md:pb-6">
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

        <Card className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900">
          <CardHeader className="px-5 pb-2 pt-5 md:px-6">
            <CardTitle className="text-lg">Évolution</CardTitle>
            <p className="text-sm font-normal text-slate-500 dark:text-slate-400">
              Même journal d’activité que les cartes : par heure sur un jour, par jour sur une plage.
            </p>
          </CardHeader>
          <CardContent className="px-5 pb-5 md:px-6 md:pb-6">
            <RevenueReservationsChart
              data={
                chartSeries.length > 0
                  ? chartSeries
                  : startStr === endStr
                    ? Array.from({ length: 24 }, (_, h) => ({
                        date: `${startStr}T${String(h).padStart(2, "0")}`,
                        revenue: 0,
                        reservations: 0,
                      }))
                    : (() => {
                        const empty: ChartDataPoint[] = [];
                        for (let t = dateFrom.getTime(); t <= dateTo.getTime(); t += 86400000) {
                          empty.push({ date: getDateKey(new Date(t)), revenue: 0, reservations: 0 });
                        }
                        return empty;
                      })()
              }
              loading={activityLoading}
              primaryColor={company?.couleurPrimaire as string | undefined}
              secondaryColor={company?.couleurSecondaire as string | undefined}
              range={isSingleDayChart ? "day" : chartSeries.length <= 7 ? "week" : "month"}
              secondaryMetricLabel="Places (billets)"
            />
          </CardContent>
        </Card>
      </div>
    </StandardLayoutWrapper>
  );
}
