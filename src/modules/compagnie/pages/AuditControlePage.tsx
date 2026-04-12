/**
 * Menu Audit & contrôle (audit CEO) : dépenses + contrôle financier.
 */
import React, { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { FileCheck, ShieldCheck } from "lucide-react";
import { StandardLayoutWrapper, PageHeader, PageTabs } from "@/ui";
import { useAuth } from "@/contexts/AuthContext";
import CEOExpensesPage from "./CEOExpensesPage";
import HeadAccountantControlPage from "@/modules/compagnie/accounting/pages/HeadAccountantControlPage";

const TAB_DEPENSES = "depenses";
const TAB_CONTROLE = "controle";

const TABS = [
  { key: TAB_DEPENSES, label: "Dépenses à valider", icon: ShieldCheck },
  { key: TAB_CONTROLE, label: "Contrôle financier", icon: FileCheck },
];

type TabKey = typeof TAB_DEPENSES | typeof TAB_CONTROLE;

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
        subtitle="Dépenses à valider et contrôle financier consolidé."
      />
      <PageTabs
        items={TABS}
        activeKey={activeTab}
        onChange={(key) => setTab(key as TabKey)}
      />
      {activeTab === TAB_DEPENSES && <CEOExpensesPage embedded />}
      {activeTab === TAB_CONTROLE && <HeadAccountantControlPage />}
    </StandardLayoutWrapper>
  );
}
