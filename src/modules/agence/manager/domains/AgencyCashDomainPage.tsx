/**
 * Domaine « Caisse » — priorité : valider les sessions & voir les écarts.
 * Trésorerie, dépenses et contrôle : onglets (pas de page interminable).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { Banknote, ClipboardCheck, Landmark, Receipt, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import ManagerFinancesPage from "../ManagerFinancesPage";
import AgencyTreasuryPage from "@/modules/agence/pages/AgencyTreasuryPage";
import ManagerExpensesPage from "../ManagerExpensesPage";
import CashSessionsPage from "@/modules/agence/cashControl/CashSessionsPage";
import { dispatchAgencyCashUiRefresh } from "@/modules/agence/constants/agencyCashUiRefresh";
import { useManagerAlertsContext } from "../ManagerAlertsContext";

type CashTabId = "caisse-sessions" | "caisse-tresorerie" | "caisse-depenses" | "caisse-controle";

function hashToTab(hash: string, canExpenses: boolean): CashTabId {
  const id = hash.replace("#", "");
  if (id === "caisse-tresorerie" || id === "caisse-controle") return id;
  if (id === "caisse-depenses" && canExpenses) return "caisse-depenses";
  return "caisse-sessions";
}

export default function AgencyCashDomainPage() {
  const { user } = useAuth() as { user?: { role?: string | string[] } };
  const roles: string[] = (Array.isArray(user?.role) ? user!.role : user?.role ? [user.role] : [])
    .map((role) => String(role ?? "").trim().toLowerCase())
    .filter(Boolean);
  const canValidateExpenses =
    roles.includes("chefagence") || roles.includes("superviseur") || roles.includes("admin_compagnie");
  const canAccessCashDomain =
    canValidateExpenses || roles.includes("agency_accountant") || roles.includes("admin_platforme");
  const { alerts } = useManagerAlertsContext();

  const { hash, pathname } = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<CashTabId>(() => hashToTab(hash, canValidateExpenses));

  useEffect(() => {
    setTab(hashToTab(hash, canValidateExpenses));
  }, [hash, canValidateExpenses]);

  const goTab = useCallback(
    (id: CashTabId) => {
      navigate({ pathname, hash: id }, { replace: true });
    },
    [navigate, pathname]
  );

  const tabs = useMemo(() => {
    const badgeByTab = {
      "caisse-sessions": 0,
      "caisse-tresorerie": 0,
      "caisse-depenses": 0,
      "caisse-controle": 0,
    } as Record<CashTabId, number>;
    alerts.forEach((alert) => {
      const id = String(alert.id ?? "");
      if (id.includes("pending-compta") || id.includes("pending-chef") || id.includes("stale-compta")) {
        badgeByTab["caisse-sessions"] += 1;
      }
      if (id.includes("pending-recon") || id.includes("pending-balance")) {
        badgeByTab["caisse-tresorerie"] += 1;
      }
      if (
        id.includes("cash-exceptions") ||
        id.includes("courier-discrepancies") ||
        id.includes("guichet-activity-litiges") ||
        id.includes("open-incidents")
      ) {
        badgeByTab["caisse-controle"] += 1;
      }
    });
    const base: Array<{ id: CashTabId; label: string; icon: typeof Banknote; badge?: number }> = [
      { id: "caisse-sessions", label: "Activité", icon: ClipboardCheck },
      { id: "caisse-tresorerie", label: "Trésorerie", icon: Landmark },
    ];
    if (canValidateExpenses) {
      base.push({ id: "caisse-depenses", label: "Dépenses", icon: Receipt, badge: badgeByTab["caisse-depenses"] });
    }
    base.push({ id: "caisse-controle", label: "Contrôle de caisse", icon: Wallet, badge: badgeByTab["caisse-controle"] });
    return base.map((tabRow) => ({
      ...tabRow,
      badge:
        tabRow.badge != null
          ? tabRow.badge
          : tabRow.id === "caisse-sessions"
            ? badgeByTab["caisse-sessions"]
            : tabRow.id === "caisse-tresorerie"
              ? badgeByTab["caisse-tresorerie"]
              : 0,
    }));
  }, [alerts, canValidateExpenses]);

  if (!canAccessCashDomain) {
    if (roles.includes("agentcourrier")) return <Navigate to="/agence/courrier" replace />;
    if (roles.includes("escale_agent") || roles.includes("escale_manager")) return <Navigate to="/agence/escale" replace />;
    if (roles.includes("agency_fleet_controller")) return <Navigate to="/agence/fleet" replace />;
    return <Navigate to="/agence/activite" replace />;
  }

  return (
    <StandardLayoutWrapper className="pb-24 md:pb-8">
      <PageHeader
        title="Supervision financière"
        subtitle="Vue chef d’agence : activité, trésorerie, écarts et vérifications."
        icon={Banknote}
      />

      {/* Onglets — sticky desktop ; barre fixe mobile */}
      <div
        className={cn(
          "mb-4 hidden gap-1 rounded-xl border border-gray-200 bg-gray-100/90 p-1 dark:border-slate-700 dark:bg-slate-800/80",
          "md:sticky md:top-0 md:z-20 md:flex"
        )}
        role="tablist"
        aria-label="Sections caisse"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => goTab(t.id)}
              className={cn(
                "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors",
                active
                  ? "bg-white text-gray-900 shadow-sm dark:bg-slate-900 dark:text-white"
                  : "text-gray-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-900/50"
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              {t.label}
              {t.badge && t.badge > 0 ? (
                <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-gray-200 bg-white/98 p-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:border-slate-700 dark:bg-slate-900/98",
          "md:hidden"
        )}
        role="tablist"
        aria-label="Sections caisse"
      >
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => goTab(t.id)}
              className={cn(
                "flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-[10px] font-semibold leading-tight",
                active ? "bg-indigo-600 text-white" : "text-gray-700 dark:text-slate-200"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">{t.label}</span>
              {t.badge && t.badge > 0 ? (
                <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white">
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="min-h-[50vh]">
        {tab === "caisse-sessions" && (
          <section id="caisse-sessions" className="scroll-mt-28">
            <ManagerFinancesPage embedded onAgencyFinancialUpdate={dispatchAgencyCashUiRefresh} />
          </section>
        )}
        {tab === "caisse-tresorerie" && (
          <section id="caisse-tresorerie" className="scroll-mt-28">
            <AgencyTreasuryPage embedded />
          </section>
        )}
        {tab === "caisse-depenses" && canValidateExpenses && (
          <section id="caisse-depenses" className="scroll-mt-28">
            <ManagerExpensesPage embedded />
          </section>
        )}
        {tab === "caisse-controle" && (
          <section id="caisse-controle" className="scroll-mt-28">
            <CashSessionsPage embedded />
          </section>
        )}
      </div>
    </StandardLayoutWrapper>
  );
}
