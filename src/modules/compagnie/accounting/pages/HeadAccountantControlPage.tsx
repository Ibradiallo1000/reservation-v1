import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { ActionButton, MetricCard, SectionCard, StatusBadge } from "@/ui";
import { listReportsValidatedByAgencyForCompany } from "@/modules/agence/services/shiftApi";
import { listTransferRequests } from "@/modules/agence/treasury/transferRequestsService";
import {
  isCanonicalLedgerFailedPayment,
  isCanonicalLedgerPendingPayment,
  isCanonicalOnlinePaymentToMonitor,
  loadCanonicalPaymentsForPeriod,
  type CanonicalPaymentMonitorRow,
} from "@/modules/finance/payments/canonicalPaymentMonitor";
import InfoTooltip from "@/shared/ui/InfoTooltip";
import {
  FINANCIAL_UI_TOOLTIPS,
  toLedgerStatusLabel,
  toPaymentChannelLabel,
  toPaymentProviderLabel,
  toTechnicalFailureLabel,
  toWorkflowStatusLabel,
} from "@/modules/finance/ui/financialLanguage";

type PeriodKey = "today" | "week" | "month";
type RegularizedFilter = "all" | "after_entry" | "manual_piece";

type ShiftReportRow = {
  id: string;
  agencyId?: string;
  status?: string;
  totalRevenue?: number;
  validationAudit?: { computedDifference?: number };
  validatedByAgencyAt?: unknown;
  endAt?: unknown;
  updatedAt?: unknown;
};

type PaymentRow = CanonicalPaymentMonitorRow;

type TransferRequestRow = {
  id: string;
  agencyId: string;
  flowType?: string;
  status: string;
  amount: number;
  createdAt?: unknown;
  executedAt?: unknown;
  inTransitAt?: unknown;
  depositConfirmedAt?: unknown;
  receivedAt?: unknown;
  captureMode?: "normal" | "after_entry";
  manualDocumentUsed?: boolean;
};

type ControlData = {
  agencyNameById: Record<string, string>;
  unavailableSources: string[];
  validatedAgencyRows: ShiftReportRow[];
  pendingValidationRows: ShiftReportRow[];
  discrepancyRows: ShiftReportRow[];
  onlineMonitorRows: PaymentRow[];
  ledgerPendingRows: PaymentRow[];
  ledgerFailedRows: PaymentRow[];
  transferPendingRows: TransferRequestRow[];
  transferExecutedRows: TransferRequestRow[];
  statusCounts: {
    pendingValidation: number;
    validatedAgency: number;
    validated: number;
    rejected: number;
  };
};

const optionalPermissionLogCache = new Set<string>();

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

function isPermissionDeniedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  return code === "permission-denied";
}

function toAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
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

function pickShiftMs(row: ShiftReportRow): number | null {
  return toMillis(row.validatedByAgencyAt) ?? toMillis(row.updatedAt) ?? toMillis(row.endAt) ?? null;
}

function inWindow(ms: number | null, startMs: number, endMs: number): boolean {
  if (ms == null) return false;
  return ms >= startMs && ms <= endMs;
}

export default function HeadAccountantControlPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<PeriodKey>("week");
  const [agencyFilter, setAgencyFilter] = useState<string>("");
  const [regularizedFilter, setRegularizedFilter] = useState<RegularizedFilter>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ControlData | null>(null);

  const periodWindow = useMemo(() => resolvePeriod(period), [period]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);

    try {
      const unavailableSources: string[] = [];
      const resolveOptional = async <T,>(label: string, sourcePromise: Promise<T>, fallback: T): Promise<T> => {
        try {
          return await sourcePromise;
        } catch (err) {
          if (!unavailableSources.includes(label)) unavailableSources.push(label);
          if (isPermissionDeniedError(err)) {
            if (!optionalPermissionLogCache.has(label)) {
              optionalPermissionLogCache.add(label);
              console.info(`[HeadAccountantControl] optional source blocked by rules: ${label}`);
            }
            return fallback;
          }
          console.warn(`[HeadAccountantControl] optional source unavailable (${label}):`, err);
          return fallback;
        }
      };

      const agenciesSnapPromise = resolveOptional(
        "agences",
        getDocs(collection(db, `companies/${companyId}/agences`)),
        null
      );
      const validatedAgencyPromise = resolveOptional(
        "shift_reports_validated_agency",
        listReportsValidatedByAgencyForCompany(companyId),
        [] as Awaited<ReturnType<typeof listReportsValidatedByAgencyForCompany>>
      );
      const shiftReportsPromise = resolveOptional(
        "shift_reports",
        getDocs(query(collectionGroup(db, "shiftReports"), where("companyId", "==", companyId), limit(1500))),
        null
      );
      const paymentsPromise = resolveOptional(
        "payments",
        loadCanonicalPaymentsForPeriod(companyId, periodWindow.start, periodWindow.end, { limitCount: 2000 }),
        [] as PaymentRow[]
      );
      const pendingTransfersPromise = resolveOptional(
        "treasury_transfer_requests_pending",
        listTransferRequests(companyId, {
          statusIn: [
            "pending_manager",
            "pending_head_accountant",
            "pending_dg",
            "authorized",
            "in_transit_bank",
            "in_transit_inter_agency",
          ],
          limitCount: 300,
        }),
        [] as Array<TransferRequestRow>
      );
      const executedTransfersPromise = resolveOptional(
        "treasury_transfer_requests_executed",
        listTransferRequests(companyId, {
          statusIn: ["deposited_bank", "received_inter_agency"],
          limitCount: 300,
        }),
        [] as Array<TransferRequestRow>
      );

      const [
        agenciesSnap,
        validatedAgencyRaw,
        shiftReportsSnap,
        payments,
        pendingTransfersRaw,
        executedTransfersRaw,
      ] = await Promise.all([
        agenciesSnapPromise,
        validatedAgencyPromise,
        shiftReportsPromise,
        paymentsPromise,
        pendingTransfersPromise,
        executedTransfersPromise,
      ]);

      const agencyNameById: Record<string, string> = {};
      agenciesSnap?.docs.forEach((d) => {
        const raw = d.data() as { nom?: string; nomAgence?: string; name?: string };
        agencyNameById[d.id] = raw.nom ?? raw.nomAgence ?? raw.name ?? d.id;
      });

      const startMs = periodWindow.start.getTime();
      const endMs = periodWindow.end.getTime();

      const validatedAgencyRows = validatedAgencyRaw
        .map((row) => ({
          id: row.id,
          agencyId: row.agencyId,
          status: String(row.status ?? "validated_agency"),
          totalRevenue: toAmount(row.totalRevenue),
          validationAudit: row.validationAudit as { computedDifference?: number } | undefined,
          validatedByAgencyAt: row.validatedByAgencyAt,
          endAt: row.endAt,
          updatedAt: row.updatedAt,
        }))
        .filter((row) => inWindow(pickShiftMs(row), startMs, endMs));

      const shiftReports = (shiftReportsSnap?.docs ?? [])
        .map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            agencyId: typeof raw.agencyId === "string" ? raw.agencyId : undefined,
            status: String(raw.status ?? ""),
            totalRevenue: toAmount(raw.totalRevenue ?? raw.montant),
            validationAudit: raw.validationAudit as { computedDifference?: number } | undefined,
            validatedByAgencyAt: raw.validatedByAgencyAt,
            endAt: raw.endAt,
            updatedAt: raw.updatedAt,
          } as ShiftReportRow;
        })
        .filter((row) => inWindow(pickShiftMs(row), startMs, endMs));

      const pendingValidationRows = shiftReports.filter((row) => row.status === "pending_validation");
      const discrepancyRows = shiftReports.filter(
        (row) => Math.abs(toAmount(row.validationAudit?.computedDifference)) > 0
      );

      const onlineMonitorRows = payments.filter(isCanonicalOnlinePaymentToMonitor);
      const ledgerPendingRows = payments.filter(isCanonicalLedgerPendingPayment);
      const ledgerFailedRows = payments.filter(isCanonicalLedgerFailedPayment);

      const transferPendingRows = (pendingTransfersRaw as Array<TransferRequestRow>).filter((row) =>
        inWindow(toMillis(row.createdAt), startMs, endMs)
      );
      const transferExecutedRows = (executedTransfersRaw as Array<TransferRequestRow>).filter((row) =>
        inWindow(
          toMillis(row.depositConfirmedAt) ??
            toMillis(row.receivedAt) ??
            toMillis(row.executedAt) ??
            toMillis(row.createdAt),
          startMs,
          endMs
        )
      );

      const statusCounts = {
        pendingValidation: shiftReports.filter((row) => row.status === "pending_validation").length,
        validatedAgency: shiftReports.filter((row) => row.status === "validated_agency").length,
        validated: shiftReports.filter((row) => row.status === "validated").length,
        rejected: shiftReports.filter((row) => String(row.status).includes("rejected")).length,
      };

      setData({
        agencyNameById,
        unavailableSources,
        validatedAgencyRows,
        pendingValidationRows,
        discrepancyRows,
        onlineMonitorRows,
        ledgerPendingRows,
        ledgerFailedRows,
        transferPendingRows,
        transferExecutedRows,
        statusCounts,
      });
    } catch (err) {
      console.error("[HeadAccountantControl] load failed:", err);
      setError(err instanceof Error ? err.message : "Erreur de chargement du controle financier.");
    } finally {
      setLoading(false);
    }
  }, [companyId, periodWindow.end, periodWindow.start]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data) return null;
    const matchAgency = (agencyId?: string | null) => {
      if (!agencyFilter) return true;
      return (agencyId ?? "") === agencyFilter;
    };
    const matchRegularized = (row: TransferRequestRow) => {
      if (regularizedFilter === "all") return true;
      if (regularizedFilter === "after_entry") return row.captureMode === "after_entry";
      return row.manualDocumentUsed === true || row.captureMode === "after_entry";
    };

    return {
      validatedAgencyRows: data.validatedAgencyRows.filter((row) => matchAgency(row.agencyId)),
      pendingValidationRows: data.pendingValidationRows.filter((row) => matchAgency(row.agencyId)),
      discrepancyRows: data.discrepancyRows.filter((row) => matchAgency(row.agencyId)),
      onlineMonitorRows: data.onlineMonitorRows.filter((row) => matchAgency(row.agencyId)),
      ledgerPendingRows: data.ledgerPendingRows.filter((row) => matchAgency(row.agencyId)),
      ledgerFailedRows: data.ledgerFailedRows.filter((row) => matchAgency(row.agencyId)),
      transferPendingRows: data.transferPendingRows.filter(
        (row) => matchAgency(row.agencyId) && matchRegularized(row)
      ),
      transferExecutedRows: data.transferExecutedRows.filter(
        (row) => matchAgency(row.agencyId) && matchRegularized(row)
      ),
    };
  }, [agencyFilter, data, regularizedFilter]);

  const paymentWatchRows = useMemo(() => {
    if (!filtered) return [] as PaymentRow[];
    const deduped = new Map<string, PaymentRow>();
    [...filtered.onlineMonitorRows, ...filtered.ledgerFailedRows].forEach((row) => {
      const current = deduped.get(row.id);
      if (!current || (current.ledgerStatus !== "failed" && row.ledgerStatus === "failed")) {
        deduped.set(row.id, row);
      }
    });
    return [...deduped.values()];
  }, [filtered]);

  const controlPriorityItems = useMemo(() => {
    if (!filtered) return [];
    const rows: Array<{
      id: string;
      level: "critical" | "todo" | "info";
      title: string;
      detail: string;
      actionLabel: string;
      actionRoute: string;
    }> = [];

    const sessionsToProcess = filtered.validatedAgencyRows.length + filtered.pendingValidationRows.length;
    if (sessionsToProcess > 0) {
      rows.push({
        id: "sessions",
        level: sessionsToProcess > 25 ? "critical" : "todo",
        title: `${sessionsToProcess} session(s) / remise(s) à traiter`,
        detail: "Validées agence ou clôturées en attente de contrôle siège.",
        actionLabel: "Voir sessions",
        actionRoute: `/compagnie/${companyId}/comptabilite/validation`,
      });
    }

    if (filtered.ledgerFailedRows.length > 0) {
      rows.push({
        id: "ledger-failed",
        level: "critical",
        title: `${filtered.ledgerFailedRows.length} opération(s) à corriger`,
        detail: "Erreurs de comptabilisation à reprendre dans le journal financier.",
        actionLabel: "Voir anomalies paiements",
        actionRoute: `/compagnie/${companyId}/accounting/consistency-diagnostics`,
      });
    }

    if (filtered.discrepancyRows.length > 0) {
      rows.push({
        id: "discrepancies",
        level: "todo",
        title: `${filtered.discrepancyRows.length} écart(s) attendu/réel`,
        detail: "Vérifier les écarts de validation avant consolidation.",
        actionLabel: "Voir écarts",
        actionRoute: `/compagnie/${companyId}/comptabilite/validation`,
      });
    }

    if (filtered.transferPendingRows.length > 0) {
      rows.push({
        id: "transfers",
        level: "todo",
        title: `${filtered.transferPendingRows.length} transfert(s) en attente / transit`,
        detail: "Confirmer les étapes d'autorisation, transit et réception.",
        actionLabel: "Voir transferts",
        actionRoute: `/compagnie/${companyId}/accounting/treasury-reseau`,
      });
    }

    if (rows.length === 0) {
      rows.push({
        id: "ok",
        level: "info",
        title: "Aucune urgence de contrôle",
        detail: "Flux financiers stables sur le périmètre filtré.",
        actionLabel: "Voir validations",
        actionRoute: `/compagnie/${companyId}/comptabilite/validation`,
      });
    }

    return rows.slice(0, 5);
  }, [companyId, filtered]);

  const controlPriorityCount = useMemo(
    () => controlPriorityItems.filter((row) => row.level === "critical" || row.level === "todo").length,
    [controlPriorityItems]
  );

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  const basePath = `/compagnie/${companyId}/accounting`;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Controle et validations"
        icon={ShieldCheck}
        help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.indicators} />}
        description="Controle des flux financiers avant consolidation: sessions/remises, paiements en ligne, anomalies de comptabilisation et coherence des validations."
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
            <select
              value={agencyFilter}
              onChange={(e) => setAgencyFilter(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
            >
              <option value="">Toutes les agences</option>
              {Object.entries(data?.agencyNameById ?? {}).map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
            <select
              value={regularizedFilter}
              onChange={(e) => setRegularizedFilter(e.target.value as RegularizedFilter)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
            >
              <option value="all">Toutes les saisies</option>
              <option value="after_entry">Saisies apres coup</option>
              <option value="manual_piece">Pieces manuelles / regularisees</option>
            </select>
            <ActionButton variant="secondary" size="sm" onClick={() => void load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </ActionButton>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <ActionButton variant="secondary" size="sm" onClick={() => navigate(`/compagnie/${companyId}/comptabilite/validation`)}>
            Ouvrir validations siege
          </ActionButton>
          <ActionButton variant="secondary" size="sm" onClick={() => navigate(`${basePath}/consistency-diagnostics`)}>
            Diagnostics journal financier
          </ActionButton>
          {data && data.unavailableSources.length > 0 ? (
            <StatusBadge status="warning">
              Donnees partielles: {data.unavailableSources.join(", ")}
            </StatusBadge>
          ) : null}
        </div>
      </SectionCard>

      {error && (
        <SectionCard title="Erreur" icon={AlertTriangle}>
          <p className="text-sm text-red-700">{error}</p>
        </SectionCard>
      )}

      {!error && !data && loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          Chargement du controle financier...
        </div>
      )}

      {!error && data && filtered && (
        <>
          <SectionCard
            title="Priorités du jour"
            icon={AlertTriangle}
            description="Uniquement les points à action immédiate côté contrôle réseau."
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-600">
                Filtre actif: {agencyFilter ? data.agencyNameById[agencyFilter] ?? agencyFilter : "Toutes les agences"}.
              </p>
              <StatusBadge status={controlPriorityCount > 0 ? "warning" : "success"}>
                {controlPriorityCount > 0 ? `${controlPriorityCount} action(s)` : "Rien d'urgent"}
              </StatusBadge>
            </div>
            <div className="space-y-2">
              {controlPriorityItems.map((row) => {
                const badgeStatus =
                  row.level === "critical" ? "danger" : row.level === "todo" ? "warning" : "info";
                const badgeLabel =
                  row.level === "critical" ? "Critique" : row.level === "todo" ? "À traiter" : "Info";
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={badgeStatus}>{badgeLabel}</StatusBadge>
                        <div className="text-sm font-medium text-slate-900">{row.title}</div>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-600">{row.detail}</div>
                    </div>
                    <ActionButton size="sm" variant="secondary" onClick={() => navigate(row.actionRoute)}>
                      {row.actionLabel}
                    </ActionButton>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Sessions / remises a controler"
              value={filtered.validatedAgencyRows.length + filtered.pendingValidationRows.length}
              icon={ShieldCheck}
            />
            <MetricCard
              label="Validees agence non verrouillees siege"
              value={filtered.validatedAgencyRows.length}
              icon={Clock3}
            />
            <MetricCard
              label="Ecarts attendu vs reel"
              value={filtered.discrepancyRows.length}
              icon={AlertTriangle}
              critical={filtered.discrepancyRows.length > 0}
              criticalMessage={filtered.discrepancyRows.length > 0 ? "Verification requise" : undefined}
            />
            <MetricCard
              label="Paiements en ligne a surveiller"
              value={filtered.onlineMonitorRows.length}
              icon={ShieldCheck}
            />
            <MetricCard
              label="Comptabilisation en attente"
              value={filtered.ledgerPendingRows.length}
              icon={Clock3}
              help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.posted} />}
            />
            <MetricCard
              label="Operations a corriger"
              value={filtered.ledgerFailedRows.length}
              icon={ShieldX}
              critical={filtered.ledgerFailedRows.length > 0}
              criticalMessage={filtered.ledgerFailedRows.length > 0 ? "Relance requise" : undefined}
              help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.toFix} />}
            />
          </div>

          <SectionCard
            title="Sessions et remises a traiter"
            icon={ShieldCheck}
            description="Elements valides agence mais non verrouilles siege, et sessions cloturees encore en attente de validation."
            noPad
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Statut</th>
                    <th className="px-3 py-2 text-left">Agence</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filtered.validatedAgencyRows, ...filtered.pendingValidationRows]
                    .sort((a, b) => (pickShiftMs(b) ?? 0) - (pickShiftMs(a) ?? 0))
                    .slice(0, 30)
                    .map((row) => (
                      <tr key={`${row.id}-${row.status}`} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          {row.status === "validated_agency" ? (
                            <StatusBadge status="warning">Validee agence</StatusBadge>
                          ) : (
                            <StatusBadge status="pending">Cloturee en attente</StatusBadge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.agencyId ? data.agencyNameById[row.agencyId] ?? row.agencyId : "Agence inconnue"}
                        </td>
                        <td className="px-3 py-2 text-right">{money(toAmount(row.totalRevenue))}</td>
                        <td className="px-3 py-2 text-right">
                          {pickShiftMs(row) == null ? "—" : new Date(pickShiftMs(row) as number).toLocaleString("fr-FR")}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Ecarts attendu vs reel"
            icon={AlertTriangle}
            description="Ecarts detectes sur validationAudit.computedDifference."
            noPad
          >
            {filtered.discrepancyRows.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">Aucun ecart sur la periode filtree.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Agence</th>
                      <th className="px-3 py-2 text-right">Montant session</th>
                      <th className="px-3 py-2 text-right">Ecart</th>
                      <th className="px-3 py-2 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.discrepancyRows
                      .sort((a, b) => Math.abs(toAmount(b.validationAudit?.computedDifference)) - Math.abs(toAmount(a.validationAudit?.computedDifference)))
                      .slice(0, 30)
                      .map((row) => {
                        const diff = toAmount(row.validationAudit?.computedDifference);
                        return (
                          <tr key={`disc-${row.id}`} className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              {row.agencyId ? data.agencyNameById[row.agencyId] ?? row.agencyId : "Agence inconnue"}
                            </td>
                            <td className="px-3 py-2 text-right">{money(toAmount(row.totalRevenue))}</td>
                            <td className={`px-3 py-2 text-right font-semibold ${diff === 0 ? "text-gray-700" : diff > 0 ? "text-amber-700" : "text-red-700"}`}>
                              {diff > 0 ? "+" : ""}{money(diff)}
                            </td>
                            <td className="px-3 py-2 text-right">
                              {pickShiftMs(row) == null ? "—" : new Date(pickShiftMs(row) as number).toLocaleString("fr-FR")}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Paiements en ligne et anomalies de comptabilisation"
            icon={ShieldX}
            help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryAnomaly} />}
            description="Suivi operateur digital et coherence de comptabilisation (en attente / a corriger)."
            noPad
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Paiement</th>
                    <th className="px-3 py-2 text-left">Agence</th>
                    <th className="px-3 py-2 text-right">Montant</th>
                    <th className="px-3 py-2 text-left">Workflow</th>
                    <th className="px-3 py-2 text-left">Comptabilisation</th>
                    <th className="px-3 py-2 text-left">Erreur</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentWatchRows.slice(0, 40).map((row) => (
                      <tr key={`pay-${row.id}`} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.id.slice(0, 12)}...</div>
                          <div className="text-xs text-gray-500">
                            {toPaymentChannelLabel(row.channel)}
                            {row.provider ? ` • ${toPaymentProviderLabel(row.provider)}` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          {row.agencyId ? data.agencyNameById[row.agencyId] ?? row.agencyId : "Niveau compagnie"}
                        </td>
                        <td className="px-3 py-2 text-right">{money(row.amount)}</td>
                        <td className="px-3 py-2">
                          {row.status === "pending" ? (
                            <StatusBadge status="pending">En attente operateur</StatusBadge>
                          ) : row.status === "validated" ? (
                            <StatusBadge status="info">Valide</StatusBadge>
                          ) : (
                            <StatusBadge status="neutral">{toWorkflowStatusLabel(row.status)}</StatusBadge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {row.ledgerStatus === "failed" ? (
                            <StatusBadge status="danger">{toLedgerStatusLabel(row.ledgerStatus)}</StatusBadge>
                          ) : row.ledgerStatus === "pending" ? (
                            <StatusBadge status="warning">{toLedgerStatusLabel(row.ledgerStatus)}</StatusBadge>
                          ) : (
                            <StatusBadge status="success">{toLedgerStatusLabel(row.ledgerStatus)}</StatusBadge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-red-700">
                          {toTechnicalFailureLabel(row.ledgerError)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Coherence des validations par acteur"
            icon={ShieldCheck}
            description="Lecture de progression du workflow: comptable agence -> chef comptable siege."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Cloturees en attente comptable agence" value={data.statusCounts.pendingValidation} icon={Clock3} />
              <MetricCard label="Validees par comptable agence" value={data.statusCounts.validatedAgency} icon={CheckCircle2} />
              <MetricCard label="Verrouillees au siege" value={data.statusCounts.validated} icon={CheckCircle2} />
              <MetricCard
                label="Rejetees"
                value={data.statusCounts.rejected}
                icon={AlertTriangle}
                critical={data.statusCounts.rejected > 0}
                criticalMessage={data.statusCounts.rejected > 0 ? "Verifier motifs" : undefined}
              />
            </div>
            <p className="mt-4 text-xs text-gray-600">
              Le chef comptable traite prioritairement les lignes validees par agence, sans modifier les regles de validation existantes.
            </p>
          </SectionCard>

          <SectionCard
            title="Transferts demandes, transit et finalises"
            icon={Clock3}
            description="Suivi des etapes d'autorisation, transit terrain et confirmation finale."
            noPad
          >
            <div className="grid grid-cols-1 xl:grid-cols-2">
              <div className="border-b border-gray-100 xl:border-b-0 xl:border-r">
                <div className="px-4 py-3 text-sm font-semibold text-gray-900">En attente</div>
                {filtered.transferPendingRows.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-gray-500">Aucune demande en attente.</div>
                ) : (
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {filtered.transferPendingRows.map((row) => (
                          <tr key={`tp-${row.id}`} className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              {data.agencyNameById[row.agencyId] ?? row.agencyId}
                              {row.captureMode === "after_entry" ? (
                                <div className="mt-1 text-[11px] text-amber-700">Saisi apres coup</div>
                              ) : null}
                              {row.manualDocumentUsed ? (
                                <div className="text-[11px] text-amber-700">Piece manuelle utilisee</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right">{money(toAmount(row.amount))}</td>
                            <td className="px-3 py-2 text-right">
                              <StatusBadge status="warning">{toWorkflowStatusLabel(row.status)}</StatusBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <div className="px-4 py-3 text-sm font-semibold text-gray-900">Finalises</div>
                {filtered.transferExecutedRows.length === 0 ? (
                  <div className="px-4 pb-4 text-sm text-gray-500">Aucun transfert finalise sur la periode.</div>
                ) : (
                  <div className="max-h-56 overflow-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {filtered.transferExecutedRows.map((row) => (
                          <tr key={`te-${row.id}`} className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              {data.agencyNameById[row.agencyId] ?? row.agencyId}
                              {row.captureMode === "after_entry" ? (
                                <div className="mt-1 text-[11px] text-amber-700">Saisi apres coup</div>
                              ) : null}
                              {row.manualDocumentUsed ? (
                                <div className="text-[11px] text-amber-700">Piece manuelle utilisee</div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2 text-right">{money(toAmount(row.amount))}</td>
                            <td className="px-3 py-2 text-right">
                              <StatusBadge status="success">{toWorkflowStatusLabel(row.status)}</StatusBadge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}

