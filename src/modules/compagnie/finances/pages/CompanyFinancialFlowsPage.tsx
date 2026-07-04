import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Building2,
  RefreshCw,
  Search,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { MetricCard, SectionCard, StatusBadge } from "@/ui";
import { NetworkActivityPeriodBar } from "@/modules/compagnie/admin/components/CompanyDashboard/NetworkActivityPeriodBar";
import { listFinancialTransactionsByPeriod } from "@/modules/compagnie/treasury/financialTransactions";
import type {
  FinancialTransactionDoc,
  FinancialTransactionStatus,
  FinancialTransactionType,
} from "@/modules/compagnie/treasury/types";
import {
  DEFAULT_AGENCY_TIMEZONE,
  getEndOfDayForDate,
  getStartOfDayForDate,
} from "@/shared/date/dateUtilsTz";

type FinancialRow = FinancialTransactionDoc & { id: string };
type Direction = "in" | "out" | "transfer";
type BusinessOrigin =
  | "ticketing"
  | "online"
  | "courier"
  | "accounting"
  | "treasury"
  | "other";

const TYPE_LABELS: Record<FinancialTransactionType, string> = {
  payment_received: "Paiement reçu",
  transfer: "Transfert",
  transfer_to_bank: "Versement bancaire",
  expense: "Dépense",
  refund: "Remboursement",
  remittance: "Remise en caisse",
  bank_withdrawal: "Retrait bancaire",
};

const STATUS_LABELS: Record<FinancialTransactionStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  failed: "Échec",
  received: "Reçu",
  verified: "Vérifié",
  rejected: "Refusé",
  refunded: "Remboursé",
};

const ORIGIN_LABELS: Record<BusinessOrigin, string> = {
  ticketing: "Billetterie",
  online: "Réservation en ligne",
  courier: "Courrier",
  accounting: "Comptabilité",
  treasury: "Trésorerie",
  other: "Autre",
};

function agencyName(data: Record<string, unknown>): string {
  return String(data.nomAgence ?? data.nom ?? data.name ?? data.ville ?? "Agence");
}

function typeLabel(row: FinancialRow): string {
  return TYPE_LABELS[row.type] ?? String(row.type || "Mouvement");
}

function performedAt(row: FinancialRow): Date | null {
  return row.performedAt?.toDate?.() ?? row.createdAt?.toDate?.() ?? null;
}

function directionFor(row: FinancialRow): Direction {
  if (row.type === "payment_received") return "in";
  if (row.type === "expense" || row.type === "refund") return "out";
  return "transfer";
}

function originFor(row: FinancialRow): BusinessOrigin {
  const referenceType = String(row.referenceType ?? "");
  const channel = String(row.paymentChannel ?? "").toLowerCase();
  if (referenceType === "courier_session" || channel === "courrier") return "courier";
  if (
    channel === "online"
    || (referenceType === "reservation" && channel !== "guichet")
  ) {
    return "online";
  }
  if (
    referenceType === "shift"
    || referenceType === "cash_session"
    || channel === "guichet"
  ) {
    return "ticketing";
  }
  if (row.type === "expense" || row.type === "refund" || referenceType === "expense") {
    return "accounting";
  }
  if (
    row.type === "transfer"
    || row.type === "transfer_to_bank"
    || row.type === "remittance"
    || row.type === "bank_withdrawal"
  ) {
    return "treasury";
  }
  return "other";
}

function paymentMethodFor(row: FinancialRow): string {
  const method = String(row.paymentMethod ?? row.source ?? "other").toLowerCase();
  if (method === "cash") return "Espèces";
  if (method === "mobile_money") {
    return row.paymentProvider ? `Mobile Money · ${row.paymentProvider}` : "Mobile Money";
  }
  if (method === "bank" || method === "card") return "Banque";
  if (method === "mixed") return "Mixte";
  return "Autre";
}

function actorFor(row: FinancialRow): string {
  const metadata = row.metadata ?? {};
  const candidate =
    metadata.performedByName
    ?? metadata.createdByName
    ?? metadata.validatedByName
    ?? metadata.refundedByName
    ?? metadata.performedBy
    ?? metadata.createdBy
    ?? metadata.validatedBy
    ?? metadata.refundedBy;
  return candidate ? String(candidate) : "—";
}

function DirectionBadge({ direction }: { direction: Direction }) {
  if (direction === "in") return <StatusBadge status="success">Entrée</StatusBadge>;
  if (direction === "out") return <StatusBadge status="danger">Sortie</StatusBadge>;
  return <StatusBadge status="neutral">Transfert</StatusBadge>;
}

function TransactionStatus({ status }: { status: FinancialTransactionStatus }) {
  const variant =
    status === "confirmed" || status === "received" || status === "verified"
      ? "success"
      : status === "pending"
        ? "warning"
        : "danger";
  return <StatusBadge status={variant}>{STATUS_LABELS[status] ?? status}</StatusBadge>;
}

export default function CompanyFinancialFlowsPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const money = useFormatCurrency();
  const period = useGlobalPeriodContext();

  const [rows, setRows] = useState<FinancialRow[]>([]);
  const [agencies, setAgencies] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [agencyFilter, setAgencyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<FinancialTransactionType | "all">("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState<BusinessOrigin | "all">("all");
  const [visibleCount, setVisibleCount] = useState(20);

  const loadFlows = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [transactions, agenciesSnap] = await Promise.all([
        listFinancialTransactionsByPeriod(
          companyId,
          Timestamp.fromDate(
            getStartOfDayForDate(period.startDate, DEFAULT_AGENCY_TIMEZONE)
          ),
          Timestamp.fromDate(
            getEndOfDayForDate(period.endDate, DEFAULT_AGENCY_TIMEZONE)
          )
        ),
        getDocs(collection(db, "companies", companyId, "agences")),
      ]);
      const nextAgencies = new Map<string, string>();
      agenciesSnap.docs.forEach((agencyDoc) => {
        nextAgencies.set(
          agencyDoc.id,
          agencyName(agencyDoc.data() as Record<string, unknown>)
        );
      });
      setAgencies(nextAgencies);
      setRows(
        [...transactions].sort(
          (left, right) =>
            (performedAt(right)?.getTime() ?? 0) - (performedAt(left)?.getTime() ?? 0)
        )
      );
    } catch (loadError) {
      console.error("[CompanyFinancialFlows] load failed", loadError);
      setRows([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger les flux financiers."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, period.startDate, period.endDate]);

  useEffect(() => {
    void loadFlows();
  }, [loadFlows]);

  useEffect(() => {
    setVisibleCount(20);
  }, [search, agencyFilter, typeFilter, methodFilter, originFilter, period.startDate, period.endDate]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return rows.filter((row) => {
      const origin = originFor(row);
      const method = paymentMethodFor(row);
      const agency = row.agencyId ? agencies.get(row.agencyId) ?? row.agencyId : "Compagnie";
      const matchesSearch =
        !needle
        || agency.toLocaleLowerCase("fr").includes(needle)
        || String(row.referenceId ?? "").toLocaleLowerCase("fr").includes(needle)
        || typeLabel(row).toLocaleLowerCase("fr").includes(needle);
      return (
        matchesSearch
        && (agencyFilter === "all" || row.agencyId === agencyFilter)
        && (typeFilter === "all" || row.type === typeFilter)
        && (methodFilter === "all" || method === methodFilter)
        && (originFilter === "all" || origin === originFilter)
      );
    });
  }, [rows, agencies, search, agencyFilter, typeFilter, methodFilter, originFilter]);

  const totals = useMemo(() => {
    let incoming = 0;
    let outgoing = 0;
    const agencyIds = new Set<string>();
    filteredRows.forEach((row) => {
      const direction = directionFor(row);
      const amount = Math.abs(Number(row.amount) || 0);
      if (direction === "in") incoming += amount;
      if (direction === "out") outgoing += amount;
      if (row.agencyId) agencyIds.add(row.agencyId);
    });
    return { incoming, outgoing, movements: filteredRows.length, agencies: agencyIds.size };
  }, [filteredRows]);

  const methodOptions = useMemo(
    () => Array.from(new Set(rows.map(paymentMethodFor))).sort((a, b) => a.localeCompare(b, "fr")),
    [rows]
  );
  const visibleRows = filteredRows.slice(0, visibleCount);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">Flux financiers</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Journal consolidé des mouvements financiers de la compagnie
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadFlows()}
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

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total entrées" value={loading ? "—" : money(totals.incoming)} icon={ArrowDownLeft} />
        <MetricCard label="Total sorties" value={loading ? "—" : money(totals.outgoing)} icon={ArrowUpRight} />
        <MetricCard label="Mouvements" value={loading ? "—" : totals.movements} icon={ArrowRightLeft} />
        <MetricCard label="Agences concernées" value={loading ? "—" : totals.agencies} icon={Building2} />
      </div>

      <SectionCard title="Journal des mouvements" icon={ArrowRightLeft}>
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <label className="relative block sm:col-span-2 xl:col-span-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Agence ou référence"
              className="h-10 w-full rounded-lg border border-gray-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <select value={agencyFilter} onChange={(event) => setAgencyFilter(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="all">Toutes les agences</option>
            {Array.from(agencies.entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as FinancialTransactionType | "all")} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="all">Tous les types</option>
            {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select value={methodFilter} onChange={(event) => setMethodFilter(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="all">Tous les moyens</option>
            {methodOptions.map((method) => <option key={method} value={method}>{method}</option>)}
          </select>
          <select value={originFilter} onChange={(event) => setOriginFilter(event.target.value as BusinessOrigin | "all")} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900">
            <option value="all">Toutes les origines</option>
            {Object.entries(ORIGIN_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-gray-500">Chargement des mouvements…</p>
        ) : visibleRows.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">Aucun mouvement sur cette période.</p>
        ) : (
          <>
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[1320px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase text-gray-500 dark:border-gray-700">
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Agence</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3 text-right">Montant</th>
                    <th className="px-3 py-3">Sens</th>
                    <th className="px-3 py-3">Moyen</th>
                    <th className="px-3 py-3">Origine</th>
                    <th className="px-3 py-3">Référence</th>
                    <th className="px-3 py-3">Acteur</th>
                    <th className="px-3 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => (
                    <tr key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                      <td className="whitespace-nowrap px-3 py-4 text-gray-600 dark:text-gray-300">{performedAt(row)?.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) ?? "—"}</td>
                      <td className="px-3 py-4 font-medium">{row.agencyId ? agencies.get(row.agencyId) ?? row.agencyId : "Compagnie"}</td>
                      <td className="px-3 py-4">{typeLabel(row)}</td>
                      <td className="px-3 py-4 text-right font-semibold">{money(Math.abs(Number(row.amount) || 0))}</td>
                      <td className="px-3 py-4"><DirectionBadge direction={directionFor(row)} /></td>
                      <td className="px-3 py-4">{paymentMethodFor(row)}</td>
                      <td className="px-3 py-4">{ORIGIN_LABELS[originFor(row)]}</td>
                      <td className="max-w-44 truncate px-3 py-4" title={row.referenceId}>{row.referenceId || "—"}</td>
                      <td className="max-w-36 truncate px-3 py-4" title={actorFor(row)}>{actorFor(row)}</td>
                      <td className="px-3 py-4"><TransactionStatus status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:hidden">
              {visibleRows.map((row) => {
                const direction = directionFor(row);
                return (
                  <article key={row.id} className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-950 dark:text-white">{typeLabel(row)}</p>
                        <p className="mt-1 truncate text-xs text-gray-500">{row.agencyId ? agencies.get(row.agencyId) ?? row.agencyId : "Compagnie"}</p>
                      </div>
                      <p className={`shrink-0 font-semibold ${direction === "out" ? "text-red-700" : direction === "in" ? "text-emerald-700" : "text-gray-900 dark:text-white"}`}>
                        {money(Math.abs(Number(row.amount) || 0))}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <DirectionBadge direction={direction} />
                      <TransactionStatus status={row.status} />
                    </div>
                    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                      <div><dt className="text-xs text-gray-500">Moyen</dt><dd className="mt-0.5">{paymentMethodFor(row)}</dd></div>
                      <div><dt className="text-xs text-gray-500">Origine</dt><dd className="mt-0.5">{ORIGIN_LABELS[originFor(row)]}</dd></div>
                      <div><dt className="text-xs text-gray-500">Date</dt><dd className="mt-0.5">{performedAt(row)?.toLocaleDateString("fr-FR") ?? "—"}</dd></div>
                      <div><dt className="text-xs text-gray-500">Acteur</dt><dd className="mt-0.5 truncate">{actorFor(row)}</dd></div>
                    </dl>
                    {row.referenceId ? <p className="mt-3 truncate border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800">Réf. {row.referenceId}</p> : null}
                  </article>
                );
              })}
            </div>

            {visibleCount < filteredRows.length ? (
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={() => setVisibleCount((count) => count + 20)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200">
                  Voir 20 mouvements supplémentaires
                </button>
              </div>
            ) : null}
          </>
        )}
      </SectionCard>

      <p className="text-xs text-gray-500">
        Source unique : journal financialTransactions. Les collections opérationnelles ne sont pas additionnées afin d’éviter tout double comptage.
      </p>
    </div>
  );
}
