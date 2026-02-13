// =============================================
// src/pages/CompagnieDashboard.tsx
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useCompanyDashboardData } from "@/hooks/useCompanyDashboardData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TrendingUp,
  Building2,
  Map,
  GaugeCircle,
  Ticket,
} from "lucide-react";

import { KpiHeader } from "@/components/CompanyDashboard/KpiHeader";
import { TimeFilterBar, RangeKey } from "@/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/components/CompanyDashboard/RevenueReservationsChart";
import { ChannelSplitChart } from "@/components/CompanyDashboard/ChannelSplitChart";

import { NetworkHealthSummary } from "@/components/CompanyDashboard/NetworkHealthSummary";
import { CriticalAlertsPanel, type CriticalAlert } from "@/components/CompanyDashboard/CriticalAlertsPanel";

import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";

/* ---------- helpers ---------- */
const DEFAULT_RANGE: RangeKey = "month";

interface AgencyData {
  id?: string;
  nom?: string;
  revenus?: number;
  tauxRemplissage?: number;
}

export default function CompagnieDashboard() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();

  // 🔥 CLÉ PRINCIPALE
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

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

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = endOfToday;

    if (range === "day") {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
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
          Company ID introuvable.
        </p>
      </div>
    );
  }

  const {
    loading,
    company,
    kpis,
    series,
    perAgency,
    alerts,
  } = useCompanyDashboardData({ companyId, dateFrom, dateTo });

  const agencies = (perAgency ?? []) as AgencyData[];

  const healthyAgencies = agencies.filter(a => (a.revenus ?? 0) > 0).length;
  const atRiskAgencies = agencies.filter(a => (a.revenus ?? 0) === 0).length;

  const criticalAlerts: CriticalAlert[] =
    alerts?.map((alert: any, i: number) => ({
      id: alert.id ?? `alert-${i}`,
      title: alert.title ?? "Alerte",
      description: alert.description,
      level: alert.level ?? "medium",
    })) ?? [];

  return (
    <div className="space-y-5 p-4 md:p-6">

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Réservations</h2>
          <p className="text-sm text-muted-foreground">Période : {periodLabel}</p>
        </div>
        <TimeFilterBar
          range={range}
          setRange={setRange}
          customStart={customStart}
          setCustomStart={setCustomStart}
          customEnd={customEnd}
          setCustomEnd={setCustomEnd}
        />
      </div>

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
            to: `/compagnie/${companyId}/reservations`,
          },
          {
            icon: Ticket,
            label: "Billets vendus",
            value: String(kpis.reservationsCount || 0),
            sub: "Tous canaux",
            to: `/compagnie/${companyId}/reservations`,
          },
          {
            icon: Building2,
            label: "Agences actives",
            value: String(kpis.agencesActives),
            sub: `${kpis.totalAgences} au total`,
            to: `/compagnie/${companyId}/agences`,
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>Évolution</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueReservationsChart data={series.daily} loading={loading} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Santé du réseau</CardTitle>
        </CardHeader>
        <CardContent>
          <NetworkHealthSummary
            totalAgencies={kpis.totalAgences}
            healthyAgencies={healthyAgencies}
            atRiskAgencies={atRiskAgencies}
            trend="stable"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertes critiques</CardTitle>
        </CardHeader>
        <CardContent>
          <CriticalAlertsPanel alerts={criticalAlerts} loading={loading} />
        </CardContent>
      </Card>

    </div>
  );
}
