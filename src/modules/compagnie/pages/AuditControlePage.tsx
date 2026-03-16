/**
 * Menu Audit & contrôle (audit CEO) : fusion Contrôle & Audit + Dépenses.
 * Affiche : anomalies caisse, dépenses à valider, alertes critiques.
 */
import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { FileCheck, ShieldCheck } from "lucide-react";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import CEOExpensesPage from "./CEOExpensesPage";
import CompagnieComptabilitePage from "./CompagnieComptabilitePage";

const TAB_DEPENSES = "depenses";
const TAB_CONTROLE = "controle";

const TABS = [
  { key: TAB_DEPENSES as const, label: "Dépenses à valider", icon: ShieldCheck },
  { key: TAB_CONTROLE as const, label: "Contrôle & Audit", icon: FileCheck },
];

type TabKey = (typeof TABS)[number]["key"];

export default function AuditControlePage() {
  const { user } = useAuth();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const tabParam = searchParams.get("tab");
  const tabFromUrl = tabParam === TAB_CONTROLE ? TAB_CONTROLE : TAB_DEPENSES;
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
        <PageHeader title="Audit & contrôle" />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Audit & contrôle"
        subtitle="Dépenses à valider, anomalies caisse et alertes critiques."
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
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      {activeTab === TAB_DEPENSES && <CEOExpensesPage embedded />}
      {activeTab === TAB_CONTROLE && <CompagnieComptabilitePage />}
    </StandardLayoutWrapper>
  );
}
