/**
 * Menu Flotte (audit CEO) : fusion Exploitation Flotte + Finance Flotte.
 * Affiche : bus actifs, affectations, rentabilité véhicules, revenu par bus, trajets du jour.
 */
import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Truck, DollarSign, BarChart3 } from "lucide-react";
import { StandardLayoutWrapper, PageHeader, MetricCard } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getVehicleFinancialStats } from "@/modules/compagnie/fleet/fleetFinanceService";
import GarageDashboardPage from "./GarageDashboardPage";
import FleetFinancePage from "./FleetFinancePage";

const TAB_EXPLOITATION = "exploitation";
const TAB_RENTABILITE = "rentabilite";

const TABS = [
  { key: TAB_EXPLOITATION as const, label: "Exploitation", icon: Truck, description: "Bus actifs, affectations, trajets" },
  { key: TAB_RENTABILITE as const, label: "Rentabilité", icon: DollarSign, description: "Revenus, coûts et marge par véhicule" },
];

type TabKey = (typeof TABS)[number]["key"];

export default function FlottePage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const money = useFormatCurrency();

  const [revenueTotal, setRevenueTotal] = useState<number | null>(null);
  const [revenuePerBus, setRevenuePerBus] = useState<number | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setRevenueLoading(true);
    getVehicleFinancialStats(companyId)
      .then((stats) => {
        const total = stats.reduce((s, v) => s + v.vehicleRevenue, 0);
        setRevenueTotal(total);
        setRevenuePerBus(stats.length > 0 ? total / stats.length : null);
      })
      .catch(() => {
        setRevenueTotal(null);
        setRevenuePerBus(null);
      })
      .finally(() => setRevenueLoading(false));
  }, [companyId]);

  const tabParam = searchParams.get("tab");
  const tabFromUrl = tabParam === TAB_RENTABILITE ? TAB_RENTABILITE : TAB_EXPLOITATION;
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl);
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const setTab = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Flotte" />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Flotte"
        subtitle="Exploitation des véhicules et rentabilité par bus."
      />

      {/* Revenu par bus (indicateur stratégique) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <MetricCard
          label="Revenu total flotte"
          value={revenueLoading ? "—" : revenueTotal != null ? money(revenueTotal) : "—"}
          icon={BarChart3}
        />
        <MetricCard
          label="Revenu moyen par bus"
          value={revenueLoading ? "—" : revenuePerBus != null ? money(revenuePerBus) : "—"}
          icon={DollarSign}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-600 pb-3 mb-4">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={[
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all",
                active
                  ? "bg-white dark:bg-slate-800 border border-b-0 border-gray-200 dark:border-slate-600 shadow-sm -mb-px"
                  : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 border border-transparent",
              ].join(" ")}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      {activeTab === TAB_EXPLOITATION && <GarageDashboardPage embedded />}
      {activeTab === TAB_RENTABILITE && <FleetFinancePage embedded />}
    </StandardLayoutWrapper>
  );
}
