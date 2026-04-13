import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  getDocs,
  Timestamp,
} from "firebase/firestore";
import {
  AlertTriangle,
  Download,
  FileText,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { ActionButton, MetricCard, SectionCard, StatusBadge } from "@/ui";
import { listFinancialTransactionsByPeriod } from "@/modules/compagnie/treasury/financialTransactions";
import { createMonthlyConsolidatedReportDocument } from "@/modules/finance/documents/financialDocumentsService";
import {
  isCanonicalLedgerFailedPayment,
  isCanonicalLedgerPendingPayment,
  loadCanonicalPaymentsForPeriod,
  type CanonicalPaymentMonitorRow,
} from "@/modules/finance/payments/canonicalPaymentMonitor";
import InfoTooltip from "@/shared/ui/InfoTooltip";
import {
  FINANCIAL_UI_TOOLTIPS,
  toFlowTypeLabel,
  toLedgerStatusLabel,
  toPaymentChannelLabel,
  toPaymentProviderLabel,
  toTechnicalFailureLabel,
  toWorkflowStatusLabel,
} from "@/modules/finance/ui/financialLanguage";

type PeriodKey = "today" | "week" | "month";

type PaymentLite = CanonicalPaymentMonitorRow;

type JournalRow = {
  id: string;
  ms: number | null;
  agencyId: string | null;
  agencyName: string;
  actor: string;
  channel: string;
  paymentProvider: string | null;
  flowType: string;
  status: string;
  amount: number;
  referenceType: string;
  referenceId: string;
  paymentStatus: string | null;
  paymentLedgerStatus: string | null;
  paymentLedgerError: string | null;
};

type JournalData = {
  agencyNameById: Record<string, string>;
  rows: JournalRow[];
  failedPayments: PaymentLite[];
  pendingLedgerPayments: PaymentLite[];
};

function toMillis(value: unknown): number | null {
  if (!value) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === "object") {
    const asObj = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number };
    if (typeof asObj.toMillis === "function") {
      const ms = asObj.toMillis();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof asObj.toDate === "function") {
      const d = asObj.toDate();
      return d instanceof Date ? d.getTime() : null;
    }
    if (typeof asObj.seconds === "number" && Number.isFinite(asObj.seconds)) {
      return asObj.seconds * 1000;
    }
  }
  return null;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolvePeriod(period: PeriodKey): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "week") start.setDate(start.getDate() - 6);
  if (period === "month") start.setDate(start.getDate() - 29);
  return {
    start,
    end,
    label: period === "today" ? "Aujourd'hui" : period === "week" ? "7 derniers jours" : "30 derniers jours",
  };
}

function csvEscape(value: unknown): string {
  const raw = String(value ?? "");
  if (raw.includes(",") || raw.includes("\n") || raw.includes('"')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers.map(csvEscape).join(","), ...rows.map((row) => row.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function HeadAccountantJournalReportsPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const money = useFormatCurrency();

  const [period, setPeriod] = useState<PeriodKey>("week");
  const [agencyFilter, setAgencyFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");
  const [channelFilter, setChannelFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<JournalData | null>(null);

  const periodWindow = useMemo(() => resolvePeriod(period), [period]);

  const handleGenerateMonthlyReport = useCallback(async () => {
    if (!companyId || !user?.uid) return;
    try {
      const created = await createMonthlyConsolidatedReportDocument({
        companyId,
        month: periodWindow.end,
        signataires: [
          { label: "Chef comptable", signerRole: "company_accountant" },
          { label: "Direction", signerRole: "admin_compagnie" },
        ],
        createdByUid: user.uid,
      });
      toast.success("Rapport mensuel consolide genere.");
      navigate(`/compagnie/${companyId}/accounting/documents/${created.id}/print`);
    } catch (err) {
      console.error("[HeadAccountantJournal] monthly report generation failed:", err);
      toast.error("Echec generation rapport mensuel consolide.");
    }
  }, [companyId, navigate, periodWindow.end, user?.uid]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    try {
      const agenciesSnapPromise = getDocs(collection(db, `companies/${companyId}/agences`));
      const txPromise = listFinancialTransactionsByPeriod(
        companyId,
        Timestamp.fromDate(periodWindow.start),
        Timestamp.fromDate(periodWindow.end)
      );
      const paymentsPromise = loadCanonicalPaymentsForPeriod(companyId, periodWindow.start, periodWindow.end, {
        limitCount: 2500,
      });

      const [agenciesSnap, txRows, payments] = await Promise.all([
        agenciesSnapPromise,
        txPromise,
        paymentsPromise,
      ]);

      const agencyNameById: Record<string, string> = {};
      agenciesSnap.docs.forEach((d) => {
        const raw = d.data() as { nom?: string; nomAgence?: string; name?: string };
        agencyNameById[d.id] = raw.nom ?? raw.nomAgence ?? raw.name ?? d.id;
      });

      const paymentsById = new Map<string, PaymentLite>();
      payments.forEach((p) => paymentsById.set(p.id, p));

      // FINANCIAL_TRUTH: journal principal = financialTransactions (ledger), avec enrichissement workflow payments en lecture seule.
      const rows: JournalRow[] = txRows.map((row) => {
        const paymentRef = row.referenceType === "payment" ? paymentsById.get(row.referenceId) : undefined;
        const metadata = (row.metadata ?? {}) as Record<string, unknown>;
        const actorFromMetadata =
          (typeof metadata.performedBy === "string" && metadata.performedBy) ||
          (typeof metadata.actorId === "string" && metadata.actorId) ||
          (typeof metadata.validatedBy === "string" && metadata.validatedBy) ||
          "";
        const actor = actorFromMetadata || paymentRef?.validatedBy || "—";
        const channel = String(row.paymentChannel ?? paymentRef?.channel ?? "autre");
        const ms = toMillis(row.performedAt) ?? toMillis(row.createdAt);
        const agencyId = row.agencyId ?? null;

        return {
          id: row.id,
          ms,
          agencyId,
          agencyName: agencyId ? agencyNameById[agencyId] ?? agencyId : "Niveau compagnie",
          actor,
          channel,
          paymentProvider:
            typeof row.paymentProvider === "string"
              ? row.paymentProvider
              : paymentRef?.provider ?? null,
          flowType: String(row.type ?? ""),
          status: String(row.status ?? ""),
          amount: Number(row.amount ?? 0),
          referenceType: String(row.referenceType ?? ""),
          referenceId: String(row.referenceId ?? ""),
          paymentStatus: paymentRef?.status ?? null,
          paymentLedgerStatus: paymentRef?.ledgerStatus ?? null,
          paymentLedgerError: paymentRef?.ledgerError ?? null,
        };
      });

      setData({
        agencyNameById,
        rows,
        failedPayments: payments.filter(isCanonicalLedgerFailedPayment),
        pendingLedgerPayments: payments.filter(isCanonicalLedgerPendingPayment),
      });
    } catch (err) {
      console.error("[HeadAccountantJournal] load failed:", err);
      setError(err instanceof Error ? err.message : "Erreur de chargement du journal financier.");
    } finally {
      setLoading(false);
    }
  }, [companyId, periodWindow.end, periodWindow.start]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredRows = useMemo(() => {
    if (!data) return [] as JournalRow[];

    const search = searchText.trim().toLowerCase();

    return data.rows.filter((row) => {
      if (agencyFilter && (row.agencyId ?? "") !== agencyFilter) return false;
      if (actorFilter && row.actor !== actorFilter) return false;
      if (channelFilter && row.channel !== channelFilter) return false;
      if (typeFilter && row.flowType !== typeFilter) return false;
      if (!search) return true;

      return [
        row.id,
        row.agencyName,
        row.actor,
        row.channel,
        row.paymentProvider ?? "",
        row.flowType,
        row.status,
        row.referenceType,
        row.referenceId,
      ]
        .join(" ")
        .toLowerCase()
        .includes(search);
    });
  }, [actorFilter, agencyFilter, channelFilter, data, searchText, typeFilter]);

  const actors = useMemo(() => {
    const set = new Set<string>();
    (data?.rows ?? []).forEach((row) => {
      if (row.actor && row.actor !== "—") set.add(row.actor);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [data]);

  const channels = useMemo(() => {
    const set = new Set<string>();
    (data?.rows ?? []).forEach((row) => {
      if (row.channel) set.add(row.channel);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [data]);

  const flowTypes = useMemo(() => {
    const set = new Set<string>();
    (data?.rows ?? []).forEach((row) => {
      if (row.flowType) set.add(row.flowType);
    });
    return [...set].sort((a, b) => a.localeCompare(b, "fr"));
  }, [data]);

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  const totalEntrees = filteredRows.filter((r) => r.amount > 0).reduce((sum, row) => sum + row.amount, 0);
  const totalSorties = filteredRows.filter((r) => r.amount < 0).reduce((sum, row) => sum + Math.abs(row.amount), 0);
  const net = totalEntrees - totalSorties;
  const correctionsCount = filteredRows.filter((row) => ["refund", "remittance", "bank_withdrawal"].includes(row.flowType)).length;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Journal et rapports"
        icon={FileText}
        help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.indicators} />}
        description="Audit financier, recherche et export sur le journal financier, avec suivi des anomalies de comptabilisation."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as PeriodKey)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
            >
              <option value="today">Aujourd'hui</option>
              <option value="week">7 jours</option>
              <option value="month">30 jours</option>
            </select>
            <ActionButton variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </ActionButton>
            <ActionButton variant="secondary" size="sm" onClick={() => void handleGenerateMonthlyReport()}>
              Generer rapport mensuel
            </ActionButton>
            <ActionButton
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/compagnie/${companyId}/accounting/documents`)}
            >
              Documents et archives
            </ActionButton>
          </div>
        }
      >
        <div className="text-sm text-gray-600">Periode active: {periodWindow.label}</div>
      </SectionCard>

      {error && (
        <SectionCard title="Erreur" icon={AlertTriangle}>
          <p className="text-sm text-red-700">{error}</p>
        </SectionCard>
      )}

      {!error && !data && loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          Chargement du journal financier...
        </div>
      )}

      {!error && data && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Lignes du journal (filtrees)" value={filteredRows.length} icon={FileText} />
            <MetricCard label="Entrees (periode)" value={money(totalEntrees)} icon={FileText} />
            <MetricCard label="Sorties (periode)" value={money(totalSorties)} icon={FileText} />
            <MetricCard label="Solde net de la periode" value={money(net)} icon={FileText} />
          </div>

          <SectionCard
            title="Journal financier"
            icon={Search}
            description="Filtres: agence, acteur, canal, type de flux, texte libre."
            right={
              <ActionButton
                variant="secondary"
                size="sm"
                onClick={() => {
                  const rows = filteredRows.map((row) => [
                    row.ms == null ? "" : new Date(row.ms).toISOString(),
                    row.agencyName,
                    row.actor,
                    toPaymentChannelLabel(row.channel),
                    toFlowTypeLabel(row.flowType),
                    toWorkflowStatusLabel(row.status),
                    String(row.amount),
                    row.referenceType,
                    row.referenceId,
                    toWorkflowStatusLabel(row.paymentStatus),
                    toLedgerStatusLabel(row.paymentLedgerStatus ?? ""),
                  ]);
                  downloadCsv(
                    `journal-financier-${toDateKey(new Date())}.csv`,
                    [
                      "date_operation",
                      "agence",
                      "acteur",
                      "canal",
                      "type_flux",
                      "statut_operation",
                      "montant",
                      "reference_type",
                      "reference_id",
                      "statut_paiement",
                      "statut_comptabilisation",
                    ],
                    rows
                  );
                }}
              >
                <Download className="h-4 w-4" />
                Export CSV
              </ActionButton>
            }
          >
            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
              <select
                value={agencyFilter}
                onChange={(e) => setAgencyFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
              >
                <option value="">Toutes agences</option>
                {Object.entries(data.agencyNameById).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
              >
                <option value="">Tous acteurs</option>
                {actors.map((actor) => (
                  <option key={actor} value={actor}>
                    {actor}
                  </option>
                ))}
              </select>

              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
              >
                <option value="">Tous canaux</option>
                {channels.map((channel) => (
                  <option key={channel} value={channel}>
                    {toPaymentChannelLabel(channel)}
                  </option>
                ))}
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
              >
                <option value="">Tous types de flux</option>
                {flowTypes.map((flowType) => (
                  <option key={flowType} value={flowType}>
                    {toFlowTypeLabel(flowType)}
                  </option>
                ))}
              </select>

              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Recherche rapide"
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Agence</th>
                    <th className="px-3 py-2 text-left">Acteur</th>
                    <th className="px-3 py-2 text-left">Canal</th>
                    <th className="px-3 py-2 text-left">Type flux</th>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100">
                      <td className="px-3 py-2">{row.ms == null ? "-" : new Date(row.ms).toLocaleString("fr-FR")}</td>
                      <td className="px-3 py-2">{row.agencyName}</td>
                      <td className="px-3 py-2">{row.actor}</td>
                      <td className="px-3 py-2">
                        <div>{toPaymentChannelLabel(row.channel)}</div>
                        {row.paymentProvider ? (
                          <div className="text-xs text-gray-500">{toPaymentProviderLabel(row.paymentProvider)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">{toFlowTypeLabel(row.flowType)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={row.status === "failed" ? "danger" : row.status === "pending" ? "warning" : "info"}>
                          {toWorkflowStatusLabel(row.status)}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-2 text-right font-medium">{money(row.amount)}</td>
                      <td className="px-3 py-2 text-xs text-gray-600">{row.referenceType}:{row.referenceId}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Historique anomalies et corrections"
            icon={AlertTriangle}
            help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryAnomaly} />}
            description="Anomalies de comptabilisation et volume des corrections du journal financier."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Paiements a corriger"
                value={data.failedPayments.length}
                icon={AlertTriangle}
                critical={data.failedPayments.length > 0}
                criticalMessage={data.failedPayments.length > 0 ? "A traiter" : undefined}
                help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.toFix} />}
              />
              <MetricCard
                label="Paiements en attente de comptabilisation"
                value={data.pendingLedgerPayments.length}
                icon={AlertTriangle}
                help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.posted} />}
              />
              <MetricCard label="Corrections du journal financier" value={correctionsCount} icon={FileText} />
              <MetricCard label="Flux recherches" value={filteredRows.length} icon={FileText} />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Comptabilisation a corriger</div>
                {data.failedPayments.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">Aucun paiement a corriger sur la periode.</div>
                ) : (
                  <div className="max-h-64 overflow-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {data.failedPayments.map((row) => (
                          <tr key={row.id} className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              <div className="font-medium">{row.id.slice(0, 12)}...</div>
                              <div className="text-xs text-gray-500">
                                {toPaymentChannelLabel(row.channel)}
                                {row.provider ? ` • ${toPaymentProviderLabel(row.provider)}` : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2"><StatusBadge status="danger">{toLedgerStatusLabel(row.ledgerStatus)}</StatusBadge></td>
                            <td className="px-3 py-2 text-xs text-red-700">{toTechnicalFailureLabel(row.ledgerError)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">Exports utiles</div>
                <div className="space-y-3 p-4">
                  <ActionButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const rows = data.failedPayments.map((row) => [
                        row.id,
                        toPaymentChannelLabel(row.channel),
                        row.provider ? toPaymentProviderLabel(row.provider) : "",
                        toWorkflowStatusLabel(row.status),
                        toLedgerStatusLabel(row.ledgerStatus),
                        row.validatedBy ?? "",
                        toTechnicalFailureLabel(row.ledgerError),
                      ]);
                      downloadCsv(
                        `anomalies-ledger-${toDateKey(new Date())}.csv`,
                        [
                          "paiement_id",
                          "canal",
                          "wallet_provider",
                          "workflow",
                          "comptabilisation",
                          "valide_par",
                          "detail_anomalie",
                        ],
                        rows
                      );
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Export anomalies de comptabilisation
                  </ActionButton>

                  <ActionButton
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const rows = filteredRows
                        .filter((row) => ["refund", "remittance", "bank_withdrawal"].includes(row.flowType))
                        .map((row) => [
                          row.ms == null ? "" : new Date(row.ms).toISOString(),
                          row.agencyName,
                          toFlowTypeLabel(row.flowType),
                          row.paymentProvider ? toPaymentProviderLabel(row.paymentProvider) : "",
                          toWorkflowStatusLabel(row.status),
                          String(row.amount),
                          row.referenceType,
                          row.referenceId,
                        ]);
                      downloadCsv(
                        `corrections-ledger-${toDateKey(new Date())}.csv`,
                        [
                          "date",
                          "agence",
                          "type_flux",
                          "wallet_provider",
                          "statut",
                          "montant",
                          "reference_type",
                          "reference_id",
                        ],
                        rows
                      );
                    }}
                  >
                    <Download className="h-4 w-4" />
                    Export corrections du journal financier
                  </ActionButton>
                </div>
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

