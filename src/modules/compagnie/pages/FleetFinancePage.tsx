// Fleet Finance dashboard — revenue, costs, profit per vehicle.
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { getVehicleFinancialStats } from "@/modules/compagnie/fleet/fleetFinanceService";
import type { VehicleFinancialStats } from "@/modules/compagnie/fleet/fleetFinanceService";
import {
  getRouteProfitability,
  getVehicleOperationalCosts,
  type RouteProfitability,
  type VehicleCostBreakdown,
} from "@/modules/compagnie/profitability/operationalProfitabilityService";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { Truck, TrendingUp, TrendingDown, DollarSign } from "lucide-react";

export default function FleetFinancePage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const theme = useCompanyTheme(user?.companyId ? undefined : null);
  const formatCurrency = useFormatCurrency();

  const [stats, setStats] = useState<VehicleFinancialStats[]>([]);
  const [vehicleCosts, setVehicleCosts] = useState<VehicleCostBreakdown[]>([]);
  const [routeProfitability, setRouteProfitability] = useState<RouteProfitability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      getVehicleFinancialStats(companyId),
      getVehicleOperationalCosts(companyId),
      getRouteProfitability(companyId),
    ])
      .then(([vehicleStats, costs, profitability]) => {
        if (cancelled) return;
        setStats(vehicleStats);
        setVehicleCosts(costs);
        setRouteProfitability(profitability.routes);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Erreur chargement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const totals = React.useMemo(() => {
    let revenue = 0;
    let costs = 0;
    stats.forEach((s) => {
      revenue += s.vehicleRevenue;
      costs += s.vehicleCosts;
    });
    return { revenue, costs, profit: revenue - costs };
  }, [stats]);

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Finance Flotte"
        subtitle="Revenus, coûts et marge par véhicule (fleetCosts + tripCosts liés)"
        icon={Truck}
        primaryColorVar={theme?.colors?.primary ? "var(--teliya-primary)" : undefined}
      />

      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Chargement...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
                <DollarSign className="h-4 w-4" />
                Total revenus véhicules
              </div>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {formatCurrency(totals.revenue)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
                <TrendingDown className="h-4 w-4" />
                Total coûts
              </div>
              <p className="text-xl font-semibold text-gray-900 dark:text-white">
                {formatCurrency(totals.costs)}
              </p>
            </div>
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-900">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm mb-1">
                <TrendingUp className="h-4 w-4" />
                Marge flotte
              </div>
              <p className={`text-xl font-semibold ${totals.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                {formatCurrency(totals.profit)}
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Véhicule
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Revenus
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Coûts
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Marge
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {stats.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500 text-sm">
                      Aucun véhicule. Les coûts se remplissent via fleetCosts et tripCosts (avec vehicleId) ; les revenus proviennent des réservations liées aux trajets.
                    </td>
                  </tr>
                ) : (
                  stats.map((s) => (
                    <tr key={s.vehicleId}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900 dark:text-white">{s.plateNumber || s.vehicleId}</span>
                        {s.model && (
                          <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">{s.model}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                        {formatCurrency(s.vehicleRevenue)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-900 dark:text-white">
                        {formatCurrency(s.vehicleCosts)}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${s.vehicleProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatCurrency(s.vehicleProfit)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Fuel cost per vehicle</h3>
              <ul className="space-y-2 text-sm">
                {vehicleCosts.length === 0 ? (
                  <li className="text-gray-500">Aucune donnée.</li>
                ) : (
                  [...vehicleCosts]
                    .sort((a, b) => b.fuelCost - a.fuelCost)
                    .slice(0, 8)
                    .map((v) => (
                      <li key={`fuel_${v.vehicleId}`} className="flex justify-between">
                        <span className="text-gray-700 dark:text-gray-300">{v.vehicleId}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(v.fuelCost)}</span>
                      </li>
                    ))
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Maintenance cost per vehicle</h3>
              <ul className="space-y-2 text-sm">
                {vehicleCosts.length === 0 ? (
                  <li className="text-gray-500">Aucune donnée.</li>
                ) : (
                  [...vehicleCosts]
                    .sort((a, b) => b.maintenanceCost - a.maintenanceCost)
                    .slice(0, 8)
                    .map((v) => (
                      <li key={`maint_${v.vehicleId}`} className="flex justify-between">
                        <span className="text-gray-700 dark:text-gray-300">{v.vehicleId}</span>
                        <span className="font-medium text-gray-900 dark:text-white">{formatCurrency(v.maintenanceCost)}</span>
                      </li>
                    ))
                )}
              </ul>
            </div>

            <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Profit per route</h3>
              <ul className="space-y-2 text-sm">
                {routeProfitability.length === 0 ? (
                  <li className="text-gray-500">Aucune donnée.</li>
                ) : (
                  routeProfitability.slice(0, 8).map((r) => (
                    <li key={r.routeKey} className="flex justify-between">
                      <span className="text-gray-700 dark:text-gray-300 truncate mr-3">{r.routeKey}</span>
                      <span className={`font-medium ${r.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {formatCurrency(r.profit)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        </>
      )}
    </StandardLayoutWrapper>
  );
}
