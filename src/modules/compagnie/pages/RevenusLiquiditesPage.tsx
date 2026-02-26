// Revenus & Liquidités — page fusionnée CEO (CA, ventes, évolution | cash, validé, en attente, trésorerie nette).
// Réutilise CompanyFinancesPage (Revenus) et CEOTreasuryPage (Liquidités) sans dupliquer la logique.
import React, { useState, useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { DollarSign, Wallet } from "lucide-react";
import { usePageHeader } from "@/contexts/PageHeaderContext";
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
  const { setHeader, resetHeader } = usePageHeader();

  React.useEffect(() => {
    setHeader({ title: "Revenus & Liquidités" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

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
      <div className="p-6">
        <p className="text-gray-500">Compagnie introuvable.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3">
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
                  ? "bg-white border border-b-0 border-gray-200 shadow-sm -mb-px"
                  : "text-gray-600 hover:bg-gray-50 border border-transparent",
              ].join(" ")}
              style={active ? { borderBottomColor: "white", color: theme.colors.primary } : {}}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 -mt-2">
        {activeTab === TAB_REVENUS
          ? "Revenus = chiffre d'affaires et ventes (sessions validées). Les montants peuvent différer des encaissements réels."
          : "Liquidités = argent réellement disponible (caisses, banques, mobile money). Les entrées/sorties sont enregistrées au fil de l'eau."}
      </p>

      {activeTab === TAB_REVENUS && <CompanyFinancesPage />}
      {activeTab === TAB_LIQUIDITES && <CEOTreasuryPage />}
    </div>
  );
}
