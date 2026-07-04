import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, limit, query, Timestamp } from "firebase/firestore";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  Download,
  FileText,
  Landmark,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { MetricCard, SectionCard, StatusBadge } from "@/ui";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { listFinancialTransactionsByPeriod, isConfirmedTransactionStatus } from "@/modules/compagnie/treasury/financialTransactions";
import type { FinancialTransactionDoc, FinancialTransactionType } from "@/modules/compagnie/treasury/types";
import {
  isLiquidityBucketType,
  parseStrictLedgerAccountType,
} from "@/modules/compagnie/treasury/ledgerAccountStrictTypes";
import { listAgencyCashAudits } from "@/modules/agence/comptabilite/agencyCashAuditService";
import {
  DEFAULT_AGENCY_TIMEZONE,
  getEndOfDayForDate,
  getStartOfDayForDate,
} from "@/shared/date/dateUtilsTz";

type FinancialRow = FinancialTransactionDoc & { id: string };
type PaymentBucket = "cash" | "bank" | "mobile_money" | "other";

type Agency = {
  id: string;
  name: string;
};

type LiquidityAccount = {
  id: string;
  agencyId: string | null;
  type: "cash" | "bank" | "mobile_money";
  balance: number;
};

type AuditAlert = {
  id: string;
  agencyId: string;
  agency: string;
  difference: number;
  date: Date | null;
};

const TYPE_LABELS: Record<FinancialTransactionType, string> = {
  payment_received: "Paiement reçu",
  transfer: "Transfert",
  transfer_to_bank: "Versement bancaire",
  expense: "Dépense",
  refund: "Remboursement",
  remittance: "Remise",
  bank_withdrawal: "Retrait bancaire",
};

const PAYMENT_LABELS: Record<PaymentBucket, string> = {
  cash: "Espèces",
  bank: "Banque",
  mobile_money: "Mobile Money",
  other: "Autre",
};

function agencyName(data: Record<string, unknown>): string {
  return String(data.nomAgence ?? data.nom ?? data.name ?? data.ville ?? "Agence");
}

function transactionDate(row: FinancialRow): Date | null {
  return row.performedAt?.toDate?.() ?? row.createdAt?.toDate?.() ?? null;
}

function paymentBucket(row: FinancialRow): PaymentBucket {
  const method = String(row.paymentMethod ?? row.source ?? "").toLowerCase();
  if (method === "cash") return "cash";
  if (method === "bank" || method === "card") return "bank";
  if (method === "mobile_money") return "mobile_money";
  return "other";
}

function mobileMoneyProviderLabel(provider: string | null | undefined): string {
  const raw = String(provider ?? "").trim();
  if (!raw) return "Mobile Money non identifié";

  const normalized = raw
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (normalized === "sarali") return "Sarali";
  if (normalized === "wave") return "Wave";
  if (normalized === "orange" || normalized === "orange money") return "Orange Money";
  if (normalized === "moov" || normalized === "moov money") return "Moov";

  return raw;
}

function paymentGroupLabel(row: FinancialRow): string {
  const bucket = paymentBucket(row);
  const providerIsReliable =
    row.metadata?.paymentProviderSource === "reservation.preuveVia";
  return bucket === "mobile_money"
    ? mobileMoneyProviderLabel(providerIsReliable ? row.paymentProvider : null)
    : PAYMENT_LABELS[bucket];
}

function flowDirection(row: FinancialRow): "in" | "out" | "transfer" {
  if (row.type === "payment_received") return "in";
  if (row.type === "expense" || row.type === "refund") return "out";
  return "transfer";
}

function typeLabel(row: FinancialRow): string {
  return TYPE_LABELS[row.type] ?? String(row.type || "Mouvement");
}

function escapeCsv(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function toDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const converter = (value as { toDate?: () => Date }).toDate;
    return typeof converter === "function" ? converter.call(value) : null;
  }
  return value instanceof Date ? value : null;
}

export default function CompanyFinancialReportsPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const money = useFormatCurrency();
  const period = useGlobalPeriodContext();

  const [transactions, setTransactions] = useState<FinancialRow[]>([]);
  const [accounts, setAccounts] = useState<LiquidityAccount[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [auditAlerts, setAuditAlerts] = useState<AuditAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState<PaymentBucket | "all">("all");
  const [typeFilter, setTypeFilter] = useState<FinancialTransactionType | "all">("all");

  const loadReport = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [transactionRows, agenciesSnap, accountsSnap] = await Promise.all([
        listFinancialTransactionsByPeriod(
          companyId,
          Timestamp.fromDate(getStartOfDayForDate(period.startDate, DEFAULT_AGENCY_TIMEZONE)),
          Timestamp.fromDate(getEndOfDayForDate(period.endDate, DEFAULT_AGENCY_TIMEZONE))
        ),
        getDocs(collection(db, "companies", companyId, "agences")),
        getDocs(query(collection(db, "companies", companyId, "accounts"), limit(500))),
      ]);
      const nextAgencies = agenciesSnap.docs.map((agencyDoc) => ({
        id: agencyDoc.id,
        name: agencyName(agencyDoc.data() as Record<string, unknown>),
      }));
      const nextAccounts: LiquidityAccount[] = [];
      accountsSnap.docs.forEach((accountDoc) => {
        const data = accountDoc.data() as Record<string, unknown>;
        try {
          const type = parseStrictLedgerAccountType(data, accountDoc.id);
          if (!isLiquidityBucketType(type) || data.includeInLiquidity === false || data.isActive === false) return;
          nextAccounts.push({
            id: accountDoc.id,
            agencyId: data.agencyId ? String(data.agencyId) : null,
            type,
            balance: Number(data.balance ?? 0) || 0,
          });
        } catch (parseError) {
          console.warn("[CompanyFinancialReports] compte ignoré", accountDoc.id, parseError);
        }
      });
      const audits = await Promise.all(
        nextAgencies.map(async (agency) => ({
          agency,
          rows: await listAgencyCashAudits(companyId, agency.id, 1),
        }))
      );
      setAgencies(nextAgencies);
      setAccounts(nextAccounts);
      setTransactions(
        transactionRows
          .filter((row) => isConfirmedTransactionStatus(row.status))
          .sort((left, right) => (transactionDate(right)?.getTime() ?? 0) - (transactionDate(left)?.getTime() ?? 0))
      );
      setAuditAlerts(
        audits.flatMap(({ agency, rows }) => {
          const latest = rows[0];
          const difference = latest ? Number(latest.difference) : 0;
          if (!latest || Math.abs(difference) <= 0.009) return [];
          return [{
            id: latest.id,
            agencyId: agency.id,
            agency: agency.name,
            difference,
            date: toDate(latest.validatedAt),
          }];
        })
      );
    } catch (loadError) {
      console.error("[CompanyFinancialReports] load failed", loadError);
      setError(loadError instanceof Error ? loadError.message : "Impossible de charger le rapport financier.");
    } finally {
      setLoading(false);
    }
  }, [companyId, period.startDate, period.endDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const agencyNames = useMemo(
    () => new Map(agencies.map((agency) => [agency.id, agency.name])),
    [agencies]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter(
        (row) =>
          (agencyFilter === "all" || row.agencyId === agencyFilter)
          && (paymentFilter === "all" || paymentBucket(row) === paymentFilter)
          && (typeFilter === "all" || row.type === typeFilter)
      ),
    [transactions, agencyFilter, paymentFilter, typeFilter]
  );

  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        const agencyMatches =
          agencyFilter === "all"
          || account.agencyId === agencyFilter;
        const paymentMatches =
          paymentFilter === "all"
          || (paymentFilter === "cash" && account.type === "cash")
          || (paymentFilter === "bank" && account.type === "bank")
          || (paymentFilter === "mobile_money" && account.type === "mobile_money");
        return agencyMatches && paymentMatches;
      }),
    [accounts, agencyFilter, paymentFilter]
  );

  const summary = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    filteredTransactions.forEach((row) => {
      const amount = Math.abs(Number(row.amount) || 0);
      const direction = flowDirection(row);
      if (direction === "in") incoming += amount;
      if (direction === "out") outgoing += amount;
    });
    const patrimony = filteredAccounts.reduce((sum, account) => sum + account.balance, 0);
    return { incoming, outgoing, net: incoming - outgoing, patrimony };
  }, [filteredTransactions, filteredAccounts]);

  const byAgency = useMemo(() => {
    const map = new Map<string, { incoming: number; outgoing: number }>();
    filteredTransactions.forEach((row) => {
      const key = row.agencyId ?? "_company";
      const current = map.get(key) ?? { incoming: 0, outgoing: 0 };
      const amount = Math.abs(Number(row.amount) || 0);
      if (flowDirection(row) === "in") current.incoming += amount;
      if (flowDirection(row) === "out") current.outgoing += amount;
      map.set(key, current);
    });
    return Array.from(map.entries())
      .map(([id, values]) => ({
        id,
        name: id === "_company" ? "Compagnie" : agencyNames.get(id) ?? id,
        ...values,
        net: values.incoming - values.outgoing,
      }))
      .sort((left, right) => Math.abs(right.net) - Math.abs(left.net));
  }, [filteredTransactions, agencyNames]);

  const byPayment = useMemo(() => {
    const totals = new Map<string, number>();
    filteredTransactions.forEach((row) => {
      const label = paymentGroupLabel(row);
      totals.set(label, (totals.get(label) ?? 0) + Math.abs(Number(row.amount) || 0));
    });
    return Array.from(totals.entries())
      .filter(([, amount]) => amount > 0)
      .sort((left, right) => right[1] - left[1]);
  }, [filteredTransactions]);

  const evolution = useMemo(() => {
    const netByDay = new Map<string, number>();
    [...filteredTransactions].reverse().forEach((row) => {
      const date = transactionDate(row);
      if (!date) return;
      const key = date.toLocaleDateString("fr-CA");
      const direction = flowDirection(row);
      const amount = Math.abs(Number(row.amount) || 0);
      const delta = direction === "in" ? amount : direction === "out" ? -amount : 0;
      netByDay.set(key, (netByDay.get(key) ?? 0) + delta);
    });
    const totalNet = Array.from(netByDay.values()).reduce((sum, value) => sum + value, 0);
    let estimated = summary.patrimony - totalNet;
    return Array.from(netByDay.entries()).map(([date, delta]) => {
      estimated += delta;
      return { date, value: estimated };
    });
  }, [filteredTransactions, summary.patrimony]);

  const significantMovements = useMemo(
    () =>
      [...filteredTransactions]
        .sort((left, right) => Math.abs(Number(right.amount) || 0) - Math.abs(Number(left.amount) || 0))
        .slice(0, 8),
    [filteredTransactions]
  );
  const visibleAlerts = useMemo(
    () => auditAlerts.filter((alert) => agencyFilter === "all" || alert.agencyId === agencyFilter),
    [auditAlerts, agencyFilter]
  );
  const maxEvolution = Math.max(1, ...evolution.map((row) => Math.abs(row.value)));

  const exportCsv = useCallback(() => {
    const header = ["Date", "Agence", "Type", "Moyen", "Montant", "Sens", "Référence", "Statut"];
    const lines = filteredTransactions.map((row) => [
      transactionDate(row)?.toLocaleString("fr-FR") ?? "",
      row.agencyId ? agencyNames.get(row.agencyId) ?? row.agencyId : "Compagnie",
      typeLabel(row),
      PAYMENT_LABELS[paymentBucket(row)],
      Math.abs(Number(row.amount) || 0),
      flowDirection(row) === "in" ? "Entrée" : flowDirection(row) === "out" ? "Sortie" : "Transfert",
      row.referenceId ?? "",
      row.status ?? "",
    ].map(escapeCsv).join(";"));
    const blob = new Blob([`\uFEFF${[header.map(escapeCsv).join(";"), ...lines].join("\n")}`], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rapport-financier-${period.startDate}-${period.endDate}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filteredTransactions, agencyNames, period.startDate, period.endDate]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">Rapports</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">Synthèse financière consolidée du réseau</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => period.setPreset("week")} className="inline-flex h-10 items-center rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            7 jours
          </button>
          <button type="button" onClick={exportCsv} disabled={loading || filteredTransactions.length === 0} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <Download className="h-4 w-4" /> Export CSV
          </button>
          <button type="button" onClick={() => void loadReport()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Actualiser
          </button>
        </div>
      </div>

      <NetworkActivityPeriodBar preset={period.preset} startDate={period.startDate} endDate={period.endDate} setPreset={period.setPreset} setCustomRange={period.setCustomRange} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <select value={agencyFilter} onChange={(event) => setAgencyFilter(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="all">Toutes les agences</option>
          {agencies.map((agency) => <option key={agency.id} value={agency.id}>{agency.name}</option>)}
        </select>
        <select value={paymentFilter} onChange={(event) => setPaymentFilter(event.target.value as PaymentBucket | "all")} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="all">Tous les moyens</option>
          {Object.entries(PAYMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as FinancialTransactionType | "all")} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
          <option value="all">Tous les mouvements</option>
          {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>

      {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Patrimoine financier" value={loading ? "—" : money(summary.patrimony)} icon={Landmark} />
        <MetricCard label="Entrées période" value={loading ? "—" : money(summary.incoming)} icon={ArrowDownLeft} />
        <MetricCard label="Sorties période" value={loading ? "—" : money(summary.outgoing)} icon={ArrowUpRight} />
        <MetricCard label="Solde net période" value={loading ? "—" : money(summary.net)} icon={Wallet} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Répartition par agence" icon={Building2}>
          {byAgency.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">Aucun flux sur cette période.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500 dark:border-gray-700"><th className="py-3 pr-3">Agence</th><th className="px-3 py-3 text-right">Entrées</th><th className="px-3 py-3 text-right">Sorties</th><th className="py-3 pl-3 text-right">Net</th></tr></thead>
                <tbody>{byAgency.map((row) => <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800"><td className="py-3 pr-3 font-medium">{row.name}</td><td className="px-3 py-3 text-right">{money(row.incoming)}</td><td className="px-3 py-3 text-right">{money(row.outgoing)}</td><td className={`py-3 pl-3 text-right font-semibold ${row.net < 0 ? "text-red-700" : "text-emerald-700"}`}>{money(row.net)}</td></tr>)}</tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Répartition par moyen" icon={ArrowRightLeft}>
          {byPayment.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">Aucun moyen de paiement disponible.</p> : (
            <div className="space-y-4">
              {byPayment.map(([label, amount]) => {
                const total = byPayment.reduce((sum, [, value]) => sum + value, 0);
                const ratio = total > 0 ? (amount / total) * 100 : 0;
                return <div key={label}><div className="mb-1.5 flex items-center justify-between gap-3 text-sm"><span className="font-medium">{label}</span><span className="font-semibold">{money(amount)}</span></div><div className="h-2 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800"><div className="h-full rounded-full bg-blue-600" style={{ width: `${ratio}%` }} /></div><p className="mt-1 text-right text-xs text-gray-500">{ratio.toFixed(1)}%</p></div>;
              })}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Évolution du patrimoine financier" icon={FileText}>
        {evolution.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">Aucune évolution disponible sur cette période.</p> : (
          <>
            <div className="flex min-h-48 items-end gap-2 overflow-x-auto border-b border-gray-200 pb-2 dark:border-gray-700">
              {evolution.map((row) => <div key={row.date} className="flex min-w-14 flex-1 flex-col items-center justify-end gap-2"><span className="text-[10px] font-medium text-gray-500">{money(row.value)}</span><div className={`w-full max-w-12 rounded-t ${row.value < 0 ? "bg-red-500" : "bg-emerald-500"}`} style={{ height: `${Math.max(8, (Math.abs(row.value) / maxEvolution) * 130)}px` }} /><span className="text-[10px] text-gray-500">{new Date(`${row.date}T12:00:00`).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" })}</span></div>)}
            </div>
            <p className="mt-3 text-xs text-gray-500">Trajectoire indicative ancrée sur les soldes actuels, reconstituée uniquement avec les entrées et sorties confirmées de la période. Elle ne remplace pas un arrêté comptable historique.</p>
          </>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Anomalies et écarts importants" icon={AlertTriangle}>
          {visibleAlerts.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">Aucun écart de caisse signalé.</p> : (
            <ul className="space-y-2">{visibleAlerts.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference)).map((alert) => <li key={alert.id} className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-3"><div><p className="text-sm font-semibold text-red-950">{alert.agency}</p><p className="mt-0.5 text-xs text-red-700">{alert.date?.toLocaleDateString("fr-FR") ?? "Dernier contrôle"}</p></div><span className="font-semibold text-red-800">{money(alert.difference)}</span></li>)}</ul>
          )}
        </SectionCard>

        <SectionCard title="Mouvements significatifs" icon={ArrowRightLeft}>
          {significantMovements.length === 0 ? <p className="py-8 text-center text-sm text-gray-500">Aucun mouvement disponible.</p> : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">{significantMovements.map((row) => <li key={row.id} className="flex items-center justify-between gap-4 py-3"><div className="min-w-0"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{typeLabel(row)}</p><StatusBadge status={flowDirection(row) === "in" ? "success" : flowDirection(row) === "out" ? "danger" : "neutral"}>{flowDirection(row) === "in" ? "Entrée" : flowDirection(row) === "out" ? "Sortie" : "Transfert"}</StatusBadge></div><p className="mt-1 truncate text-xs text-gray-500">{row.agencyId ? agencyNames.get(row.agencyId) ?? row.agencyId : "Compagnie"} · {transactionDate(row)?.toLocaleDateString("fr-FR") ?? "—"}</p></div><span className="shrink-0 text-sm font-semibold">{money(Math.abs(Number(row.amount) || 0))}</span></li>)}</ul>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
