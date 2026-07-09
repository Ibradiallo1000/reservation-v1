import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Receipt,
  RefreshCw,
  Search,
  Wallet,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { MetricCard, SectionCard, StatusBadge } from "@/ui";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { getAgencyLedgerLiquidityMap } from "@/modules/compagnie/treasury/ledgerAccounts";
import {
  isConfirmedTransactionStatus,
  listFinancialTransactionsByPeriod,
} from "@/modules/compagnie/treasury/financialTransactions";
import { sumComptaEncaissementsInRange } from "@/modules/agence/comptabilite/comptaEncaissementsService";
import { listAgencyCashAudits } from "@/modules/agence/comptabilite/agencyCashAuditService";

type NetworkStatus = "compliant" | "watch" | "critical" | "uncontrolled";

type AgencyFinancialRow = {
  id: string;
  name: string;
  cashBalance: number;
  physicalReceipts: number;
  expenses: number;
  transfers: number;
  lastControlAt: Date | null;
  difference: number | null;
  status: NetworkStatus;
};

const STATUS_LABELS: Record<NetworkStatus, string> = {
  compliant: "Conforme",
  watch: "À surveiller",
  critical: "Critique",
  uncontrolled: "Non contrôlé",
};

function agencyName(data: Record<string, unknown>): string {
  return String(data.nomAgence ?? data.nom ?? data.name ?? data.ville ?? "Agence");
}

function parsePeriodDate(value: string, endOfDay = false): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(
    year,
    (month ?? 1) - 1,
    day ?? 1,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
}

function toDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const converter = (value as { toDate?: () => Date }).toDate;
    return typeof converter === "function" ? converter.call(value) : null;
  }
  return value instanceof Date ? value : null;
}

function statusFor(cashBalance: number, difference: number | null): NetworkStatus {
  if (cashBalance < 0) return "critical";
  if (difference == null) return "uncontrolled";
  if (Math.abs(difference) > 0.009) return "watch";
  return "compliant";
}

function StatusPill({ status }: { status: NetworkStatus }) {
  const variant =
    status === "compliant"
      ? "success"
      : status === "critical"
        ? "danger"
        : status === "watch"
          ? "warning"
          : "neutral";
  return <StatusBadge status={variant}>{STATUS_LABELS[status]}</StatusBadge>;
}

export default function CompanyFinancialNetworkPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const money = useFormatCurrency();
  const period = useGlobalPeriodContext();

  const [rows, setRows] = useState<AgencyFinancialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<NetworkStatus | "all">("all");

  const loadNetwork = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const start = parsePeriodDate(period.startDate);
      const end = parsePeriodDate(period.endDate, true);
      const endExclusive = new Date(end.getTime() + 1);
      const [agenciesSnap, transactions] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "agences")),
        listFinancialTransactionsByPeriod(
          companyId,
          Timestamp.fromDate(start),
          Timestamp.fromDate(end)
        ),
      ]);

      const agencies = agenciesSnap.docs.map((agencyDoc) => ({
        id: agencyDoc.id,
        name: agencyName(agencyDoc.data() as Record<string, unknown>),
      }));
      const liquidityByAgency = await getAgencyLedgerLiquidityMap(
        companyId,
        agencies.map((agency) => agency.id)
      );

      const expensesByAgency = new Map<string, number>();
      const transfersByAgency = new Map<string, number>();
      transactions.forEach((transaction) => {
        if (!transaction.agencyId || !isConfirmedTransactionStatus(transaction.status)) return;
        const amount = Math.abs(Number(transaction.amount) || 0);
        if (transaction.type === "expense") {
          expensesByAgency.set(
            transaction.agencyId,
            (expensesByAgency.get(transaction.agencyId) ?? 0) + amount
          );
        }
        if (
          transaction.type === "transfer"
          || transaction.type === "transfer_to_bank"
          || transaction.type === "remittance"
        ) {
          transfersByAgency.set(
            transaction.agencyId,
            (transfersByAgency.get(transaction.agencyId) ?? 0) + amount
          );
        }
      });

      const nextRows = await Promise.all(
        agencies.map(async (agency): Promise<AgencyFinancialRow> => {
          const [receipts, audits] = await Promise.all([
            sumComptaEncaissementsInRange(companyId, agency.id, start, endExclusive),
            listAgencyCashAudits(companyId, agency.id, 1),
          ]);
          const latestAudit = audits[0];
          const difference = latestAudit ? Number(latestAudit.difference) : null;
          const cashBalance = liquidityByAgency[agency.id]?.cash ?? 0;

          return {
            id: agency.id,
            name: agency.name,
            cashBalance,
            physicalReceipts: receipts.total,
            expenses: expensesByAgency.get(agency.id) ?? 0,
            transfers: transfersByAgency.get(agency.id) ?? 0,
            lastControlAt: toDate(latestAudit?.validatedAt),
            difference,
            status: statusFor(cashBalance, difference),
          };
        })
      );

      nextRows.sort((left, right) => left.name.localeCompare(right.name, "fr"));
      setRows(nextRows);
    } catch (loadError) {
      console.error("[CompanyFinancialNetwork] load failed", loadError);
      setRows([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger le réseau financier."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, period.startDate, period.endDate]);

  useEffect(() => {
    void loadNetwork();
  }, [loadNetwork]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (result, row) => ({
          cash: result.cash + row.cashBalance,
          receipts: result.receipts + row.physicalReceipts,
          expenses: result.expenses + row.expenses,
          transfers: result.transfers + row.transfers,
        }),
        { cash: 0, receipts: 0, expenses: 0, transfers: 0 }
      ),
    [rows]
  );

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return rows.filter(
      (row) =>
        (!needle || row.name.toLocaleLowerCase("fr").includes(needle))
        && (agencyFilter === "all" || row.id === agencyFilter)
        && (statusFilter === "all" || row.status === statusFilter)
    );
  }, [rows, search, agencyFilter, statusFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">Réseau financier</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
            Contrôle des agences : caisse, encaissements, dépenses, remises, écarts et dernier contrôle.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadNetwork()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      <NetworkActivityPeriodBar
        preset={period.preset}
        startDate={period.startDate}
        endDate={period.endDate}
        setPreset={period.setPreset}
        setCustomRange={period.setCustomRange}
      />
      <div className="flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-900">
        {[
          ["day", "Aujourd'hui"],
          ["week", "Cette semaine"],
          ["month", "Ce mois"],
        ].map(([preset, label]) => (
          <button
            key={preset}
            type="button"
            onClick={() => period.setPreset(preset as any)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${
              period.preset === preset
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {label}
          </button>
        ))}
        <span className={`rounded-lg px-3 py-2 text-sm font-semibold ${
          period.preset === "custom"
            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
            : "text-slate-500 dark:text-slate-400"
        }`}>
          Personnalisé
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total caisse agences" value={loading ? "—" : money(totals.cash)} icon={Wallet} />
        <MetricCard label="Encaissements physiques" value={loading ? "—" : money(totals.receipts)} icon={CheckCircle2} />
        <MetricCard label="Dépenses agences" value={loading ? "—" : money(totals.expenses)} icon={Receipt} />
        <MetricCard label="Remises / versements" value={loading ? "—" : money(totals.transfers)} icon={Building2} />
      </div>

      <SectionCard
        title="Contrôle par agence"
        icon={Building2}
        description="Cette page ne présente pas les banques ni le Mobile Money compagnie."
      >
        <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(220px,1fr)_220px_200px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une agence"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <select
            value={agencyFilter}
            onChange={(event) => setAgencyFilter(event.target.value)}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="all">Toutes les agences</option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>{row.name}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as NetworkStatus | "all")}
            className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <option value="all">Tous les états</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-gray-500">Chargement du réseau financier…</div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-500">Aucune agence ne correspond aux filtres.</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1050px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase text-gray-500 dark:border-gray-700">
                    <th className="px-3 py-3">Agence</th>
                    <th className="px-3 py-3 text-right">Solde caisse</th>
                    <th className="px-3 py-3 text-right">Encaissements</th>
                    <th className="px-3 py-3 text-right">Dépenses</th>
                    <th className="px-3 py-3 text-right">Remises / versements</th>
                    <th className="px-3 py-3">Dernier contrôle</th>
                    <th className="px-3 py-3 text-right">Écart</th>
                    <th className="px-3 py-3">État</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                      <td className="px-3 py-4 font-medium text-gray-900 dark:text-white">{row.name}</td>
                      <td className="px-3 py-4 text-right font-semibold">{money(row.cashBalance)}</td>
                      <td className="px-3 py-4 text-right">{money(row.physicalReceipts)}</td>
                      <td className="px-3 py-4 text-right">{money(row.expenses)}</td>
                      <td className="px-3 py-4 text-right">{money(row.transfers)}</td>
                      <td className="px-3 py-4 text-gray-600 dark:text-gray-300">
                        {row.lastControlAt
                          ? row.lastControlAt.toLocaleDateString("fr-FR")
                          : "Aucun contrôle"}
                      </td>
                      <td className="px-3 py-4 text-right">
                        {row.difference == null ? "—" : money(row.difference)}
                      </td>
                      <td className="px-3 py-4"><StatusPill status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:hidden">
              {filteredRows.map((row) => (
                <article key={row.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate font-semibold text-gray-950 dark:text-white">{row.name}</h3>
                      <p className="mt-1 text-xl font-semibold">{money(row.cashBalance)}</p>
                    </div>
                    <StatusPill status={row.status} />
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div><dt className="text-gray-500">Encaissements</dt><dd className="font-medium">{money(row.physicalReceipts)}</dd></div>
                    <div><dt className="text-gray-500">Dépenses</dt><dd className="font-medium">{money(row.expenses)}</dd></div>
                    <div><dt className="text-gray-500">Versements</dt><dd className="font-medium">{money(row.transfers)}</dd></div>
                    <div><dt className="text-gray-500">Écart</dt><dd className="font-medium">{row.difference == null ? "—" : money(row.difference)}</dd></div>
                  </dl>
                  <div className="mt-4 flex items-center gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800">
                    {row.lastControlAt ? <Clock3 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {row.lastControlAt
                      ? `Dernier contrôle : ${row.lastControlAt.toLocaleDateString("fr-FR")}`
                      : "Aucun contrôle enregistré"}
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </SectionCard>

      <p className="text-xs text-gray-500">
        Les encaissements présentés sont les encaissements physiques des agences. Les paiements Mobile Money en ligne restent rattachés aux comptes compagnie.
      </p>
    </div>
  );
}
