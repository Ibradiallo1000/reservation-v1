// src/pages/DashboardAgencePage.tsx

import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { collection, query, where, Timestamp, getDocs } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { shipmentsRef } from '@/modules/logistics/domain/firestorePaths';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { PageErrorState, PageOfflineState } from '@/shared/ui/PageStates';
import {
  RevenueChart,
  ChannelsChart,
  DestinationsChart,
  TopTrajetsCard,
  NextDepartureCard,
  ActivityMetricCard,
  ChannelDonutCard,
} from '@/modules/agence/dashboard/components';
import { CashSummaryCard } from '@/modules/compagnie/cash/CashSummaryCard';
import { routePermissions } from '@/constants/routePermissions';
import {
  StandardLayoutWrapper,
  PageHeader,
  SectionCard,
  MetricCard as UIMetricCard,
  ActionButton,
  typography,
} from '@/ui';
import { Ticket, DollarSign, Monitor, Store, FileDown, AlertTriangle, Package } from 'lucide-react';
import { useFormatCurrency } from '@/shared/currency/CurrencyContext';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { getAgencyStats } from '@/modules/compagnie/networkStats/networkStatsService';
import { getUnifiedAgencyFinance, type UnifiedAgencyFinance } from '@/modules/finance/services/unifiedFinanceService';
import {
  getDateKeyInTimezone,
  getEndOfDayForDate,
  getStartOfDayForDate,
  resolveAgencyTimezone,
} from '@/shared/date/dateUtilsTz';
import { AGENCY_KPI_TIME } from '@/modules/agence/shared/agencyKpiTimeContract';

dayjs.extend(utc);
dayjs.extend(timezone);

function rangeToAgencyKeys(startDate: Date, endDate: Date, ianaTimezone: string): { startKey: string; endKey: string } {
  return {
    startKey: getDateKeyInTimezone(startDate, ianaTimezone),
    endKey: getDateKeyInTimezone(endDate, ianaTimezone),
  };
}

/* ===================== Types ===================== */
type DailyStat = { date: string; reservations: number; revenue: number };
type ChannelStat = { name: string; value: number };
type TopRoute = { id: string; name: string; count: number; revenue: number };
type DashboardStats = {
  sales: number;
  totalRevenue: number;
  ticketRevenue: number;
  courierRevenue: number;
  dailyStats: DailyStat[];
  nextDeparture: string;
  destinations: { name: string; count: number }[];
  channels: ChannelStat[];
  topRoutes: TopRoute[];
};
type ModePeriode = 'month'|'year'|'range';
type ChannelData = { label: string; value: number; color: string };

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const startOfMonth = (y:number,m:number) => new Date(y, m, 1, 0,0,0,0);
const endOfMonth   = (y:number,m:number) => new Date(y, m+1, 0, 23,59,59,999);
const startOfYear  = (y:number) => new Date(y, 0, 1, 0,0,0,0);
const endOfYear    = (y:number) => new Date(y,11,31,23,59,59,999);
const fmtDDMM = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;

/* ===================== Page ===================== */
const DashboardAgencePage: React.FC = () => {
  const { user } = useAuth();
  const theme = useCompanyTheme();
  const money = useFormatCurrency();
  const { id: agencyIdFromRoute } = useParams();
  const isOnline = useOnlineStatus();
  const agencyId = agencyIdFromRoute || user?.agencyId;
  const agencyTz = useMemo(
    () => resolveAgencyTimezone({ timezone: (user as { agencyTimezone?: string })?.agencyTimezone }),
    [user]
  );

  // Filtres de période
  const now = new Date();
  const [mode, setMode] = useState<ModePeriode>('month');
  const [mois, setMois] = useState<number>(now.getMonth());
  const [annee, setAnnee] = useState<number>(now.getFullYear());
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd, setRangeEnd] = useState<string>('');
  const [dateRange, setDateRange] = useState<[Date,Date]>([
    startOfMonth(now.getFullYear(), now.getMonth()),
    endOfMonth(now.getFullYear(), now.getMonth())
  ]);

  useEffect(() => {
    if (mode === 'month') {
      setDateRange([ startOfMonth(annee, mois), endOfMonth(annee, mois) ]);
    } else if (mode === 'year') {
      setDateRange([ startOfYear(annee), endOfYear(annee) ]);
    } else {
      const s = rangeStart ? startOfDay(new Date(rangeStart)) : startOfDay(now);
      const e = rangeEnd ? endOfDay(new Date(rangeEnd)) : endOfDay(now);
      setDateRange([s,e]);
    }
  }, [mode, mois, annee, rangeStart, rangeEnd]);

  // Données
  const [stats, setStats] = useState<DashboardStats>({
    sales: 0, totalRevenue: 0, ticketRevenue: 0, courierRevenue: 0, dailyStats: [],
    nextDeparture: '—', destinations: [], channels: [], topRoutes: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const unsubscribeRef = useRef<() => void>();
  const [unifiedFinance, setUnifiedFinance] = useState<UnifiedAgencyFinance | null>(null);
  const [unifiedFinanceLoading, setUnifiedFinanceLoading] = useState(false);

  const fetchStats = useCallback(async (startDate: Date, endDate: Date) => {
    const companyId = user?.companyId;
    const agencyId  = agencyIdFromRoute || user?.agencyId;
    if (!companyId || !agencyId) {
      setLoadError("Informations agence/compagnie introuvables.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);
    const { startKey, endKey } = rangeToAgencyKeys(startDate, endDate, agencyTz);

    try {
      const agencyStats = await getAgencyStats(companyId, agencyId, startKey, endKey, agencyTz);

      const dailyStats: DailyStat[] = agencyStats.dailyChartData.map((p) => {
        const d = typeof p.date === "string" && p.date.includes("T") ? p.date.split("T")[0] : p.date;
        const [y, m, day] = d.split("-").map(Number);
        const dateObj = new Date(y, (m || 1) - 1, day || 1);
        return {
          date: fmtDDMM(dateObj),
          reservations: p.reservations,
          revenue: p.revenue,
        };
      });

      const channelData: ChannelStat[] = [
        { name: "En ligne", value: agencyStats.onlineTickets },
        { name: "Guichet", value: agencyStats.counterTickets },
      ];

      setStats((prev) => ({
        ...prev,
        sales: agencyStats.totalTickets,
        totalRevenue: agencyStats.totalRevenue,
        ticketRevenue: agencyStats.totalRevenue,
        courierRevenue: prev.courierRevenue,
        dailyStats,
        nextDeparture: prev.nextDeparture,
        destinations: prev.destinations,
        channels: channelData,
        topRoutes: prev.topRoutes,
      }));
      setIsLoading(false);
    } catch (e) {
      console.error(e);
      setLoadError(
        !isOnline
          ? "Connexion indisponible. Impossible de charger le dashboard agence."
          : "Erreur lors du chargement des indicateurs agence."
      );
      setIsLoading(false);
    }
  }, [user?.companyId, user?.agencyId, agencyIdFromRoute, isOnline, agencyTz]);

  // Courier revenue for period (paid shipments only)
  useEffect(() => {
    const companyId = user?.companyId;
    const agencyId = agencyIdFromRoute || user?.agencyId;
    if (!companyId || !agencyId) return;
    const [startDate, endDate] = dateRange;
    const { startKey: shipStart, endKey: shipEnd } = rangeToAgencyKeys(startDate, endDate, agencyTz);
    const shipFrom = getStartOfDayForDate(shipStart, agencyTz);
    const shipTo = getEndOfDayForDate(shipEnd, agencyTz);
    const q = query(
      shipmentsRef(db, companyId),
      where('originAgencyId', '==', agencyId),
      where('createdAt', '>=', Timestamp.fromDate(shipFrom)),
      where('createdAt', '<=', Timestamp.fromDate(shipTo))
    );
    getDocs(q).then((snap) => {
      let sum = 0;
      snap.docs.forEach((d) => {
        const s = d.data() as { paymentStatus?: string; transportFee?: number; insuranceAmount?: number };
        if (s.paymentStatus === 'PAID_ORIGIN' || s.paymentStatus === 'PAID_DESTINATION') {
          sum += Number(s.transportFee ?? 0) + Number(s.insuranceAmount ?? 0);
        }
      });
      setStats((prev) => ({ ...prev, courierRevenue: sum }));
    }).catch(() => {
      setStats((prev) => ({ ...prev, courierRevenue: 0 }));
    });
  }, [user?.companyId, user?.agencyId, agencyIdFromRoute, dateRange, agencyTz]);

  useEffect(() => {
    fetchStats(dateRange[0], dateRange[1]);
    return () => { if (unsubscribeRef.current) unsubscribeRef.current?.(); };
  }, [fetchStats, dateRange, reloadKey]);

  // Finance unifiée
  useEffect(() => {
    const companyId = user?.companyId;
    const agencyId = agencyIdFromRoute || user?.agencyId;
    if (!companyId || !agencyId) return;
    const { startKey, endKey } = rangeToAgencyKeys(dateRange[0], dateRange[1], agencyTz);
    setUnifiedFinanceLoading(true);
    getUnifiedAgencyFinance(companyId, agencyId, startKey, endKey, agencyTz)
      .then(setUnifiedFinance)
      .catch(() => setUnifiedFinance(null))
      .finally(() => setUnifiedFinanceLoading(false));
  }, [user?.companyId, user?.agencyId, agencyIdFromRoute, dateRange, agencyTz]);

  // Pagination “Top trajets”
  const [routePage, setRoutePage] = useState(1);
  const pageSize = 10;
  const totalRoutePages = Math.max(1, Math.ceil(stats.topRoutes.length / pageSize));
  useEffect(()=>{ setRoutePage(1); }, [stats.topRoutes.length]);
  const visibleTopRoutes = useMemo(() => {
    const start = (routePage-1)*pageSize;
    return stats.topRoutes.slice(start, start+pageSize);
  }, [stats.topRoutes, routePage]);

  // Export CSV
  const exportCSV = () => {
    const header = ['Date','Réservations','Revenus'];
    const rows = stats.dailyStats.map(d => [d.date, String(d.reservations), String(d.revenue)]);
    const csv = [header, ...rows].map(r => r.join(';')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='dashboard_reservations.csv'; a.click(); URL.revokeObjectURL(url);
  };

  // Données pour les graphiques modernes
  const totalSales = stats.ticketRevenue + stats.courierRevenue;
  const guichetSales = stats.channels.find(c => c.name === 'Guichet')?.value ?? 0;
  const onlineSales = stats.channels.find(c => c.name === 'En ligne')?.value ?? 0;

  const chartData = stats.dailyStats.map(d => ({
    label: d.date,
    value: d.revenue,
    color: theme.colors.primary,
  }));

  const channelData: ChannelData[] = [
    { label: 'Guichet', value: guichetSales, color: '#EA580C' },
    { label: 'En ligne', value: onlineSales, color: '#3B82F6' },
    { label: 'Courrier', value: stats.courierRevenue, color: '#8B5CF6' },
  ];

  // Alertes
  const alerts: { id: string; title: string; detail: string; tone: 'warning' | 'critical' | 'neutral' }[] = [];

  if (stats.sales === 0 && !isLoading) {
    alerts.push({ id: 'zero-sales', title: 'Aucune vente aujourd\'hui', detail: 'Aucun billet vendu pour le moment.', tone: 'warning' });
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.colors.background }}>
      <StandardLayoutWrapper>
        {!isOnline && (
          <PageOfflineState message="Connexion instable: les indicateurs peuvent être incomplets." />
        )}
        {loadError && (
          <PageErrorState message={loadError} onRetry={() => setReloadKey((v) => v + 1)} />
        )}

        {/* ===== EN-TÊTE ===== */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">📊 Tableau de bord</h1>
            <p className="text-sm text-gray-500 mt-1">
              {user?.agencyName} · {dateRange[0].toLocaleDateString()} → {dateRange[1].toLocaleDateString()}
            </p>
          </div>
          <ActionButton variant="secondary" onClick={exportCSV} size="sm">
            <FileDown className="h-4 w-4 mr-2" /> Exporter
          </ActionButton>
        </div>

        {/* ===== FILTRES PÉRIODE ===== */}
        <SectionCard title="Filtres période" className="mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="mode" checked={mode==='month'} onChange={()=>setMode('month')} /> Mois
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="mode" checked={mode==='year'} onChange={()=>setMode('year')} /> Année
              </label>
              <label className="flex items-center gap-1.5 text-sm">
                <input type="radio" name="mode" checked={mode==='range'} onChange={()=>setMode('range')} /> Période
              </label>
            </div>

            {mode === 'month' && (
              <div className="flex items-center gap-2">
                <select className="border rounded-lg px-3 py-2 text-sm" value={mois} onChange={e=>setMois(Number(e.target.value))}>
                  {Array.from({length:12}).map((_,i)=>(
                    <option key={i} value={i}>{new Date(2000,i,1).toLocaleString('fr-FR',{month:'long'})}</option>
                  ))}
                </select>
                <input className="border rounded-lg px-3 py-2 w-24 text-sm" type="number" value={annee} onChange={e=>setAnnee(Number(e.target.value))} />
              </div>
            )}
            {mode === 'year' && (
              <input className="border rounded-lg px-3 py-2 w-24 text-sm" type="number" value={annee} onChange={e=>setAnnee(Number(e.target.value))} />
            )}
            {mode === 'range' && (
              <div className="flex items-center gap-2">
                <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} />
                <span className="text-gray-400">→</span>
                <input type="date" className="border rounded-lg px-3 py-2 text-sm" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} />
              </div>
            )}
          </div>
        </SectionCard>

        {/* ===== ALERTES ===== */}
        {alerts.length > 0 && (
          <div className="space-y-2 mb-6">
            {alerts.map((alert) => (
              <div
                key={alert.id}
                className={`flex items-start gap-3 rounded-xl border p-3 ${
                  alert.tone === 'warning'
                    ? 'border-amber-200 bg-amber-50'
                    : alert.tone === 'critical'
                    ? 'border-red-200 bg-red-50'
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
                  alert.tone === 'warning' ? 'text-amber-500'
                  : alert.tone === 'critical' ? 'text-red-500'
                  : 'text-blue-500'
                }`} />
                <div>
                  <div className="text-sm font-medium text-gray-900">{alert.title}</div>
                  <div className="text-sm text-gray-600">{alert.detail}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ===== KPI PRINCIPAUX AVEC CERCLES ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <ActivityMetricCard
            label="Ventes totales"
            value={totalSales}
            icon={<Ticket className="h-5 w-5" />}
            color={theme.colors.primary}
            progress={totalSales > 0 ? 100 : 0}
            subtitle={`${stats.sales} billets vendus`}
          />
          <ActivityMetricCard
            label="Guichet"
            value={guichetSales}
            icon={<Store className="h-5 w-5" />}
            color="#EA580C"
            progress={totalSales > 0 ? (guichetSales / totalSales) * 100 : 0}
            subtitle={`${guichetSales} FCFA`}
          />
          <ActivityMetricCard
            label="En ligne"
            value={onlineSales}
            icon={<Monitor className="h-5 w-5" />}
            color="#3B82F6"
            progress={totalSales > 0 ? (onlineSales / totalSales) * 100 : 0}
            subtitle={`${onlineSales} FCFA`}
          />
          <ActivityMetricCard
            label="Courrier"
            value={stats.courierRevenue}
            icon={<Package className="h-5 w-5" />}
            color="#8B5CF6"
            progress={stats.courierRevenue > 0 ? 100 : 0}
            subtitle={`${stats.courierRevenue} FCFA`}
          />
        </div>

        {/* ===== GRAPHIQUES MODERNES ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Évolution en barres */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-medium text-gray-700">Évolution des ventes</div>
                <div className="text-xs text-gray-400">{mode === 'month' ? 'Ce mois' : mode === 'year' ? 'Cette année' : 'Période'}</div>
              </div>
              <span className="text-lg font-bold text-gray-900">{money(totalSales)}</span>
            </div>
            {isLoading ? (
              <div className="flex items-center justify-center h-24 text-gray-400 text-sm">Chargement...</div>
            ) : chartData.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-gray-400 text-sm">Aucune donnée</div>
            ) : (
          <div className="flex h-20 items-end gap-2">
            {chartData.map((item) => (
              <div key={item.label} className="flex flex-1 flex-col items-center gap-1">
               <div
                  className="w-full rounded-t-lg bg-orange-500"
                  style={{ height: `${Math.max(8, item.value)}%` }}
                  title={`${item.label}: ${item.value}`}
                />
                <span className="text-[10px] text-slate-500">{item.label}</span>
               </div>
             ))}
           </div>
            )}
          </div>

          {/* Donut de répartition */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-medium text-gray-700 mb-4">Répartition des ventes</div>
            <ChannelDonutCard channels={channelData} totalLabel="Total ventes" />
          </div>
        </div>

        {/* ===== CARTE CAISSE ===== */}
        {agencyId && user?.companyId && (
          <div className="mb-6">
            <CashSummaryCard
              companyId={user.companyId}
              locationId={agencyId}
              locationType="agence"
              canClose={false}
              createdBy={user?.uid ?? ''}
              formatCurrency={money}
              ianaTimezone={agencyTz}
            />
          </div>
        )}

        {/* ===== STATISTIQUES SUPPLÉMENTAIRES ===== */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{stats.sales}</div>
            <div className="text-xs text-gray-500 mt-1">Billets vendus</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{money(stats.ticketRevenue)}</div>
            <div className="text-xs text-gray-500 mt-1">Revenus billetterie</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{money(stats.courierRevenue)}</div>
            <div className="text-xs text-gray-500 mt-1">Revenus courrier</div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-4 text-center">
            <div className="text-2xl font-bold text-gray-900">{money(totalSales)}</div>
            <div className="text-xs text-gray-500 mt-1">Revenus totaux</div>
          </div>
        </div>

        {/* ===== GRAPHIQUES EXISTANTS ===== */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SectionCard title="Revenus (détail)">
              <RevenueChart data={stats.dailyStats} isLoading={isLoading} />
            </SectionCard>
          </div>
          <SectionCard title="Canaux">
            <ChannelsChart data={stats.channels} isLoading={isLoading} />
          </SectionCard>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SectionCard title="Prochain départ">
            <NextDepartureCard isLoading={isLoading} />
          </SectionCard>
          <SectionCard title="Destinations">
            <DestinationsChart destinations={stats.destinations} isLoading={isLoading} />
          </SectionCard>
          <SectionCard
            title="Top trajets"
            right={
              <span className={typography.muted}>
                {stats.topRoutes.length} lignes • page {routePage}/{totalRoutePages}
              </span>
            }
          >
            <TopTrajetsCard trajets={visibleTopRoutes} isLoading={isLoading} />
            <div className="flex items-center justify-end gap-2 mt-3">
              <ActionButton variant="secondary" size="sm" onClick={()=>setRoutePage(p=>Math.max(1,p-1))} disabled={routePage<=1}>Préc.</ActionButton>
              <ActionButton variant="secondary" size="sm" onClick={()=>setRoutePage(p=>Math.min(totalRoutePages,p+1))} disabled={routePage>=totalRoutePages}>Suiv.</ActionButton>
            </div>
          </SectionCard>
        </div>

        {/* ===== FOOTER ===== */}
        <div className="mt-6 text-xs text-gray-400 text-center border-t border-gray-100 pt-4">
          Données actualisées en temps réel · {AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
        </div>
      </StandardLayoutWrapper>
    </div>
  );
};

export default DashboardAgencePage;