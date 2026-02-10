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
} from "lucide-react";

// ✅ Import corrigé (sans accolades)
import { KpiHeader } from "@/components/CompanyDashboard/KpiHeader";
import { TimeFilterBar, RangeKey } from "@/components/CompanyDashboard/TimeFilterBar";
import { RevenueReservationsChart } from "@/components/CompanyDashboard/RevenueReservationsChart";
import { ChannelSplitChart } from "@/components/CompanyDashboard/ChannelSplitChart";

// ✅ Nouveaux composants CEO
import { NetworkHealthSummary } from "@/components/CompanyDashboard/NetworkHealthSummary";
import { CriticalAlertsPanel, type CriticalAlert } from "@/components/CompanyDashboard/CriticalAlertsPanel";

// id compagnie depuis l'auth
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";

/* ---------- helpers ---------- */
const DEFAULT_RANGE: RangeKey = "month";

// Type pour les agences (adapté au type réel)
interface AgencyData {
  id?: string;
  nom?: string;
  name?: string;
  ville?: string;
  reservations?: number;
  revenus?: number;
  tauxRemplissage?: number;
  ca?: number;
}

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

  const { dateFrom, dateTo, periodLabel } = useMemo(() => {
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

    let start = new Date(now.getFullYear(), now.getMonth(), 1);
    let end = endOfToday;

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
          Identifiant compagnie introuvable dans l'auth. Vérifie <code>user.companyId</code>.
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

  // Calculer les métriques de santé réseau
  const calculateNetworkHealth = () => {
    if (!perAgency || perAgency.length === 0) {
      return {
        totalAgencies: kpis.totalAgences || 0,
        healthyAgencies: 0,
        atRiskAgencies: 0,
        trend: "stable" as const
      };
    }

    // Type assertion safe
    const agencies = perAgency as unknown as AgencyData[];
    
    // Calcul simple basé sur les revenus ou taux de remplissage
    const agenciesWithData = agencies.filter(agency => 
      (agency.revenus !== undefined && agency.revenus !== null) || 
      (agency.tauxRemplissage !== undefined && agency.tauxRemplissage !== null)
    );

    if (agenciesWithData.length === 0) {
      return {
        totalAgencies: kpis.totalAgences || 0,
        healthyAgencies: kpis.agencesActives || 0,
        atRiskAgencies: 0,
        trend: "stable" as const
      };
    }

    // Calculer le revenu moyen
    const totalRevenue = agenciesWithData.reduce((sum, agency) => {
      const revenue = agency.revenus || 0;
      return sum + revenue;
    }, 0);
    
    const avgRevenue = totalRevenue / agenciesWithData.length;

    // Agences performantes : revenu > 70% de la moyenne
    const healthyAgencies = agenciesWithData.filter(agency => {
      const revenue = agency.revenus || 0;
      return revenue > avgRevenue * 0.7;
    }).length;

    // Agences à risque : revenu < 30% de la moyenne
    const atRiskAgencies = agenciesWithData.filter(agency => {
      const revenue = agency.revenus || 0;
      return revenue < avgRevenue * 0.3;
    }).length;

    // Déterminer la tendance
    let trend: "up" | "down" | "stable" = "stable";
    
    // Calculer le taux de remplissage moyen
    const totalTauxRemplissage = agenciesWithData.reduce((sum, agency) => {
      const taux = agency.tauxRemplissage || 0;
      return sum + taux;
    }, 0);
    
    const avgTauxRemplissage = totalTauxRemplissage / agenciesWithData.length;

    if (avgTauxRemplissage > 70) trend = "up";
    else if (avgTauxRemplissage < 40) trend = "down";

    return {
      totalAgencies: kpis.totalAgences || agenciesWithData.length,
      healthyAgencies,
      atRiskAgencies,
      trend
    };
  };

  const networkHealth = calculateNetworkHealth();

  // Convertir les alertes au format attendu
  const convertAlertsToCriticalAlerts = (): CriticalAlert[] => {
    if (!alerts || !Array.isArray(alerts)) return [];
    
    return alerts.map((alert: any, index: number) => {
      // Vérifier si l'alerte a déjà un titre
      if (alert.title && typeof alert.title === 'string') {
        return {
          id: alert.id || `alert-${index}`,
          title: alert.title,
          description: alert.description || alert.message || alert.details,
          type: alert.type,
          severity: alert.severity,
          level: alert.level || (alert.severity === 'high' ? 'high' : 'medium'),
          date: alert.date || alert.createdAt
        };
      }
      
      // Si pas de titre, essayer de créer un titre à partir d'autres propriétés
      const title = alert.message || alert.description || `Alerte ${index + 1}`;
      const description = alert.details || alert.description || alert.message;
      
      return {
        id: alert.id || `alert-${index}`,
        title,
        description,
        type: alert.type,
        severity: alert.severity,
        level: alert.level || (alert.severity === 'high' ? 'high' : 'medium'),
        date: alert.date || alert.createdAt
      };
    });
  };

  const criticalAlerts = convertAlertsToCriticalAlerts();

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

      {/* ===== SECTION 1: VUE EXÉCUTIVE ===== */}
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

      {/* ===== SECTION 2: SANTÉ DU RÉSEAU ===== */}
      <div className="grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Santé du réseau</CardTitle>
          </CardHeader>
          <CardContent>
            <NetworkHealthSummary
              totalAgencies={networkHealth.totalAgencies}
              healthyAgencies={networkHealth.healthyAgencies}
              atRiskAgencies={networkHealth.atRiskAgencies}
              trend={networkHealth.trend}
            />
          </CardContent>
        </Card>
      </div>

      {/* ===== SECTION 3: ALERTES CRITIQUES ===== */}
      <div className="grid grid-cols-1">
        <Card>
          <CardHeader>
            <CardTitle>Alertes critiques nécessitant décision</CardTitle>
          </CardHeader>
          <CardContent>
            <CriticalAlertsPanel 
              alerts={criticalAlerts} 
              loading={loading}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}