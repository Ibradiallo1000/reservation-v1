import React from "react";
import { AlertTriangle, Building2, Package, Ticket, TrendingUp, Trophy, Workflow } from "lucide-react";
import { MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useCompanyPlan } from "@/core/hooks/useCompanyPlan";
import { hasCapability } from "@/core/subscription/capabilities";
import PremiumGate from "@/core/ui/PremiumGate";
import { usePlanBusinessMetrics } from "@/modules/compagnie/hooks/usePlanBusinessMetrics";
import { Skeleton } from "@/shared/ui/skeleton";

type Props = {
  companyId: string;
  primaryColor?: string;
};

export default function PlanBusinessMetricsPanel({ companyId, primaryColor }: Props) {
  const money = useFormatCurrency();
  const metrics = usePlanBusinessMetrics(companyId);
  const { company, loading: planLoading } = useCompanyPlan(companyId);
  const canViewPremium = hasCapability(company, "financial_advanced");
  const canViewAgencyAnalytics = hasCapability(company, "multi_agency_analytics");
  const canViewFraudDetection = hasCapability(company, "fraud_detection");

  if (metrics.loading || planLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-[110px] rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Activite reseau</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          Le compteur d'operations provient du document compagnie. Les autres indicateurs suivent l'activite en temps reel.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Reservations"
          value={String(metrics.totalReservations)}
          icon={Ticket}
          valueColorVar={primaryColor}
        />
        <MetricCard
          label="Colis"
          value={String(metrics.totalParcels)}
          icon={Package}
          valueColorVar={primaryColor}
        />
        <MetricCard
          label="Operations facturees"
          value={String(metrics.totalOperations)}
          icon={Workflow}
          valueColorVar={primaryColor}
        />
        <MetricCard
          label="Revenus"
          value={money(metrics.totalRevenue)}
          icon={TrendingUp}
          valueColorVar={primaryColor}
        />
      </div>

      {!canViewPremium ? (
        <PremiumGate companyId={companyId} featureName="Analytics avances, performance agences et detection d'anomalies" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <MetricCard
              label="CA total reseau"
              value={money(metrics.totalRevenue)}
              icon={TrendingUp}
              valueColorVar={primaryColor}
            />
            {canViewAgencyAnalytics ? (
              <MetricCard
                label="Meilleure agence"
                value={metrics.bestAgency ? metrics.bestAgency.agencyName : "-"}
                icon={Trophy}
                valueColorVar={primaryColor}
              />
            ) : (
              <PremiumGate companyId={companyId} featureName="Analyse multi-agences" />
            )}
            {canViewFraudDetection ? (
              <MetricCard
                label="Anomalie revenus"
                value={metrics.revenueAnomaly ? "Alerte" : "Normal"}
                icon={AlertTriangle}
                valueColorVar={metrics.revenueAnomaly ? "#dc2626" : primaryColor}
              />
            ) : (
              <PremiumGate companyId={companyId} featureName="Detection d'anomalies" />
            )}
          </div>

          {canViewAgencyAnalytics && (
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-900">
              <table className="w-full text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-gray-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold">Agence</th>
                    <th className="px-4 py-3 text-right font-semibold">Reservations</th>
                    <th className="px-4 py-3 text-right font-semibold">Colis</th>
                    <th className="px-4 py-3 text-right font-semibold">Revenus</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.revenuePerAgency.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-center text-gray-500" colSpan={4}>
                        Aucune activite enregistree.
                      </td>
                    </tr>
                  ) : (
                    metrics.revenuePerAgency.map((agency) => (
                      <tr key={agency.agencyId} className="border-b border-gray-100 last:border-0 dark:border-slate-800">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                          <span className="inline-flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-400" />
                            {agency.agencyName}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300">
                          {agency.totalReservations}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-slate-300">
                          {agency.totalParcels}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-white">
                          {money(agency.totalRevenue)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
