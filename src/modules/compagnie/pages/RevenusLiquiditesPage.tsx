// Revenus & Liquidités — page fusionnée CEO (CA, ventes, évolution | cash, validé, en attente, trésorerie nette).
// Réutilise CompanyFinancesPage (Revenus) et CEOTreasuryPage (Liquidités) sans dupliquer la logique.
import React, { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DollarSign, Wallet } from "lucide-react";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import type { Company } from "@/types/companyTypes";
import { useAuth } from "@/contexts/AuthContext";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import CompanyFinancesPage from "./CompanyFinancesPage";
import CEOTreasuryPage from "./CEOTreasuryPage";

const TAB_REVENUS = "revenus";
const TAB_LIQUIDITES = "liquidites";

export default function RevenusLiquiditesPage() {
  const { user, company } = useAuth();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const tabFromUrl = searchParams.get("tab") === TAB_LIQUIDITES ? TAB_LIQUIDITES : TAB_REVENUS;
  const [activeTab, setActiveTab] = useState<typeof TAB_REVENUS | typeof TAB_LIQUIDITES>(tabFromUrl);
  React.useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const [companyInfo, setCompanyInfo] = React.useState<{ id: string; [key: string]: any } | null>(company ?? null);
  React.useEffect(() => {
    if (!companyId) return;
    getDoc(doc(db, "companies", companyId)).then((snap) => {
      if (snap.exists()) setCompanyInfo({ id: snap.id, ...snap.data() });
    }).catch(() => {});
  }, [companyId]);

  const theme = useCompanyTheme((companyInfo ?? company ?? null) as Company | null);

  const setTab = (tab: typeof TAB_REVENUS | typeof TAB_LIQUIDITES) => {
    setActiveTab(tab);
    setSearchParams({ tab }, { replace: true });
  };

  const tabs = useMemo(
    () => [
      { key: TAB_REVENUS, label: "Revenus", icon: DollarSign, description: "CA, ventes, évolution (sessions validées)" },
      { key: TAB_LIQUIDITES, label: "Liquidités", icon: Wallet, description: "Cash réel, validé, en attente, trésorerie nette" },
    ] as const,
    []
  );

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Revenus & Liquidités" />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Revenus & Liquidités"
        subtitle="Pilotage financier : chiffre d'affaires, encaissements réels et trésorerie nette."
      />
      <div className="flex flex-wrap gap-2 border-b border-gray-200 dark:border-slate-600 pb-3">
        {tabs.map(({ key, label, icon: Icon, description }) => {
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
              style={active ? { borderBottomColor: "white", color: theme.colors.primary } : {}}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      {activeTab === TAB_REVENUS && <CompanyFinancesPage embedded />}
      {activeTab === TAB_LIQUIDITES && <CEOTreasuryPage embedded />}
    </StandardLayoutWrapper>
  );
}
