// =============================================
// src/pages/CompagnieDashboard.tsx
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import { useCompanyDashboardData } from "@/hooks/useCompanyDashboardData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  Building2,
  Map,
  GaugeCircle,
  Ticket,
  BellRing,
} from "lucide-react";

// ✅ Import corrigé (sans accolades)
import { KpiHeader } from "@/components/CompanyDashboard/KpiHeader";
import { TimeFilterBar, RangeKey } from "@/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/components/CompanyDashboard/RevenueReservationsChart";
import { AgencyPerformanceChart } from "@/components/CompanyDashboard/AgencyPerformanceChart";
import { ChannelSplitChart } from "@/components/CompanyDashboard/ChannelSplitChart";
import { StatusBreakdownChart } from "@/components/CompanyDashboard/StatusBreakdownChart";
import { TopTrajetsTable } from "@/components/CompanyDashboard/TopTrajetsTable";
import { UnderperformingAgenciesTable } from "@/components/CompanyDashboard/UnderperformingAgenciesTable";
import { AlertsPanel } from "@/components/CompanyDashboard/AlertsPanel";

// id compagnie depuis l'auth
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";

/* ---------- helpers ---------- */
const DEFAULT_RANGE: RangeKey = "month";

export default function CompagnieDashboard() {
  const { user } = useAuth();
  const companyId = user?.companyId ?? "";

  const { setHeader, resetHeader } = usePageHeader();
  useEffect(() => {
    setHeader({ title: "Dashboard Compagnie" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [customStart, setCustomStart] = useState<string | null>(null);
  const [customEnd, setCustomEnd] = useState<string | null>(null);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const { todayFrom, todayTo, todayLabel } = useMemo(() => {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const label = new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(start);
    return { todayFrom: start, todayTo: end, todayLabel: label };
  }, [now]);

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = endOfToday;

    // ✅ Nouveau filtre "day"
    if (range === "day") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    } else if (range === "prev_month") {
      const y = now.getFullYear(), m = now.getMonth();
      start = new Date(y, m - 1, 1);
      end = new Date(y, m, 0, 23, 59, 59);
    } else if (range === "ytd") {
      start = new Date(now.getFullYear(), 0, 1);
      end = endOfToday;
    } else if (range === "12m") {
      start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      end = endOfToday;
    } else if (range === "custom" && customStart && customEnd) {
      start = new Date(`${customStart}T00:00:00`);
      end = new Date(`${customEnd}T23:59:59`);
    }

    const label = new Intl.DateTimeFormat("fr-FR", {
      month: "long",
      year: "numeric",
    }).format(start);

    return { dateFrom: start, dateTo: end, periodLabel: label };
  }, [range, customStart, customEnd, now]);

  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold mb-2">Dashboard Compagnie</h1>
        <p className="text-sm text-muted-foreground">
          Identifiant compagnie introuvable dans l’auth. Vérifie <code>user.companyId</code>.
        </p>
      </div>
    );
  }

  const {
    loading: loadingToday,
    company: companyToday,
    kpis: kpisToday,
    alerts: alertsToday,
  } = useCompanyDashboardData({ companyId, dateFrom: todayFrom, dateTo: todayTo });

  const alertsCountToday = alertsToday?.length ?? 0;

  const {
    loading,
    company,
    kpis,
    series,
    perAgency,
    topTrajets,
    alerts,
  } = useCompanyDashboardData({ companyId, dateFrom, dateTo });

  return (
    <div className="space-y-5 p-4 md:p-6">
      {/* ===== EN-TÊTE PÉRIODE + FILTRE ===== */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex-1">
          <h2 className="text-2xl md:text-3xl font-bold">Réservations</h2>
          <p className="text-sm text-muted-foreground">Période : {periodLabel}</p>
        </div>

        {/* Filtre à droite */}
        <div className="w-full md:w-auto">
          <TimeFilterBar
            range={range}
            setRange={setRange}
            customStart={customStart}
            setCustomStart={setCustomStart}
            customEnd={customEnd}
            setCustomEnd={setCustomEnd}
          />
        </div>
      </div>

      {/* ===== KPIs PÉRIODE ===== */}
      <KpiHeader
        loading={loading}
        couleurPrimaire={company?.couleurPrimaire}
        couleurSecondaire={company?.couleurSecondaire}
        items={[
          {
            icon: TrendingUp,
            label: "CA",
            value: kpis.caPeriodeFormatted,
            sub: kpis.caDeltaText,
            to: "/compagnie/reservations",
          },
          {
            icon: Ticket,
            label: "Billets vendus",
            value: String(kpis.reservationsCount || 0),
            sub: "Tous canaux",
            to: "/compagnie/reservations",
          },
          {
            icon: GaugeCircle,
            label: "Taux de remplissage",
            value: kpis.tauxRemplissageText,
            sub: "Moyenne",
            to: "/compagnie/statistiques",
          },
          {
            icon: Building2,
            label: "Agences actives",
            value: String(kpis.agencesActives),
            sub: `${kpis.totalAgences} au total`,
            to: "/compagnie/agences",
          },
          {
            icon: Map,
            label: "Villes couvertes",
            value: String(kpis.villesCouvertes),
            sub: "Réseau",
            to: "/compagnie/agences",
          },
        ]}
      />

      {/* ===== Graphiques ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Évolution du CA & des Réservations</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueReservationsChart data={series.daily} loading={loading} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Répartition par canal</CardTitle>
          </CardHeader>
          <CardContent>
            <ChannelSplitChart data={kpis.parCanal} loading={loading} />
          </CardContent>
        </Card>
      </div>

      {/* ===== Comparatifs ===== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Performance par agence</CardTitle>
          </CardHeader>
          <CardContent>
            <AgencyPerformanceChart data={perAgency} loading={loading} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Réservations par statut</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusBreakdownChart data={kpis.parStatut} loading={loading} />
          </CardContent>
        </Card>
      </div>

      {/* ===== Tables & Alertes ===== */}
      <div className="grid grid-cols-1 2xl:grid-cols-3 gap-5">
        <Card className="2xl:col-span-2">
          <CardHeader>
            <CardTitle>Top trajets</CardTitle>
          </CardHeader>
          <CardContent>
            <TopTrajetsTable rows={topTrajets} loading={loading} />
          </CardContent>
        </Card>
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Agences à surveiller</CardTitle>
            </CardHeader>
            <CardContent>
              <UnderperformingAgenciesTable data={perAgency} loading={loading} />
            </CardContent>
          </Card>
          <AlertsPanel alerts={alerts} />
        </div>
      </div>
    </div>
  );
}
