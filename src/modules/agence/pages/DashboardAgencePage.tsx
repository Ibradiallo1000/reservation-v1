// src/pages/DashboardAgencePage.tsx
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { collection, onSnapshot, query, where, Timestamp, orderBy } from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { useOnlineStatus } from '@/shared/hooks/useOnlineStatus';
import { PageErrorState, PageOfflineState } from '@/shared/ui/PageStates';
import type { Reservation } from '@/types/index';
import { toJSDate } from '@/utils/toJSDate';

import {
  MetricCard,
  RevenueChart,
  ChannelsChart,
  DestinationsChart,
  TopTrajetsCard,
  NextDepartureCard
} from '@/modules/agence/dashboard/components';

import {
  TicketIcon,
  CurrencyDollarIcon,
  ComputerDesktopIcon,
  BuildingStorefrontIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';

/* ===================== Types & helpers ===================== */
type DailyStat = { date: string; reservations: number; revenue: number };
type DestinationStat = { name: string; count: number };
type ChannelStat = { name: string; value: number };
type TopRoute = { id: string; name: string; count: number; revenue: number };
type DashboardStats = {
  sales: number;
  totalRevenue: number;
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
  const { id: agencyIdFromRoute } = useParams();
  const isOnline = useOnlineStatus();

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
    sales: 0, totalRevenue: 0, dailyStats: [],
    nextDeparture: '—', destinations: [], channels: [], topRoutes: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const unsubscribeRef = useRef<() => void>();

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
    if (unsubscribeRef.current) unsubscribeRef.current();

    // ✅ IMPORTANT : on ne prend que les réservations "payé"
    const qy = query(
      collection(db, 'companies', companyId, 'agences', agencyId, 'reservations'),
      where('createdAt','>=', Timestamp.fromDate(startDate)),
      where('createdAt','<=', Timestamp.fromDate(endDate)),
      where('statut', 'in', ['paye', 'payé']),
      orderBy('createdAt','asc')
    );

    const unsub = onSnapshot(qy, snap => {
      const rows: Reservation[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

      let totalRevenue = 0;
      const channels: Record<'online'|'counter', number> = { online:0, counter:0 };
      const dest: Record<string, number> = {};
      const daily: Record<string, {count:number; revenue:number}> = {};
      const topMap: Record<string, {name:string; count:number; revenue:number}> = {};

      for (const r of rows) {
        totalRevenue += r.montant || 0;

        const raw = (r.canal || '').toString().toLowerCase().trim();
        const norm = raw.replace(/\s|_|-/g,'');
        const isOnline = norm.includes('ligne') || norm === 'online' || norm === 'web';
        const canal: 'online'|'counter' = isOnline ? 'online' : 'counter';
        channels[canal]++;

        const destKey = r.arrivee || 'Inconnu';
        dest[destKey] = (dest[destKey]||0) + 1;

        if ((r as any).createdAt) {
          const d = toJSDate((r as any).createdAt);
          const key = fmtDDMM(d);
          if (!daily[key]) daily[key] = {count:0, revenue:0};
          daily[key].count++;
          daily[key].revenue += r.montant || 0;
        }

        const routeName = `${r.depart || '?'} → ${r.arrivee || '?'}`;
        const routeKey  = r.trajetId || routeName;
        if (!topMap[routeKey]) topMap[routeKey] = { name: routeName, count:0, revenue:0 };
        topMap[routeKey].count  += 1;
        topMap[routeKey].revenue+= r.montant || 0;
      }

      const dailyStats = Object.entries(daily)
        .map(([date, v]) => ({ date, reservations: v.count, revenue: v.revenue }))
        .sort((a,b)=> {
          const [ad,am]=a.date.split('/').map(Number), [bd,bm]=b.date.split('/').map(Number);
          return am===bm ? ad-bd : am-bm;
        });

      const channelData: ChannelStat[] = [
        { name:'En ligne', value: channels.online },
        { name:'Guichet',  value: channels.counter }
      ];

      const topRoutes: TopRoute[] = Object.entries(topMap)
        .map(([id,v]) => ({ id, name:v.name, count:v.count, revenue:v.revenue }))
        .sort((a,b)=> b.revenue - a.revenue);

      const destinations: DestinationStat[] = Object.entries(dest)
        .map(([name,count]) => ({ name, count }))
        .sort((a,b)=> b.count - a.count);

      setStats({
        sales: rows.length,
        totalRevenue,
        dailyStats,
        nextDeparture: '—',
        destinations,
        channels: channelData,
        topRoutes
      });
      setIsLoading(false);
    }, (e)=>{
      console.error(e);
      setLoadError(
        !isOnline
          ? "Connexion indisponible. Impossible de charger le dashboard agence."
          : "Erreur lors du chargement des indicateurs agence."
      );
      setIsLoading(false);
    });

    unsubscribeRef.current = unsub;
  }, [user?.companyId, user?.agencyId, agencyIdFromRoute]);

  useEffect(() => {
    fetchStats(dateRange[0], dateRange[1]);
    return () => { if (unsubscribeRef.current) unsubscribeRef.current(); };
  }, [fetchStats, dateRange, reloadKey]);

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
    <div className="min-h-screen p-4 md:p-6" style={{ backgroundColor: theme.colors.background }}>
      <div className="max-w-7xl mx-auto space-y-6">
        {!isOnline && (
          <PageOfflineState message="Connexion instable: les indicateurs peuvent être incomplets." />
        )}
        {loadError && (
          <PageErrorState message={loadError} onRetry={() => setReloadKey((v) => v + 1)} />
        )}

        {/* En-tête + filtres période */}
        <div className="rounded-xl bg-white shadow-sm border p-4 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold" style={{ color: theme.colors.primary }}>
                Tableau de bord • Réservations
              </h1>
              <p
                className="px-3 py-1 rounded-md text-sm font-medium shadow-sm"
                style={{ backgroundColor: `${theme.colors.secondary}20`, color: theme.colors.primary }}
              >
                {user?.agencyName} • Période {dateRange[0].toLocaleDateString()} → {dateRange[1].toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-2 border rounded-lg px-3 py-2 shadow-sm"
              style={{ borderColor: theme.colors.primary, color: theme.colors.primary }}
            >
              <DocumentArrowDownIcon className="h-5 w-5" /> Exporter
            </button>
          </div>

          {/* Contrôles période */}
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
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="Billets vendus"
            value={stats.sales}
            icon={<TicketIcon className="h-5 w-5" style={{ color: theme.colors.secondary }} />}
            color="primary"
            link="/agence/reservations"
            isLoading={isLoading}
          />
          <MetricCard
            title="Revenus totaux"
            value={stats.totalRevenue}
            icon={<CurrencyDollarIcon className="h-5 w-5" style={{ color: theme.colors.primary }} />}
            color="success"
            isCurrency
            isLoading={isLoading}
          />
          <MetricCard
            title="En ligne"
            value={stats.channels.find(c => c.name==='En ligne')?.value || 0}
            icon={<ComputerDesktopIcon className="h-5 w-5" style={{ color: theme.colors.primary }} />}
            color="info"
            isLoading={isLoading}
          />
          <MetricCard
            title="Au guichet"
            value={stats.channels.find(c => c.name==='Guichet')?.value || 0}
            icon={<BuildingStorefrontIcon className="h-5 w-5" style={{ color: theme.colors.secondary }} />}
            color="warning"
            isLoading={isLoading}
          />
        </div>

        {/* Graph + canaux */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-4 rounded-lg shadow-sm bg-white">
            <RevenueChart data={stats.dailyStats} isLoading={isLoading} />
          </div>
          <div className="p-4 rounded-lg shadow-sm bg-white">
            <ChannelsChart data={stats.channels} isLoading={isLoading} />
          </div>
        </div>

        {/* Destinations / Top trajets (pagination) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="p-4 rounded-lg shadow-sm bg-white">
            <NextDepartureCard isLoading={isLoading} />
          </div>
          <div className="p-4 rounded-lg shadow-sm bg-white">
            <DestinationsChart destinations={stats.destinations} isLoading={isLoading} />
          </div>

          <div className="p-4 rounded-lg shadow-sm bg-white space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Top trajets</div>
              <div className="text-sm text-gray-600">
                {stats.topRoutes.length} lignes • page {routePage}/{totalRoutePages}
              </div>
            </div>
            <TopTrajetsCard trajets={visibleTopRoutes} isLoading={isLoading} />
            <div className="flex items-center justify-end gap-2">
              <button className="px-3 py-1 rounded border" onClick={()=>setRoutePage(p=>Math.max(1,p-1))} disabled={routePage<=1}>Préc.</button>
              <button className="px-3 py-1 rounded border" onClick={()=>setRoutePage(p=>Math.min(totalRoutePages,p+1))} disabled={routePage>=totalRoutePages}>Suiv.</button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardAgencePage;
