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
  NextDepartureCard
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
import { Ticket, DollarSign, Monitor, Store, FileDown } from 'lucide-react';
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

/* ===================== Types & helpers ===================== */
type DailyStat = { date: string; reservations: number; revenue: number };
type DestinationStat = { name: string; count: number };
type ChannelStat = { name: string; value: number };
type TopRoute = { id: string; name: string; count: number; revenue: number };
type DashboardStats = {
  sales: number;
  totalRevenue: number;
  ticketRevenue: number;
  courierRevenue: number;
  dailyStats: DailyStat[];
  nextDeparture: string;
  destinations: DestinationStat[];
  channels: ChannelStat[];
  topRoutes: TopRoute[];
};
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const startOfMonth = (y:number,m:number) => new Date(y, m, 1, 0,0,0,0);
const endOfMonth   = (y:number,m:number) => new Date(y, m+1, 0, 23,59,59,999);
const startOfYear  = (y:number) => new Date(y, 0, 1, 0,0,0,0);
const endOfYear    = (y:number) => new Date(y,11,31,23,59,59,999);
const fmtDDMM = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
type ModePeriode = 'month'|'year'|'range';

/* ===================== Page ===================== */
const DashboardAgencePage: React.FC = () => {
  const { user } = useAuth();
  const theme = useCompanyTheme();
  const money = useFormatCurrency();
  const { id: agencyIdFromRoute } = useParams();
  const isOnline = useOnlineStatus();
  const agencyId = agencyIdFromRoute || user?.agencyId;
  const canCloseCash = useMemo(() => {
    const role = (user as { role?: string })?.role ?? '';
    const roles = Array.isArray((user as { roles?: string[] })?.roles) ? (user as { roles?: string[] }).roles! : [role];
    return [...routePermissions.guichet, ...routePermissions.escaleDashboard].some((r) => roles.includes(r));
  }, [user]);

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
  const [courierRevenuePeriod, setCourierRevenuePeriod] = useState(0);
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
        // p.date est soit YYYY-MM-DD soit YYYY-MM-DDThh:00 → on formate en DD/MM pour l'affichage local
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
        // On gardera nextDeparture / destinations / topRoutes tels quels, mis à jour par d'autres flux si nécessaire
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
      setCourierRevenuePeriod(sum);
      setStats((prev) => ({ ...prev, courierRevenue: sum }));
    }).catch(() => {
      setCourierRevenuePeriod(0);
      setStats((prev) => ({ ...prev, courierRevenue: 0 }));
    });
  }, [user?.companyId, user?.agencyId, agencyIdFromRoute, dateRange, agencyTz]);

  useEffect(() => {
    fetchStats(dateRange[0], dateRange[1]);
    return () => { if (unsubscribeRef.current) unsubscribeRef.current?.(); };
  }, [fetchStats, dateRange, reloadKey]);

  // Finance unifiée : live / cash / validated (même période que le dashboard)
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

  return (
    <div className="min-h-screen" style={{ backgroundColor: theme.colors.background }}>
      <StandardLayoutWrapper>
        {!isOnline && (
          <PageOfflineState message="Connexion instable: les indicateurs peuvent être incomplets." />
        )}
        {loadError && (
          <PageErrorState message={loadError} onRetry={() => setReloadKey((v) => v + 1)} />
        )}

        <PageHeader
          title="Tableau de bord • Réservations"
          subtitle={`${user?.agencyName} • Période ${dateRange[0].toLocaleDateString()} → ${dateRange[1].toLocaleDateString()}`}
          icon={Ticket}
          primaryColorVar={theme.colors.primary}
          right={
            <ActionButton variant="secondary" onClick={exportCSV}>
              <FileDown className="h-4 w-4" /> Exporter
            </ActionButton>
          }
        />

        <SectionCard title="Filtres période">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode==='month'} onChange={()=>setMode('month')} /> Mois
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode==='year'} onChange={()=>setMode('year')} /> Année
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="mode" checked={mode==='range'} onChange={()=>setMode('range')} /> Période personnalisée
              </label>
            </div>

            {mode==='month' && (
              <div className="flex items-center gap-2">
                <select className="border rounded-lg px-3 py-2" value={mois} onChange={e=>setMois(Number(e.target.value))}>
                  {Array.from({length:12}).map((_,i)=>
                    <option key={i} value={i}>
                      {new Date(2000,i,1).toLocaleString('fr-FR',{month:'long'})}
                    </option>
                  )}
                </select>
                <input className="border rounded-lg px-3 py-2 w-28" type="number" value={annee} onChange={e=>setAnnee(Number(e.target.value))} />
              </div>
            )}

            {mode==='year' && (
              <div className="flex items-center gap-2">
                <input className="border rounded-lg px-3 py-2 w-28" type="number" value={annee} onChange={e=>setAnnee(Number(e.target.value))} />
              </div>
            )}

            {mode==='range' && (
              <div className="flex items-center gap-2">
                <input type="date" className="border rounded-lg px-3 py-2" value={rangeStart} onChange={e=>setRangeStart(e.target.value)} />
                <span className="text-gray-500">→</span>
                <input type="date" className="border rounded-lg px-3 py-2" value={rangeEnd} onChange={e=>setRangeEnd(e.target.value)} />
              </div>
            )}
          </div>
        </SectionCard>

        <div className="mt-2 mb-6 space-y-2 text-xs text-gray-600 dark:text-gray-400">
          <p>
            <span className="font-semibold">Création réservation (jour agence)</span> — billets / canaux via{" "}
            <span className="font-mono text-[11px]">getAgencyStats</span>.{" "}
            <span className="font-semibold">Colis</span> — création enregistrée sur la période (bornes fuseau agence).
          </p>
          <p>
            <span className="font-semibold">Comptabilisé (ledger, jour agence)</span> — liquidité, encaissements et CA net (bloc 1–2
            ci-dessous). Ne pas les comparer aux totaux « réservations » sans séparation.
          </p>
          <p>
            La carte caisse : solde espèces ledger + trace opérationnelle du jour (autre temporalité).
          </p>
        </div>

        {agencyId && user?.companyId && (
          <div className="mb-6">
            <CashSummaryCard
              companyId={user.companyId}
              locationId={agencyId}
              locationType="agence"
              canClose={canCloseCash}
              createdBy={user?.uid ?? ''}
              formatCurrency={money}
              ianaTimezone={agencyTz}
            />
          </div>
        )}

        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">1 — Argent réel (soldes accounts)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <div className="rounded-lg border-2 border-slate-300 bg-slate-50/90 dark:bg-slate-900/50 dark:border-slate-600 p-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Caisse espèces</div>
            <div className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">
              {unifiedFinanceLoading ? '—' : money(unifiedFinance?.realMoney.cash ?? 0)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{AGENCY_KPI_TIME.LEDGER_BAMAKO}</p>
          </div>
          <div className="rounded-lg border-2 border-slate-300 bg-slate-50/90 dark:bg-slate-900/50 dark:border-slate-600 p-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Mobile money</div>
            <div className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">
              {unifiedFinanceLoading ? '—' : money(unifiedFinance?.realMoney.mobileMoney ?? 0)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{AGENCY_KPI_TIME.LEDGER_BAMAKO}</p>
          </div>
          <div className="rounded-lg border-2 border-slate-300 bg-slate-50/90 dark:bg-slate-900/50 dark:border-slate-600 p-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Banque</div>
            <div className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">
              {unifiedFinanceLoading ? '—' : money(unifiedFinance?.realMoney.bank ?? 0)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{AGENCY_KPI_TIME.LEDGER_BAMAKO}</p>
          </div>
          <div className="rounded-lg border-2 border-slate-300 bg-slate-50/90 dark:bg-slate-900/50 dark:border-slate-600 p-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Liquidité totale</div>
            <div className="text-xl font-bold mt-1 text-slate-800 dark:text-slate-100">
              {unifiedFinanceLoading ? '—' : money(unifiedFinance?.realMoney.total ?? 0)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">{AGENCY_KPI_TIME.LEDGER_BAMAKO}</p>
          </div>
        </div>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
          2 — Activité (période) · ventes = {AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO} · encaissements ={" "}
          {AGENCY_KPI_TIME.LEDGER_BAMAKO}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border-2 border-blue-200 bg-blue-50/50 dark:bg-blue-900/20 dark:border-blue-800 p-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Ventes (réservations)</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#2563eb' }}>
              {unifiedFinanceLoading ? '—' : money(unifiedFinance?.activity.sales.amountHint ?? 0)}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {unifiedFinanceLoading ? '—' : `${unifiedFinance?.activity.sales.reservationCount ?? 0} réservation(s) · ${unifiedFinance?.activity.sales.tickets ?? 0} place(s)`}
            </p>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">{AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}</p>
          </div>
          <div className="rounded-lg border-2 border-green-200 bg-green-50/50 dark:bg-green-900/20 dark:border-green-800 p-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">Encaissements</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#16a34a' }}>
              {unifiedFinanceLoading ? '—' : money(unifiedFinance?.activity.encaissements.total ?? 0)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">{AGENCY_KPI_TIME.LEDGER_BAMAKO}</p>
          </div>
          <div className="rounded-lg border-2 border-violet-200 bg-violet-50/50 dark:bg-violet-900/20 dark:border-violet-800 p-4">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300">CA net (ledger)</div>
            <div className="text-xl font-bold mt-1" style={{ color: '#7c3aed' }}>
              {unifiedFinanceLoading ? '—' : money(unifiedFinance?.activity.caNet ?? 0)}
            </div>
            <p className="text-[11px] text-slate-500 mt-1 font-medium">{AGENCY_KPI_TIME.LEDGER_BAMAKO}</p>
          </div>
        </div>

        <div className="mb-3 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2 text-xs text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-100">
          Grille ci-dessous : <strong>terrain uniquement</strong> — ne pas comparer aux montants du ledger sans lire les blocs 1–2.
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <UIMetricCard
            label="Billets vendus"
            value={isLoading ? "—" : stats.sales}
            icon={Ticket}
            valueColorVar={theme.colors.secondary}
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <UIMetricCard
            label="Revenus billets (réservations)"
            value={isLoading ? "—" : money(stats.ticketRevenue)}
            icon={DollarSign}
            valueColorVar={theme.colors.primary}
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <UIMetricCard
            label="Revenus courrier (colis)"
            value={isLoading ? "—" : money(stats.courierRevenue)}
            icon={DollarSign}
            valueColorVar={theme.colors.secondary}
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <UIMetricCard
            label="Revenus totaux (terrain)"
            value={isLoading ? "—" : money(stats.ticketRevenue + stats.courierRevenue)}
            icon={DollarSign}
            valueColorVar={theme.colors.primary}
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <UIMetricCard
            label="En ligne"
            value={isLoading ? "—" : (stats.channels.find(c => c.name==='En ligne')?.value ?? 0)}
            icon={Monitor}
            valueColorVar={theme.colors.primary}
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
          <UIMetricCard
            label="Au guichet"
            value={isLoading ? "—" : (stats.channels.find(c => c.name==='Guichet')?.value ?? 0)}
            icon={Store}
            valueColorVar={theme.colors.secondary}
            hint={AGENCY_KPI_TIME.CREATION_RESERVATION_BAMAKO}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <SectionCard title="Revenus">
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

      </StandardLayoutWrapper>
    </div>
  );
};

export default DashboardAgencePage;
