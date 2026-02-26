// =============================================
// src/pages/CompagnieDashboard.tsx
// =============================================
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useCompanyDashboardData } from "@/modules/compagnie/hooks/useCompanyDashboardData";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import {
  TrendingUp,
  Building2,
  Ticket,
} from "lucide-react";

import { KpiHeader } from "@/modules/compagnie/admin/components/CompanyDashboard/KpiHeader";
import { TimeFilterBar, RangeKey } from "@/modules/compagnie/admin/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import { ChannelSplitChart } from "@/modules/compagnie/admin/components/CompanyDashboard/ChannelSplitChart";

import { NetworkHealthSummary } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkHealthSummary";
import { CriticalAlertsPanel, type CriticalAlert } from "@/modules/compagnie/admin/components/CompanyDashboard/CriticalAlertsPanel";

import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

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
  const money = useFormatCurrency();

  const { setHeader, resetHeader } = usePageHeader();
  useEffect(() => {
    setHeader({ title: "Performance Réseau" });
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
  const agencyDataWithVariation = agencies as (AgencyData & { variation?: number })[];

  // Santé du réseau : à risque si baisse de CA > 15 % vs période précédente OU aucun revenu sur la période
  const REVENUE_DROP_RISK_THRESHOLD = 15;
  const healthyAgencies = agencyDataWithVariation.filter(
    a => (a.revenus ?? 0) > 0 && (a.variation === undefined || a.variation >= -REVENUE_DROP_RISK_THRESHOLD)
  ).length;
  const atRiskAgencies = agencyDataWithVariation.filter(
    a => (a.revenus ?? 0) === 0 || (a.variation !== undefined && a.variation < -REVENUE_DROP_RISK_THRESHOLD)
  ).length;

  const trend = useMemo(() => {
    const pct = kpis.caDeltaPercent;
    if (pct == null) return "stable" as const;
    if (pct > 0) return "up" as const;
    if (pct < 0) return "down" as const;
    return "stable" as const;
  }, [kpis.caDeltaPercent]);

  const criticalAlerts: CriticalAlert[] =
    alerts?.map((alert: any, i: number) => ({
      id: alert.id ?? `alert-${i}`,
      title: alert.title ?? "Alerte",
      description: alert.description,
      level: alert.level ?? "medium",
    })) ?? [];

  const rankingByCa = useMemo(() => {
    const withCa = agencies.map((a) => ({ ...a, ca: a.revenus ?? 0 }));
    return [...withCa].sort((a, b) => b.ca - a.ca);
  }, [agencies]);

  return (
    <div className="space-y-6 p-4 md:p-6">

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Performance Réseau</h2>
          <p className="text-sm text-muted-foreground">CA par agence, classement et alertes — Période : {periodLabel}</p>
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
            sub: kpis.caDeltaPercent != null ? `Variation : ${kpis.caDeltaPercent >= 0 ? "+" : ""}${kpis.caDeltaPercent}%` : kpis.caDeltaText,
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
            to: `/compagnie/${companyId}/parametres`,
          },
        ]}
      />

      {kpis.caDeltaPercent != null && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-600">Variation vs période précédente :</span>
          <span
            className={`font-semibold ${kpis.caDeltaPercent >= 0 ? "text-emerald-600" : "text-red-600"}`}
          >
            {kpis.caDeltaPercent >= 0 ? "+" : ""}{kpis.caDeltaPercent}%
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Évolution</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueReservationsChart
            data={series.daily}
            loading={loading}
            primaryColor={company?.couleurPrimaire}
            secondaryColor={company?.couleurSecondaire}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Classement agences (CA période)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-gray-500">Chargement…</p>
          ) : rankingByCa.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune donnée pour la période.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">Rang</th>
                    <th className="text-left py-2">Agence</th>
                    <th className="text-right py-2">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {rankingByCa.map((a, i) => (
                    <tr key={a.id ?? i} className="border-b">
                      <td className="py-2 font-medium">{i + 1}</td>
                      <td className="py-2">{a.nom || "Agence inconnue"}</td>
                      <td className="py-2 text-right">{money((a.revenus ?? 0) as number)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
            trend={trend}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alertes par agence</CardTitle>
        </CardHeader>
        <CardContent>
          <CriticalAlertsPanel alerts={criticalAlerts} loading={loading} />
        </CardContent>
      </Card>

    </div>
  );
}
