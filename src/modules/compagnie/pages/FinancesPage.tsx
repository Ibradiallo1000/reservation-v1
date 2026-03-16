/**
 * Menu Finances (audit CEO) : fusion Revenus & Liquidités + Finance — Caisse.
 * 3 onglets : CA | Liquidités | Caisse
 */
import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DollarSign, Wallet, Banknote } from "lucide-react";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import type { Company } from "@/types/companyTypes";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import CompanyFinancesPage from "./CompanyFinancesPage";
import CEOTreasuryPage from "./CEOTreasuryPage";
import CompanyCashPage from "../cash/CompanyCashPage";

const TAB_CA = "ca";
const TAB_LIQUIDITES = "liquidites";
const TAB_CAISSE = "caisse";

const TABS = [
  { key: TAB_CA, label: "CA", icon: DollarSign },
  { key: TAB_LIQUIDITES, label: "Liquidités", icon: Wallet },
  { key: TAB_CAISSE, label: "Caisse", icon: Banknote },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function FinancesPage() {
  const { user, company } = useAuth();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const tabParam = searchParams.get("tab");
  const tabFromUrl = (TABS.some((t) => t.key === tabParam) ? tabParam : TAB_CA) as TabKey;
  const [activeTab, setActiveTab] = useState<TabKey>(tabFromUrl);
  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const [companyInfo, setCompanyInfo] = React.useState<{ id: string; [key: string]: unknown } | null>(company ?? null);
  useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, "companies", companyId))
      .then((snap) => {
        if (snap.exists()) setCompanyInfo({ id: snap.id, ...snap.data() });
      })
      .catch(() => {});
  }, [companyId]);

  const theme = useCompanyTheme((companyInfo ?? company ?? null) as Company | null);

  const setTab = (tab: TabKey) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Finances" />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Finances"
        subtitle="Chiffre d'affaires, liquidités et caisse par point de vente."
      />
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
              style={active ? { borderBottomColor: "white", color: theme?.colors?.primary } : {}}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      {activeTab === TAB_CA && <CompanyFinancesPage embedded />}
      {activeTab === TAB_LIQUIDITES && <CEOTreasuryPage embedded />}
      {activeTab === TAB_CAISSE && <CompanyCashPage embedded />}
    </StandardLayoutWrapper>
  );
}
