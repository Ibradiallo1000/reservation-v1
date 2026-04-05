/**
 * Finances — Liquidités (ledger) | Mouvements | Caisse (sessions + encaissements).
 */
import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DollarSign, Wallet, Banknote, ArrowRightLeft } from "lucide-react";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { TimeFilterBar, type RangeKey } from "@/modules/compagnie/admin/components/CompanyDashboard/TimeFilterBar";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import type { Company } from "@/types/companyTypes";
import { useAuth } from "@/contexts/AuthContext";
import FinancesLiquiditesTab from "../finances/pages/FinancesLiquiditesTab";
import FinancesMouvementsTab from "../finances/pages/FinancesMouvementsTab";
import FinancesCaisseTab from "../finances/pages/FinancesCaisseTab";

const TAB_LIQUIDITES = "liquidites";
const TAB_MOUVEMENTS = "mouvements";
const TAB_CAISSE = "caisse";

const TABS = [
  { key: TAB_LIQUIDITES, label: "Liquidités", icon: Wallet },
  { key: TAB_MOUVEMENTS, label: "Mouvements", icon: ArrowRightLeft },
  { key: TAB_CAISSE, label: "Caisse", icon: Banknote },
];

type TabKey = typeof TAB_LIQUIDITES | typeof TAB_MOUVEMENTS | typeof TAB_CAISSE;

export default function FinancesPage() {
  const { user, company } = useAuth();
  const globalPeriod = useGlobalPeriodContext();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const tabParam = searchParams.get("tab");
  const tabFromUrl = (TABS.some((t) => t.key === tabParam) ? tabParam : TAB_LIQUIDITES) as TabKey;
  const [activeTab, setActiveTab] = useState<TabKey>(
    tabParam === "ca" ? TAB_LIQUIDITES : tabFromUrl
  );

  useEffect(() => {
    if (tabParam === "ca") {
      const next = new URLSearchParams(searchParams);
      next.set("tab", TAB_LIQUIDITES);
      setSearchParams(next, { replace: true });
      setActiveTab(TAB_LIQUIDITES);
      return;
    }
    setActiveTab(TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : TAB_LIQUIDITES);
  }, [tabParam, searchParams, setSearchParams]);

  const theme = useCompanyTheme((company as Company | null) ?? null);
  const range: RangeKey =
    globalPeriod.preset === "day"
      ? "day"
      : globalPeriod.preset === "month"
        ? "month"
        : "custom";
  const customStart = globalPeriod.preset === "custom" ? globalPeriod.startDate : null;
  const customEnd = globalPeriod.preset === "custom" ? globalPeriod.endDate : null;

  const setTab = (tab: TabKey) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    setSearchParams(next, { replace: true });
  };
  const setRange = (v: RangeKey) => {
    if (v === "day") return globalPeriod.setPreset("day");
    if (v === "month") return globalPeriod.setPreset("month");
    if (v === "custom") return globalPeriod.setPreset("custom");
    const now = new Date();
    if (v === "prev_month") {
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endPrev = new Date(firstOfThisMonth.getTime() - 1);
      const startPrev = new Date(endPrev.getFullYear(), endPrev.getMonth(), 1);
      const start = `${startPrev.getFullYear()}-${String(startPrev.getMonth() + 1).padStart(2, "0")}-${String(
        startPrev.getDate()
      ).padStart(2, "0")}`;
      const end = `${endPrev.getFullYear()}-${String(endPrev.getMonth() + 1).padStart(2, "0")}-${String(
        endPrev.getDate()
      ).padStart(2, "0")}`;
      return globalPeriod.setCustomRange(start, end);
    }
    if (v === "ytd") {
      const start = `${now.getFullYear()}-01-01`;
      const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      return globalPeriod.setCustomRange(start, end);
    }
    if (v === "12m") {
      const endD = now;
      const startD = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const start = `${startD.getFullYear()}-${String(startD.getMonth() + 1).padStart(2, "0")}-${String(
        startD.getDate()
      ).padStart(2, "0")}`;
      const end = `${endD.getFullYear()}-${String(endD.getMonth() + 1).padStart(2, "0")}-${String(
        endD.getDate()
      ).padStart(2, "0")}`;
      return globalPeriod.setCustomRange(start, end);
    }
  };

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Finances" icon={DollarSign} />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Finances"
        subtitle="Liquidités (grand livre), mouvements et caisse par session."
        icon={DollarSign}
        right={
          <TimeFilterBar
            range={range}
            setRange={setRange}
            customStart={customStart}
            setCustomStart={(v) => globalPeriod.setCustomRange(v ?? globalPeriod.startDate, globalPeriod.endDate)}
            customEnd={customEnd}
            setCustomEnd={(v) => globalPeriod.setCustomRange(globalPeriod.startDate, v ?? globalPeriod.endDate)}
          />
        }
      />
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-600 pb-3 mb-4">
        {TABS.map(({ key, label, icon: Icon }) => {
          const tabKey = key as TabKey;
          const active = activeTab === tabKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(tabKey)}
              className={[
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-all",
                active
                  ? "bg-white dark:bg-slate-800 border border-b-0 border-gray-200 dark:border-slate-600 shadow-sm -mb-px"
                  : "text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-700 border border-transparent",
              ].join(" ")}
              style={active ? { borderBottomColor: "white", color: theme?.colors?.primary } : {}}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      {activeTab === TAB_LIQUIDITES && <FinancesLiquiditesTab />}
      {activeTab === TAB_MOUVEMENTS && <FinancesMouvementsTab />}
      {activeTab === TAB_CAISSE && <FinancesCaisseTab />}
    </StandardLayoutWrapper>
  );
}
