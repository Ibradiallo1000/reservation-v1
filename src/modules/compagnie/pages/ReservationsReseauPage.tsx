/**
 * Réservations réseau (audit CEO) : fusion Performance Réseau + Opérations Réseau.
 * Affiche : réservations réseau, CA par agence, billets vendus, tableau agences, synthèse opérationnelle.
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
import { TrendingUp, Building2, Ticket, Calendar, Users, Truck, ClipboardList, ChevronRight } from "lucide-react";
import { Skeleton } from "@/shared/ui/skeleton";
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard } from "@/ui";
import { TimeFilterBar, RangeKey } from "@/modules/compagnie/admin/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { NetworkHealthSummary } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkHealthSummary";
import { CriticalAlertsPanel, type CriticalAlert } from "@/modules/compagnie/admin/components/CompanyDashboard/CriticalAlertsPanel";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageOfflineState } from "@/shared/ui/PageStates";
import {
  getReservationsInRange,
  buildChartDataFromReservations,
  isSoldReservation,
  isCancelledReservation,
  getNetworkCapacityOnly,
  getNetworkStats,
} from "@/modules/compagnie/networkStats/networkStatsService";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { getPreviousPeriod, calculateChange, type PeriodKind } from "@/shared/date/periodComparisonUtils";
import { getDoc } from "firebase/firestore";
import { Percent } from "lucide-react";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

const DEFAULT_RANGE: RangeKey = "day";

function getDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}

export default function ReservationsReseauPage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();
  const navigate = useNavigate();
  const isOnline = useOnlineStatus();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const money = useFormatCurrency();

  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = endOfToday;
    if (range === "day") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    }
    const label = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(start);
    return { dateFrom: start, dateTo: end, periodLabel: label };
  }, [range, customStart, customEnd, now]);

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

  const startStr = getDateKey(dateFrom);
  const endStr = getDateKey(dateTo);
  const periodStart = getStartOfDayInBamako(startStr);
  const periodEnd = getEndOfDayInBamako(endStr);

  // 1) Une seule requête Firestore pour les réservations de la période
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
        if (typeof console !== "undefined" && console.log) {
          console.log("reservationsInRange (single source)", list.length, list);
        }
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

  // Capacité réseau (taux de remplissage) — pas de requête réservations
  useEffect(() => {
    if (!companyId) return;
    getNetworkCapacityOnly(companyId, startStr, endStr).then(setCapacity).catch(() => setCapacity(null));
  }, [companyId, startStr, endStr]);

  // Période précédente (comparaison)
  useEffect(() => {
    if (!companyId) return;
    const periodForCompare: PeriodKind = range === "day" ? "day" : range === "custom" ? "custom" : "month";
    const { previousStart, previousEnd, comparisonLabel } = getPreviousPeriod(dateFrom, dateTo, periodForCompare);
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
  }, [companyId, range, dateFrom, dateTo]);

  // ——— Tout dérivé de reservationsInRange (aucune autre requête) ———
  const paidReservations = useMemo(
    () =>
      reservationsInRange.filter(
        (r) => isSoldReservation(r.statut)
      ),
    [reservationsInRange]
  );

  const billetsVendus = useMemo(
    () => paidReservations.reduce((sum, r) => sum + r.seatsGo, 0),
    [paidReservations]
  );
  const caTotal = useMemo(() => paidReservations.reduce((sum, r) => sum + r.montant, 0), [paidReservations]);
  const activeAgenciesCount = useMemo(
    () => new Set(paidReservations.map((r) => r.agencyId).filter(Boolean)).size,
    [paidReservations]
  );

  const todayBamako = getTodayBamako();
  const reservationsTodayCount = useMemo(() => {
    return reservationsInRange.filter((r) => {
      const dateKeyBamako = dayjs(r.createdAt).tz("Africa/Bamako").format("YYYY-MM-DD");
      return dateKeyBamako === todayBamako && isSoldReservation(r.statut);
    }).length;
  }, [reservationsInRange, todayBamako]);

  const perAgency = useMemo(() => {
    const map = new Map<string, { id: string; nom: string; revenus: number; billets: number }>();
    agencies.forEach((a) => map.set(a.id, { id: a.id, nom: a.nom, revenus: 0, billets: 0 }));
    paidReservations.forEach((r) => {
      const curr = map.get(r.agencyId);
      if (curr) {
        curr.revenus += r.montant;
        curr.billets += r.seatsGo;
      } else {
        map.set(r.agencyId, { id: r.agencyId, nom: r.agencyId, revenus: r.montant, billets: r.seatsGo });
      }
    });
    return Array.from(map.values());
  }, [agencies, paidReservations]);

  const chartData = useMemo(
    () => buildChartDataFromReservations(reservationsInRange, startStr, endStr),
    [reservationsInRange, startStr, endStr]
  );

  const rankingByCa = useMemo(
    () => [...perAgency].sort((a, b) => b.revenus - a.revenus),
    [perAgency]
  );

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
  const tauxRemplissagePct =
    capaciteReseau > 0 ? Math.round((billetsVendus / capaciteReseau) * 100) : null;
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
    <StandardLayoutWrapper>
      <PageHeader
        title="Réservations réseau"
        breadcrumb={breadcrumb}
        subtitle={`CA, billets vendus et tableau agences — Période : ${periodLabel}`}
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
        <PageOfflineState message="Connexion instable: certains blocs peuvent être retardés." />
      )}

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <MetricCard label="Billets vendus" value={String(billetsVendus)} icon={Ticket} />
              <MetricCard label="Capacité réseau" value={String(capaciteReseau)} icon={TrendingUp} />
              <MetricCard
                label="Remplissage"
                value={tauxRemplissagePct != null ? `${tauxRemplissagePct} %` : "—"}
                icon={Percent}
                valueColorVar={tauxRemplissagePct != null && tauxRemplissagePct >= 50 ? "var(--teliya-primary)" : undefined}
              />
            </div>
            {/* Indicateur réseau global pour le CEO */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-600">
              <span className="text-sm font-medium text-gray-700 dark:text-slate-300">État du réseau : </span>
              {tauxRemplissagePct == null ? (
                <span className="text-gray-500 dark:text-slate-400">—</span>
              ) : tauxRemplissagePct < 20 ? (
                <span className="inline-flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                  <span aria-hidden>🔴</span> Réseau en alerte
                </span>
              ) : tauxRemplissagePct < 40 ? (
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

      {/* KPIs période — dérivés de reservationsInRange (une seule source) */}
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
              label="CA"
              value={money(caTotal)}
              icon={TrendingUp}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
              variation={prevStats ? calculateChange(caTotal, prevStats.totalRevenue) : undefined}
              variationLabel={prevStats?.comparisonLabel}
            />
          </Link>
          <Link to={`${basePath}/reservations-reseau/reservations`} className="block">
            <MetricCard
              label="Billets vendus"
              value={String(billetsVendus)}
              icon={Ticket}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
              variation={prevStats ? calculateChange(billetsVendus, prevStats.totalTickets) : undefined}
              variationLabel={prevStats?.comparisonLabel}
            />
          </Link>
          <Link to={`${basePath}/parametres`} className="block">
            <MetricCard
              label="Agences actives"
              value={`${activeAgenciesCount} / ${agencies.length || "—"}`}
              icon={Building2}
              valueColorVar={company?.couleurPrimaire ?? "var(--teliya-primary)"}
              variation={prevStats ? calculateChange(activeAgenciesCount, prevStats.activeAgencies) : undefined}
              variationLabel={prevStats?.comparisonLabel}
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Tableau agences (CA période)</CardTitle>
        </CardHeader>
        <CardContent>
          {reservationsLoading ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Chargement…</p>
          ) : rankingByCa.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-slate-400">Aucune donnée pour la période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-slate-600">
                    <th className="text-left py-2 text-gray-900 dark:text-white">Rang</th>
                    <th className="text-left py-2 text-gray-900 dark:text-white">Agence</th>
                    <th className="text-left py-2 text-gray-900 dark:text-white">Statut</th>
                    <th className="text-right py-2 text-gray-900 dark:text-white">Billets</th>
                    <th className="text-right py-2 text-gray-900 dark:text-white">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingByCa.map((a, i) => {
                    const isActive = a.revenus > 0;
                    return (
                      <tr key={a.id} className="border-b border-gray-100 dark:border-slate-700">
                        <td className="py-2 font-medium text-gray-900 dark:text-slate-200">{i + 1}</td>
                        <td className="py-2 text-gray-900 dark:text-slate-200">{a.nom || "Agence inconnue"}</td>
                        <td className="py-2">
                          {isActive ? (
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">🟢 active</span>
                          ) : (
                            <span className="font-medium text-amber-600 dark:text-amber-400">🟠 inactive</span>
                          )}
                        </td>
                        <td className="py-2 text-right text-gray-900 dark:text-slate-200">{a.billets}</td>
                        <td className="py-2 text-right text-gray-900 dark:text-slate-200">{money(a.revenus)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

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

      <SectionCard title="Actions rapides" icon={ClipboardList}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => navigate(`${basePath}/reservations-reseau/reservations`)}
            className="flex items-center justify-between p-5 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                <ClipboardList className="w-6 h-6 text-gray-600 dark:text-slate-400" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">Voir les réservations</div>
                <div className="text-sm text-gray-500 dark:text-slate-400">Gérer toutes les réservations</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`${basePath}/flotte?tab=exploitation`)}
            className="flex items-center justify-between p-5 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                <Truck className="w-6 h-6 text-gray-600 dark:text-slate-400" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">Voir les trajets du jour</div>
                <div className="text-sm text-gray-500 dark:text-slate-400">Bus et affectations</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300" />
          </button>
          <button
            type="button"
            onClick={() => navigate(`${basePath}/payment-approvals`)}
            className="flex items-center justify-between p-5 rounded-lg border border-gray-200 dark:border-slate-600 hover:border-gray-300 dark:hover:border-slate-500 hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition text-left group"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center">
                <Ticket className="w-6 h-6 text-gray-600 dark:text-slate-400" />
              </div>
              <div>
                <div className="font-semibold text-gray-900 dark:text-white">Voir les preuves de paiement</div>
                <div className="text-sm text-gray-500 dark:text-slate-400">Approbations en attente</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400 dark:text-slate-500 group-hover:text-gray-600 dark:group-hover:text-slate-300" />
          </button>
        </div>
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
