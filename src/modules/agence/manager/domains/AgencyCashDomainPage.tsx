/**
 * Domaine « Finances » — supervision chef d’agence.
 *
 * Lecture seule : cette page ne déclenche aucune écriture Firestore.
 * Les opérations de caisse restent dans l’espace comptable agence.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Banknote, BarChart3, FileText, Receipt, Wallet } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, EmptyState, ActionButton, table, tableRowClassName } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import AgencyCashStatement from "@/modules/agence/cashStatement/AgencyCashStatement";
import {
  buildAgencyCashStatementSummary,
  loadAgencyCashStatementCached,
} from "@/modules/agence/cashStatement/agencyCashStatementService";
import type {
  AgencyCashStatementRow,
  AgencyCashStatementSummary,
} from "@/modules/agence/cashStatement/agencyCashStatementTypes";
import { listExpenses, type ExpenseDoc } from "@/modules/compagnie/treasury/expenses";

type CashTabId = "overview" | "statement" | "expenses" | "transfers";
type ExpenseRow = ExpenseDoc & { id: string };

const tabs: Array<{ id: CashTabId; label: string; icon: typeof Banknote }> = [
  { id: "overview", label: "Vue d’ensemble", icon: BarChart3 },
  { id: "statement", label: "Relevé de caisse", icon: FileText },
  { id: "expenses", label: "Dépenses", icon: Receipt },
  { id: "transfers", label: "Versements", icon: Wallet },
];

const LEGACY_TAB_MAP: Record<string, CashTabId> = {
  "caisse-tresorerie": "overview",
  "caisse-depenses": "expenses",
  "caisse-sessions": "statement",
  "caisse-controle": "statement",
};

const CATEGORY_LABELS: Record<string, string> = {
  fuel: "Carburant",
  maintenance: "Maintenance",
  salary: "Salaires",
  toll: "Péage",
  operational: "Opérationnel",
  supplier_payment: "Fournisseur",
  other: "Autre",
};

function hashToTab(hash: string): CashTabId {
  const id = hash.replace("#", "");
  if (id === "overview" || id === "statement" || id === "expenses" || id === "transfers") return id;
  return LEGACY_TAB_MAP[id] ?? "overview";
}

function startOfCurrentMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
}

function endOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
}

function formatDate(value: unknown): string {
  const date =
    value instanceof Date
      ? value
      : value && typeof value === "object" && "toDate" in value
        ? (value as { toDate?: () => Date }).toDate?.()
        : null;
  return date instanceof Date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : "—";
}

function statusLabel(status?: string): string {
  if (status === "paid") return "Payée";
  if (status === "approved") return "Approuvée";
  if (status === "rejected") return "Refusée";
  if (status === "pending_manager") return "En attente chef";
  if (status === "confirmed" || status === "posted") return "Comptabilisé";
  return status || "—";
}

function creatorLabel(expense: ExpenseRow): string {
  const data = expense as unknown as Record<string, unknown>;
  const direct =
    data.createdByName ??
    data.createdByDisplayName ??
    data.accountantName ??
    data.createdByEmail ??
    data.createdBy;
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return "—";
}

function transferDestinationLabel(row: AgencyCashStatementRow): string {
  const label = `${row.label} ${row.typeLabel}`.toLowerCase();
  if (label.includes("banque")) return "Banque compagnie";
  if (label.includes("compagnie")) return "Compagnie";
  return row.label || "Compagnie";
}

export default function AgencyCashDomainPage() {
  const { user } = useAuth() as { user?: { companyId?: string; agencyId?: string; role?: string | string[] } };
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const { hash, pathname } = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<CashTabId>(() => hashToTab(hash));
  const [summary, setSummary] = useState<AgencyCashStatementSummary | null>(null);
  const [paidExpenses, setPaidExpenses] = useState<ExpenseRow[]>([]);
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingExpenses, setLoadingExpenses] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const overviewRange = useMemo(
    () => ({ from: startOfCurrentMonth(), to: endOfToday() }),
    []
  );

  const transferRows = useMemo(
    () => (summary?.rows ?? []).filter((row) => row.category === "transfer" || row.typeLabel.toLowerCase().includes("versement")),
    [summary]
  );

  const latestRows = useMemo(
    () => (summary?.rows ?? []).slice(0, 8),
    [summary]
  );

  useEffect(() => {
    setTab(hashToTab(hash));
  }, [hash]);

  const goTab = useCallback(
    (id: CashTabId) => {
      navigate({ pathname, hash: id }, { replace: true });
    },
    [navigate, pathname]
  );

  const loadOverview = useCallback(async (force = false) => {
    if (!companyId || !agencyId) {
      setLoadingOverview(false);
      return;
    }
    setLoadingOverview(true);
    setError(null);
    try {
      const result = await loadAgencyCashStatementCached(
        {
          companyId,
          agencyId,
          from: overviewRange.from,
          to: overviewRange.to,
        },
        {
          force,
          mode: "manager",
          includeLegacyLedger: false,
          tolerateSecondarySourceErrors: true,
        }
      );
      setSummary(buildAgencyCashStatementSummary(result, "all"));
    } catch (loadError) {
      const path = `companies/${companyId}/accounts/agency_${agencyId}_cash`;
      console.error("[AgencyCashDomain] Relevé supervision refusé ou indisponible", {
        path,
        role: user?.role ?? null,
        error: loadError,
      });
      setSummary(null);
      setError("Impossible de charger la synthèse de caisse. Le path exact est journalisé dans la console.");
    } finally {
      setLoadingOverview(false);
    }
  }, [agencyId, companyId, overviewRange.from, overviewRange.to, user?.role]);

  const loadExpenses = useCallback(async () => {
    if (!companyId || !agencyId) {
      setLoadingExpenses(false);
      return;
    }
    setLoadingExpenses(true);
    try {
      const rows = await listExpenses(companyId, {
        agencyId,
        status: "paid",
        limitCount: 100,
      });
      setPaidExpenses(rows);
    } catch (loadError) {
      console.error("[AgencyCashDomain] Dépenses payées indisponibles", {
        path: `companies/${companyId}/expenses`,
        filter: { agencyId, status: "paid" },
        role: user?.role ?? null,
        error: loadError,
      });
      setPaidExpenses([]);
    } finally {
      setLoadingExpenses(false);
    }
  }, [agencyId, companyId, user?.role]);

  useEffect(() => {
    void loadOverview();
    void loadExpenses();
  }, [loadExpenses, loadOverview]);

  const renderTabBar = (mobile = false) => (
    <div
      className={cn(
        mobile
          ? "fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t border-slate-200 bg-white/98 p-1.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.08)] dark:border-slate-700 dark:bg-slate-950/98 md:hidden"
          : "mb-5 hidden gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm dark:border-slate-700 dark:bg-slate-900 md:sticky md:top-0 md:z-20 md:flex"
      )}
      role="tablist"
      aria-label="Sections finances"
    >
      {tabs.map((item) => {
        const Icon = item.icon;
        const active = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => goTab(item.id)}
            className={cn(
              mobile
                ? "flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 text-[10px] font-semibold leading-tight transition-colors"
                : "flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors",
              active
                ? "border-indigo-600 bg-indigo-600 text-white shadow-sm dark:border-indigo-400 dark:bg-indigo-500/20 dark:text-indigo-100"
                : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{item.label}</span>
          </button>
        );
      })}
    </div>
  );

  const overview = (
    <div className="space-y-4">
      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {error}
        </div>
      )}
      {summary?.unavailableSources?.length ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          Certaines opérations détaillées ne sont pas disponibles.
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Solde caisse actuel" value={money(summary?.currentBalance ?? 0)} icon={Wallet} valueColorVar="#4f46e5" />
        <MetricCard label="Entrées période" value={money(summary?.totalEntries ?? 0)} icon={Banknote} valueColorVar="#059669" />
        <MetricCard label="Sorties période" value={money(summary?.totalExits ?? 0)} icon={Receipt} valueColorVar="#b91c1c" />
        <MetricCard label="Net période" value={money(summary?.net ?? 0)} icon={BarChart3} valueColorVar={(summary?.net ?? 0) >= 0 ? "#059669" : "#b91c1c"} />
      </div>

      <SectionCard
        title="Dernières opérations"
        icon={FileText}
        right={
          <ActionButton variant="secondary" onClick={() => goTab("statement")}>
            Voir le relevé complet
          </ActionButton>
        }
      >
        {loadingOverview ? (
          <div className="py-8 text-center text-sm text-slate-500">Chargement des opérations…</div>
        ) : latestRows.length === 0 ? (
          <EmptyState message="Aucune opération sur la période." />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Date</th>
                  <th className={table.th}>Type</th>
                  <th className={table.th}>Libellé</th>
                  <th className={table.thRight}>Entrée</th>
                  <th className={table.thRight}>Sortie</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {latestRows.map((row) => (
                  <tr key={row.id} className={tableRowClassName()}>
                    <td className={table.td}>{formatDate(row.date)}</td>
                    <td className={table.td}>{row.typeLabel}</td>
                    <td className={table.td}>{row.label}</td>
                    <td className={table.tdRight}>{row.entry ? money(row.entry) : "—"}</td>
                    <td className={table.tdRight}>{row.exit ? money(row.exit) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );

  const expenses = (
    <SectionCard title="Historique des dépenses payées" icon={Receipt}>
      {loadingExpenses ? (
        <div className="py-8 text-center text-sm text-slate-500">Chargement des dépenses…</div>
      ) : paidExpenses.length === 0 ? (
        <EmptyState message="Aucune dépense payée enregistrée." />
      ) : (
        <div className={table.wrapper}>
          <table className={table.base}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Date</th>
                <th className={table.th}>Catégorie</th>
                <th className={table.th}>Description</th>
                <th className={table.th}>Comptable / créateur</th>
                <th className={table.th}>Statut</th>
                <th className={table.thRight}>Montant</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {paidExpenses.map((expense) => (
                <tr key={expense.id} className={tableRowClassName()}>
                  <td className={table.td}>{formatDate(expense.paidAt ?? expense.createdAt)}</td>
                  <td className={table.td}>{CATEGORY_LABELS[expense.expenseCategory ?? expense.category] ?? expense.category}</td>
                  <td className={table.td}>{expense.description || "—"}</td>
                  <td className={table.td}>{creatorLabel(expense)}</td>
                  <td className={table.td}>{statusLabel(expense.status)}</td>
                  <td className={table.tdRight}>{money(Number(expense.amount || 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );

  const transfers = (
    <SectionCard title="Historique des versements" icon={Wallet}>
      {loadingOverview ? (
        <div className="py-8 text-center text-sm text-slate-500">Chargement des versements…</div>
      ) : transferRows.length === 0 ? (
        <EmptyState message="Aucun versement sur la période." />
      ) : (
        <div className={table.wrapper}>
          <table className={table.base}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Date</th>
                <th className={table.th}>Destination</th>
                <th className={table.th}>Statut</th>
                <th className={table.th}>Comptable</th>
                <th className={table.thRight}>Montant</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {transferRows.map((row) => (
                <tr key={row.id} className={tableRowClassName()}>
                  <td className={table.td}>{formatDate(row.date)}</td>
                  <td className={table.td}>{transferDestinationLabel(row)}</td>
                  <td className={table.td}>{statusLabel(row.status)}</td>
                  <td className={table.td}>—</td>
                  <td className={table.tdRight}>{money(row.exit || row.entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );

  return (
    <StandardLayoutWrapper className="pb-24 md:pb-8">
      <PageHeader
        title="Finances chef d’agence"
        subtitle="Lecture et supervision des mouvements de caisse de l’agence."
        icon={Banknote}
      />

      {renderTabBar(false)}
      {renderTabBar(true)}

      <div className="min-h-[50vh] rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4 dark:border-slate-700 dark:bg-slate-950">
        {tab === "overview" && <section id="overview" className="scroll-mt-28">{overview}</section>}
        {tab === "statement" && (
          <section id="statement" className="scroll-mt-28">
            <AgencyCashStatement mode="manager" includeLegacyLedger={false} tolerateSecondarySourceErrors />
          </section>
        )}
        {tab === "expenses" && <section id="expenses" className="scroll-mt-28">{expenses}</section>}
        {tab === "transfers" && <section id="transfers" className="scroll-mt-28">{transfers}</section>}
      </div>
    </StandardLayoutWrapper>
  );
}
