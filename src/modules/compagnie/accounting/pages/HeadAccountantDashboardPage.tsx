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
  Landmark,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  ShoppingCart,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { ActionButton, MetricCard, SectionCard, StatusBadge } from "@/ui";
import { getUnifiedCompanyFinance } from "@/modules/finance/services/unifiedFinanceService";
import { listReportsValidatedByAgencyForCompany } from "@/modules/agence/services/shiftApi";
import { listTransferRequests } from "@/modules/agence/treasury/transferRequestsService";
import { listFinancialDocumentAnomalies } from "@/modules/finance/documents/financialDocumentAnomaliesService";
import {
  isCanonicalLedgerFailedPayment,
  isCanonicalLedgerPendingPayment,
  isCanonicalOnlinePaymentToMonitor,
  isCanonicalPendingOperatorPayment,
  loadCanonicalPaymentsForPeriod,
  type CanonicalPaymentMonitorRow,
} from "@/modules/finance/payments/canonicalPaymentMonitor";
import InfoTooltip from "@/shared/ui/InfoTooltip";
import {
  FINANCIAL_UI_TOOLTIPS,
  toAnomalyTypeLabel,
  toPaymentChannelLabel,
  toPaymentProviderLabel,
  toTechnicalFailureLabel,
} from "@/modules/finance/ui/financialLanguage";

type PeriodKey = "today" | "week" | "month";

type ShiftReportDoc = {
  id: string;
  agencyId?: string;
  agencyName?: string;
  status?: string;
  totalRevenue?: number;
  validatedByAgencyAt?: unknown;
  endAt?: unknown;
  updatedAt?: unknown;
  validationAudit?: { computedDifference?: number };
};

type PaymentDocLite = CanonicalPaymentMonitorRow;

type TransferRequestLite = {
  id: string;
  agencyId: string;
  amount: number;
  status: string;
  captureMode?: "normal" | "after_entry";
  manualDocumentUsed?: boolean;
  inTransitAt?: unknown;
  executedAt?: unknown;
  depositConfirmedAt?: unknown;
  receivedAt?: unknown;
  createdAt?: unknown;
};

type AgencyLiquidityRow = {
  agencyId: string | null;
  agencyName: string;
  cash: number;
  mobileMoney: number;
  bank: number;
  total: number;
};

type RiskAgencyRow = {
  agencyId: string;
  agencyName: string;
  pendingCash: number;
  failedPayments: number;
  delayedValidations: number;
  sessionsToProcess: number;
  score: number;
};

type DashboardData = {
  periodLabel: string;
  lastUpdatedAt: Date;
  unavailableSources: string[];
  realMoney: {
    total: number;
    cash: number;
    mobileMoney: number;
    bank: number;
  };
  realByAgency: AgencyLiquidityRow[];
  activity: {
    reservationCount: number;
    tickets: number;
    salesAmountHint: number;
    cashInPeriod: number;
    onlineInPeriod: number;
    encaissementsTotal: number;
    caNet: number;
  };
  pending: {
    pendingCashTotal: number;
    sessionsClosedNotValidated: number;
    sessionsValidatedAgencyNotLocked: number;
    paymentsPendingOperator: number;
    paymentsLedgerPending: number;
    paymentsLedgerFailed: number;
    transfersPending: number;
    transfersRegularized: number;
  };
  sessionsValidatedAgency: ShiftReportDoc[];
  failedPayments: PaymentDocLite[];
  alerts: Array<{ status: "danger" | "warning" | "info"; title: string; description: string }>;
  topRiskAgencies: RiskAgencyRow[];
  documentAnomalies: {
    open: number;
    critical: number;
    documentsMissing: number;
    signedScanMissing: number;
    printedNotSigned: number;
    signedNotArchived: number;
    byAgency: Array<{ key: string; label: string; openCount: number; totalCount: number; criticalCount: number }>;
    criticalRows: Array<{
      anomalyId: string;
      anomalyType: string;
      documentType: string | null;
      agencyId: string | null;
      businessReference: string | null;
      message: string;
    }>;
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

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function resolvePeriod(period: PeriodKey): { start: Date; end: Date; dateFrom: string; dateTo: string; label: string } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (period === "week") {
    start.setDate(start.getDate() - 6);
  } else if (period === "month") {
    start.setDate(start.getDate() - 29);
  }

  const label =
    period === "today"
      ? "Aujourd'hui"
      : period === "week"
        ? "7 derniers jours"
        : "30 derniers jours";

  return {
    start,
    end,
    dateFrom: toDateKey(start),
    dateTo: toDateKey(end),
    label,
  };
}

function pickShiftReportMs(row: ShiftReportDoc): number | null {
  return (
    toMillis(row.validatedByAgencyAt) ??
    toMillis(row.updatedAt) ??
    toMillis(row.endAt) ??
    null
  );
}

function parsePendingCashAgencyId(docId: string): string | null {
  const match = /^agency_(.+)_pending_cash$/.exec(docId);
  return match?.[1] ?? null;
}

function toAmount(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function inWindow(ms: number | null, startMs: number, endMs: number): boolean {
  if (ms == null) return false;
  return ms >= startMs && ms <= endMs;
}

export default function HeadAccountantDashboardPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<PeriodKey>("week");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);

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
              console.info(`[HeadAccountantDashboard] optional source blocked by rules: ${label}`);
            }
            return fallback;
          }
          console.warn(`[HeadAccountantDashboard] optional source unavailable (${label}):`, err);
          return fallback;
        }
      };

      const agenciesSnapPromise = resolveOptional(
        "agences",
        getDocs(collection(db, `companies/${companyId}/agences`)),
        null
      );
      const accountsSnapPromise = getDocs(query(collection(db, `companies/${companyId}/accounts`), limit(500)));
      const unifiedPromise = getUnifiedCompanyFinance(companyId, periodWindow.dateFrom, periodWindow.dateTo);
      const validatedAgencyPromise = resolveOptional(
        "shift_reports_validated_agency",
        listReportsValidatedByAgencyForCompany(companyId),
        [] as Awaited<ReturnType<typeof listReportsValidatedByAgencyForCompany>>
      );
      const shiftReportsPromise = resolveOptional(
        "shift_reports",
        getDocs(query(collectionGroup(db, "shiftReports"), where("companyId", "==", companyId), limit(500))),
        null
      );
      const paymentsPromise = resolveOptional(
        "payments",
        loadCanonicalPaymentsForPeriod(companyId, periodWindow.start, periodWindow.end, { limitCount: 1500 }),
        [] as PaymentDocLite[]
      );
      const transfersPromise = resolveOptional(
        "treasury_transfer_requests",
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
        [] as Array<TransferRequestLite>
      );
      const documentAnomaliesPromise = resolveOptional(
        "financial_document_anomalies",
        listFinancialDocumentAnomalies({
          companyId,
          filters: {
            periodStart: periodWindow.start,
            periodEnd: periodWindow.end,
            status: "open",
          },
        }),
        {
          anomalies: [],
          summary: {
            total: 0,
            open: 0,
            resolved: 0,
            ignored: 0,
            critical: 0,
            attention: 0,
            information: 0,
            documentsMissing: 0,
            signedScanMissing: 0,
            printedNotSigned: 0,
            signedNotArchived: 0,
            readyNotPrinted: 0,
          },
          byAgency: [],
          byDocumentType: [],
          byAnomalyType: [],
          byActor: [],
        }
      );

      const [
        agenciesSnap,
        accountsSnap,
        unifiedFinance,
        validatedAgencyRaw,
        shiftReportsSnap,
        payments,
        transferRequestsRaw,
        documentAnomalies,
      ] = await Promise.all([
        agenciesSnapPromise,
        accountsSnapPromise,
        unifiedPromise,
        validatedAgencyPromise,
        shiftReportsPromise,
        paymentsPromise,
        transfersPromise,
        documentAnomaliesPromise,
      ]);

      const agencyNameById = new Map<string, string>();
      agenciesSnap?.docs.forEach((d) => {
        const raw = d.data() as { nom?: string; nomAgence?: string; name?: string };
        agencyNameById.set(d.id, raw.nom ?? raw.nomAgence ?? raw.name ?? d.id);
      });

      // FINANCIAL_TRUTH: argent reel = comptes ledger uniquement (accounts), jamais payments/cashTransactions.
      const realByAgencyBuckets = new Map<string, AgencyLiquidityRow>();
      const pendingCashByAgency = new Map<string, number>();
      let pendingCashTotal = 0;

      const ensureBucket = (agencyId: string | null): AgencyLiquidityRow => {
        const key = agencyId ?? "_company";
        const existing = realByAgencyBuckets.get(key);
        if (existing) return existing;
        const created: AgencyLiquidityRow = {
          agencyId,
          agencyName:
            agencyId == null
              ? "Niveau compagnie"
              : agencyNameById.get(agencyId) ?? `Agence ${agencyId.slice(0, 8)}`,
          cash: 0,
          mobileMoney: 0,
          bank: 0,
          total: 0,
        };
        realByAgencyBuckets.set(key, created);
        return created;
      };

      accountsSnap.docs.forEach((d) => {
        const raw = d.data() as Record<string, unknown>;
        const balance = toAmount(raw.balance);
        const agencyId = typeof raw.agencyId === "string" ? raw.agencyId : null;
        const accountType = String(raw.type ?? "");
        const includeInLiquidity = raw.includeInLiquidity !== false;

        if (d.id.endsWith("_pending_cash")) {
          pendingCashTotal += balance;
          const pendingAgencyId = agencyId ?? parsePendingCashAgencyId(d.id);
          if (pendingAgencyId) {
            pendingCashByAgency.set(
              pendingAgencyId,
              (pendingCashByAgency.get(pendingAgencyId) ?? 0) + balance
            );
          }
        }

        if (!includeInLiquidity) return;
        if (accountType !== "cash" && accountType !== "mobile_money" && accountType !== "bank") return;

        const row = ensureBucket(agencyId);
        if (accountType === "cash") row.cash += balance;
        if (accountType === "mobile_money") row.mobileMoney += balance;
        if (accountType === "bank") row.bank += balance;
        row.total = row.cash + row.mobileMoney + row.bank;
      });

      const startMs = periodWindow.start.getTime();
      const endMs = periodWindow.end.getTime();

      const validatedAgencyRows: ShiftReportDoc[] = validatedAgencyRaw
        .map((row) => ({
          id: row.id,
          agencyId: row.agencyId,
          agencyName: typeof row.agencyName === "string" ? row.agencyName : undefined,
          status: String(row.status ?? "validated_agency"),
          totalRevenue: toAmount(row.totalRevenue),
          validatedByAgencyAt: row.validatedByAgencyAt,
          endAt: row.endAt,
          updatedAt: row.updatedAt,
          validationAudit: row.validationAudit as { computedDifference?: number } | undefined,
        }))
        .filter((row) => inWindow(pickShiftReportMs(row), startMs, endMs));

      const shiftReports: ShiftReportDoc[] = (shiftReportsSnap?.docs ?? [])
        .map((d) => {
          const raw = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            agencyId: typeof raw.agencyId === "string" ? raw.agencyId : undefined,
            status: String(raw.status ?? ""),
            totalRevenue: toAmount(raw.totalRevenue ?? raw.montant),
            validatedByAgencyAt: raw.validatedByAgencyAt,
            endAt: raw.endAt,
            updatedAt: raw.updatedAt,
            validationAudit: raw.validationAudit as { computedDifference?: number } | undefined,
          };
        })
        .filter((row) => inWindow(pickShiftReportMs(row), startMs, endMs));

      const pendingValidationRows = shiftReports.filter((row) => row.status === "pending_validation");

      const paymentsPendingOperator = payments.filter(isCanonicalPendingOperatorPayment);
      const paymentsLedgerPending = payments.filter(isCanonicalLedgerPendingPayment);
      const paymentsLedgerFailed = payments.filter(isCanonicalLedgerFailedPayment);
      const onlinePaymentsToMonitor = payments.filter(isCanonicalOnlinePaymentToMonitor);

      const transferRequests = (transferRequestsRaw as Array<TransferRequestLite>).filter((req) =>
        inWindow(toMillis(req.createdAt), startMs, endMs)
      );
      const regularizedTransferRequests = transferRequests.filter(
        (req) => req.captureMode === "after_entry" || req.manualDocumentUsed === true
      );

      const nowMs = Date.now();
      const delayedValidationByAgency = new Map<string, number>();
      validatedAgencyRows.forEach((row) => {
        const ms = pickShiftReportMs(row);
        if (ms == null) return;
        const ageHours = (nowMs - ms) / (1000 * 60 * 60);
        if (ageHours >= 24 && row.agencyId) {
          delayedValidationByAgency.set(
            row.agencyId,
            (delayedValidationByAgency.get(row.agencyId) ?? 0) + 1
          );
        }
      });

      const failedByAgency = new Map<string, number>();
      paymentsLedgerFailed.forEach((p) => {
        if (!p.agencyId) return;
        failedByAgency.set(p.agencyId, (failedByAgency.get(p.agencyId) ?? 0) + 1);
      });

      const sessionsByAgency = new Map<string, number>();
      [...validatedAgencyRows, ...pendingValidationRows].forEach((row) => {
        if (!row.agencyId) return;
        sessionsByAgency.set(row.agencyId, (sessionsByAgency.get(row.agencyId) ?? 0) + 1);
      });

      const riskAgencyIds = new Set<string>([
        ...pendingCashByAgency.keys(),
        ...failedByAgency.keys(),
        ...delayedValidationByAgency.keys(),
        ...sessionsByAgency.keys(),
      ]);

      const topRiskAgencies: RiskAgencyRow[] = [...riskAgencyIds]
        .map((agencyId) => {
          const pendingCash = pendingCashByAgency.get(agencyId) ?? 0;
          const failedPayments = failedByAgency.get(agencyId) ?? 0;
          const delayedValidations = delayedValidationByAgency.get(agencyId) ?? 0;
          const sessionsToProcess = sessionsByAgency.get(agencyId) ?? 0;
          const score =
            Math.min(5, pendingCash / 50000) +
            failedPayments * 3 +
            delayedValidations * 2 +
            sessionsToProcess;

          return {
            agencyId,
            agencyName: agencyNameById.get(agencyId) ?? `Agence ${agencyId.slice(0, 8)}`,
            pendingCash,
            failedPayments,
            delayedValidations,
            sessionsToProcess,
            score,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 8);

      const alerts: Array<{ status: "danger" | "warning" | "info"; title: string; description: string }> = [];
      if (paymentsLedgerFailed.length > 0) {
        alerts.push({
          status: "danger",
          title: `${paymentsLedgerFailed.length} operation(s) a corriger`,
          description:
            "Des paiements valides ne sont pas encore comptabilises dans le journal financier.",
        });
      }
      if (validatedAgencyRows.length > 0 || pendingValidationRows.length > 0) {
        alerts.push({
          status: "warning",
          title: `${validatedAgencyRows.length + pendingValidationRows.length} validations a traiter`,
          description:
            "Sessions/remises en attente de verification comptable ou verrouillage siege.",
        });
      }
      if (pendingCashTotal > 0) {
        alerts.push({
          status: "warning",
          title: "Argent en attente de consolidation detecte",
          description:
            "Ces montants restent operationnels et ne doivent pas etre inclus dans la tresorerie reelle.",
        });
      }
      if (transferRequests.length > 0) {
        alerts.push({
          status: "info",
          title: `${transferRequests.length} transfert(s) non finalise(s)`,
          description:
            "Demandes en autorisation ou en transit: exposition de tresorerie intermediaire.",
        });
      }
      if (regularizedTransferRequests.length > 0) {
        alerts.push({
          status: "warning",
          title: `${regularizedTransferRequests.length} transfert(s) regularise(s)`,
          description:
            "Operations saisies apres coup ou avec piece manuelle: controle chef comptable requis.",
        });
      }
      if (onlinePaymentsToMonitor.length > 0) {
        alerts.push({
          status: "info",
          title: `${onlinePaymentsToMonitor.length} paiement(s) en ligne a surveiller`,
          description:
            "Suivi operateur et coherence de comptabilisation requis avant consolidation definitive.",
        });
      }
      if (documentAnomalies.summary.critical > 0) {
        alerts.push({
          status: "danger",
          title: `${documentAnomalies.summary.critical} anomalies documentaires critiques`,
          description:
            "Pieces manquantes ou incoherentes detectees sur des flux finalises. Regularisation terrain requise.",
        });
      }
      if (unavailableSources.length > 0) {
        alerts.push({
          status: "warning",
          title: "Donnees partielles",
          description: `Certaines sources ne sont pas accessibles avec les permissions actuelles: ${unavailableSources.join(", ")}.`,
        });
      }

      const realByAgency = [...realByAgencyBuckets.values()].sort((a, b) => b.total - a.total);

      setData({
        periodLabel: periodWindow.label,
        lastUpdatedAt: new Date(),
        unavailableSources,
        realMoney: {
          total: unifiedFinance.realMoney.total,
          cash: unifiedFinance.realMoney.cash,
          mobileMoney: unifiedFinance.realMoney.mobileMoney,
          bank: unifiedFinance.realMoney.bank,
        },
        realByAgency,
        activity: {
          reservationCount: unifiedFinance.activity.sales.reservationCount,
          tickets: unifiedFinance.activity.sales.tickets,
          salesAmountHint: unifiedFinance.activity.sales.amountHint,
          cashInPeriod: unifiedFinance.activity.split.paiementsGuichet,
          onlineInPeriod: unifiedFinance.activity.split.paiementsEnLigne,
          encaissementsTotal: unifiedFinance.activity.encaissements.total,
          caNet: unifiedFinance.activity.caNet,
        },
        pending: {
          pendingCashTotal,
          sessionsClosedNotValidated: pendingValidationRows.length + validatedAgencyRows.length,
          sessionsValidatedAgencyNotLocked: validatedAgencyRows.length,
          paymentsPendingOperator: paymentsPendingOperator.length,
          paymentsLedgerPending: paymentsLedgerPending.length,
          paymentsLedgerFailed: paymentsLedgerFailed.length,
          transfersPending: transferRequests.length,
          transfersRegularized: regularizedTransferRequests.length,
        },
        sessionsValidatedAgency: validatedAgencyRows
          .sort((a, b) => (pickShiftReportMs(b) ?? 0) - (pickShiftReportMs(a) ?? 0))
          .slice(0, 12),
        failedPayments: paymentsLedgerFailed.slice(0, 12),
        alerts,
        topRiskAgencies,
        documentAnomalies: {
          open: documentAnomalies.summary.open,
          critical: documentAnomalies.summary.critical,
          documentsMissing: documentAnomalies.summary.documentsMissing,
          signedScanMissing: documentAnomalies.summary.signedScanMissing,
          printedNotSigned: documentAnomalies.summary.printedNotSigned,
          signedNotArchived: documentAnomalies.summary.signedNotArchived,
          byAgency: documentAnomalies.byAgency.slice(0, 10),
          criticalRows: documentAnomalies.anomalies
            .filter((row) => row.severity === "critique" && row.status === "open")
            .slice(0, 10)
            .map((row) => ({
              anomalyId: row.anomalyId,
              anomalyType: row.anomalyType,
              documentType: row.documentType,
              agencyId: row.agencyId,
              businessReference: row.businessReference,
              message: row.message,
            })),
        },
      });
    } catch (err) {
      console.error("[HeadAccountantDashboard] load failed:", err);
      setError(err instanceof Error ? err.message : "Erreur de chargement du tableau de bord.");
    } finally {
      setLoading(false);
    }
  }, [companyId, periodWindow.dateFrom, periodWindow.dateTo, periodWindow.end, periodWindow.label, periodWindow.start]);

  useEffect(() => {
    void load();
  }, [load]);

  const basePath = `/compagnie/${companyId}/accounting`;

  const networkPriorityItems = useMemo(() => {
    if (!data) return [];
    const rows: Array<{
      id: string;
      level: "critical" | "todo" | "info";
      title: string;
      detail: string;
      actionLabel: string;
      actionRoute: string;
    }> = [];

    if (data.pending.paymentsLedgerFailed > 0) {
      rows.push({
        id: "ledger-failed",
        level: "critical",
        title: `${data.pending.paymentsLedgerFailed} opération(s) à corriger`,
        detail: "Paiements validés non comptabilisés dans le journal financier.",
        actionLabel: "Ouvrir le contrôle",
        actionRoute: `${basePath}/controle-validations`,
      });
    }

    const pendingValidationTotal =
      data.pending.sessionsClosedNotValidated + data.pending.sessionsValidatedAgencyNotLocked;
    if (pendingValidationTotal > 0) {
      rows.push({
        id: "pending-validations",
        level: pendingValidationTotal > 25 ? "critical" : "todo",
        title: `${pendingValidationTotal} validation(s) réseau à traiter`,
        detail: "Remises/sessions en attente de verrouillage siège.",
        actionLabel: "Contrôle et validations",
        actionRoute: `${basePath}/controle-validations`,
      });
    }

    if (data.documentAnomalies.critical > 0 || data.documentAnomalies.documentsMissing > 0) {
      rows.push({
        id: "document-critical",
        level: "critical",
        title: `${data.documentAnomalies.critical} anomalie(s) documentaire(s) critique(s)`,
        detail: `${data.documentAnomalies.documentsMissing} document(s) manquant(s) à régulariser.`,
        actionLabel: "Ouvrir Documents",
        actionRoute: `${basePath}/documents`,
      });
    }

    if (data.pending.transfersPending > 0) {
      rows.push({
        id: "transfers-pending",
        level: "todo",
        title: `${data.pending.transfersPending} transfert(s) non finalisé(s)`,
        detail: "Suivre les flux en transit et les confirmations de réception.",
        actionLabel: "Voir Trésorerie réseau",
        actionRoute: `${basePath}/tresorerie-reseau`,
      });
    }

    if (data.topRiskAgencies.length > 0) {
      const top = data.topRiskAgencies[0];
      rows.push({
        id: "agency-risk",
        level: "info",
        title: `Agence la plus à risque: ${top.agencyName}`,
        detail: `Pending ${money(top.pendingCash)} · ${top.failedPayments} échec(s) de comptabilisation.`,
        actionLabel: "Voir tableau de risque",
        actionRoute: `${basePath}/controle-validations`,
      });
    }

    if (rows.length === 0) {
      rows.push({
        id: "ok",
        level: "info",
        title: "Aucune urgence réseau",
        detail: "Consolidation et documents globalement maîtrisés sur la période.",
        actionLabel: "Voir Journal et rapports",
        actionRoute: `${basePath}/journal-rapports`,
      });
    }

    return rows.slice(0, 5);
  }, [basePath, data, money]);

  const networkPriorityCount = useMemo(
    () => networkPriorityItems.filter((row) => row.level === "critical" || row.level === "todo").length,
    [networkPriorityItems]
  );

  if (!companyId) {
    return <div className="p-6 text-gray-500">Compagnie introuvable.</div>;
  }

  return (
    <div className="space-y-6">
      <SectionCard
        title="Tableau de bord financier"
        icon={Landmark}
        description="Vue consolidee Chef Comptable: argent reel, argent en attente et activite commerciale, strictement separes."
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
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
          <div>Periode: {data?.periodLabel ?? periodWindow.label}</div>
          <div>
            Mise a jour: {data?.lastUpdatedAt.toLocaleString("fr-FR") ?? "-"}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton variant="secondary" size="sm" onClick={() => navigate(`${basePath}/controle-validations`)}>
            Controle et validations
          </ActionButton>
          <ActionButton variant="secondary" size="sm" onClick={() => navigate(`${basePath}/tresorerie-reseau`)}>
            Tresorerie reseau
          </ActionButton>
          <ActionButton variant="secondary" size="sm" onClick={() => navigate(`${basePath}/depenses`)}>
            Depenses
          </ActionButton>
          <ActionButton variant="secondary" size="sm" onClick={() => navigate(`${basePath}/journal-rapports`)}>
            Journal et rapports
          </ActionButton>
          <ActionButton variant="secondary" size="sm" onClick={() => navigate(`${basePath}/documents`)}>
            Documents et archives
          </ActionButton>
        </div>
      </SectionCard>

      {error && (
        <SectionCard title="Erreur de chargement" icon={AlertTriangle}>
          <p className="text-sm text-red-700">{error}</p>
        </SectionCard>
      )}

      {!error && !data && loading && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-gray-500">
          Chargement du tableau de bord financier...
        </div>
      )}

      {!error && data && (
        <>
          <SectionCard
            title="À traiter maintenant"
            icon={ShieldAlert}
            description="Priorités réseau actionnables sans descendre dans les tableaux détaillés."
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-600">
                Lecture chef comptable: argent réel, argent en attente, anomalies documentaires et flux en transit.
              </p>
              <StatusBadge status={networkPriorityCount > 0 ? "warning" : "success"}>
                {networkPriorityCount > 0 ? `${networkPriorityCount} action(s)` : "Rien d'urgent"}
              </StatusBadge>
            </div>
            <div className="space-y-2">
              {networkPriorityItems.map((row) => {
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

          <SectionCard
            title="Bloc A - Argent reel"
            icon={Landmark}
            help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.realMoney} />}
            description="Source de verite: comptes du journal financier et ecritures comptabilisees. Aucun flux intermediaire n'est inclus."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Tresorerie reelle reseau"
                value={money(data.realMoney.total)}
                icon={Landmark}
                help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.realMoney} />}
              />
              <MetricCard label="Caisse agence validee" value={money(data.realMoney.cash)} icon={CheckCircle2} />
              <MetricCard label="Digital mobile money" value={money(data.realMoney.mobileMoney)} icon={ShoppingCart} />
              <MetricCard label="Banque compagnie" value={money(data.realMoney.bank)} icon={Landmark} />
            </div>

            <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Poche / agence</th>
                    <th className="px-3 py-2 text-right">Caisse validee</th>
                    <th className="px-3 py-2 text-right">Digital mobile money</th>
                    <th className="px-3 py-2 text-right">Banque</th>
                    <th className="px-3 py-2 text-right">Total reel</th>
                  </tr>
                </thead>
                <tbody>
                  {data.realByAgency.map((row) => (
                    <tr key={row.agencyId ?? "_company"} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-medium text-gray-900">{row.agencyName}</td>
                      <td className="px-3 py-2 text-right">{money(row.cash)}</td>
                      <td className="px-3 py-2 text-right">{money(row.mobileMoney)}</td>
                      <td className="px-3 py-2 text-right">{money(row.bank)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{money(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard
            title="Bloc B - Argent en attente / non consolide"
            icon={Clock3}
            help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.pendingMoney} />}
            description="Ces montants representent l'exposition operationnelle (remises en attente, validations, flux non comptabilises). Ils n'augmentent jamais la tresorerie reelle."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Argent en attente de consolidation"
                value={money(data.pending.pendingCashTotal)}
                icon={Clock3}
                help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.pendingCash} />}
              />
              <MetricCard
                label="Sessions cloturees non validees"
                value={data.pending.sessionsClosedNotValidated}
                icon={ListChecks}
              />
              <MetricCard
                label="Validees agence non verrouillees siege"
                value={data.pending.sessionsValidatedAgencyNotLocked}
                icon={ShieldAlert}
              />
              <MetricCard
                label="Paiements en attente operateur"
                value={data.pending.paymentsPendingOperator}
                icon={Clock3}
              />
              <MetricCard
                label="Comptabilisation en attente"
                value={data.pending.paymentsLedgerPending}
                icon={AlertTriangle}
                help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.posted} />}
              />
              <MetricCard
                label="Operations a corriger"
                value={data.pending.paymentsLedgerFailed}
                icon={AlertTriangle}
                critical={data.pending.paymentsLedgerFailed > 0}
                criticalMessage={data.pending.paymentsLedgerFailed > 0 ? "Reprise requise" : undefined}
                help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.toFix} />}
              />
            </div>

            <div className="mt-3">
              <StatusBadge status="info">
                Transferts demandes / en cours: {data.pending.transfersPending}
              </StatusBadge>
              {data.pending.transfersRegularized > 0 ? (
                <StatusBadge status="warning" className="ml-2">
                  Regularises apres coup: {data.pending.transfersRegularized}
                </StatusBadge>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-900">
                Pilotage documentaire C1.2 (controle reseau)
                <InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryControl} />
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  label="Anomalies documentaires ouvertes"
                  value={data.documentAnomalies.open}
                  icon={AlertTriangle}
                  critical={data.documentAnomalies.open > 0}
                  help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.documentaryAnomaly} />}
                />
                <MetricCard
                  label="Documents manquants"
                  value={data.documentAnomalies.documentsMissing}
                  icon={ShieldAlert}
                  critical={data.documentAnomalies.documentsMissing > 0}
                  help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.missingDocument} />}
                />
                <MetricCard
                  label="Scan signe manquant"
                  value={data.documentAnomalies.signedScanMissing}
                  icon={AlertTriangle}
                  critical={data.documentAnomalies.signedScanMissing > 0}
                  help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.missingSignedScan} />}
                />
                <MetricCard
                  label="Imprimes non signes"
                  value={data.documentAnomalies.printedNotSigned}
                  icon={Clock3}
                />
                <MetricCard
                  label="Signes non archives"
                  value={data.documentAnomalies.signedNotArchived}
                  icon={Clock3}
                />
                <MetricCard
                  label="Anomalies critiques documentaires"
                  value={data.documentAnomalies.critical}
                  icon={AlertTriangle}
                  critical={data.documentAnomalies.critical > 0}
                />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-amber-200 bg-white">
                  <div className="border-b border-amber-100 px-3 py-2 text-sm font-semibold text-gray-900">
                    Anomalies documentaires critiques
                  </div>
                  {data.documentAnomalies.criticalRows.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-gray-500">Aucune anomalie critique.</div>
                  ) : (
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Type</th>
                            <th className="px-3 py-2 text-left">Agence</th>
                            <th className="px-3 py-2 text-left">Reference</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.documentAnomalies.criticalRows.map((row) => (
                            <tr key={row.anomalyId} className="border-t border-gray-100">
                              <td className="px-3 py-2">{toAnomalyTypeLabel(row.anomalyType)}</td>
                              <td className="px-3 py-2">{row.agencyId ?? "Compagnie"}</td>
                              <td className="px-3 py-2">{row.businessReference ?? "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="rounded-lg border border-amber-200 bg-white">
                  <div className="border-b border-amber-100 px-3 py-2 text-sm font-semibold text-gray-900">
                    Agences les plus en retard (documents)
                  </div>
                  {data.documentAnomalies.byAgency.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-gray-500">Aucune agence en retard documentaire.</div>
                  ) : (
                    <div className="max-h-56 overflow-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left">Agence</th>
                            <th className="px-3 py-2 text-right">Ouvertes</th>
                            <th className="px-3 py-2 text-right">Critiques</th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.documentAnomalies.byAgency.map((row) => (
                            <tr key={row.key} className="border-t border-gray-100">
                              <td className="px-3 py-2">{row.label}</td>
                              <td className="px-3 py-2 text-right">{row.openCount}</td>
                              <td className="px-3 py-2 text-right text-rose-700">{row.criticalCount}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
                  Validations a traiter
                </div>
                {data.sessionsValidatedAgency.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">Aucune validation en attente sur la periode.</div>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Agence</th>
                          <th className="px-3 py-2 text-right">Montant</th>
                          <th className="px-3 py-2 text-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.sessionsValidatedAgency.map((row) => {
                          const agencyName =
                            row.agencyName ??
                            (row.agencyId ? row.agencyId : "Agence inconnue");
                          const ts = pickShiftReportMs(row);
                          return (
                            <tr key={row.id} className="border-t border-gray-100">
                              <td className="px-3 py-2">{agencyName}</td>
                              <td className="px-3 py-2 text-right">{money(toAmount(row.totalRevenue))}</td>
                              <td className="px-3 py-2 text-right">
                                {ts == null ? "-" : new Date(ts).toLocaleString("fr-FR")}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
                  Operations a corriger (comptabilisation)
                </div>
                {data.failedPayments.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">Aucun paiement a corriger sur la periode.</div>
                ) : (
                  <div className="max-h-72 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Paiement</th>
                          <th className="px-3 py-2 text-right">Montant</th>
                          <th className="px-3 py-2 text-left">Erreur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.failedPayments.map((p) => (
                          <tr key={p.id} className="border-t border-gray-100">
                            <td className="px-3 py-2">
                              <div className="font-medium">{p.id.slice(0, 10)}...</div>
                              <div className="text-xs text-gray-500">
                                {toPaymentChannelLabel(p.channel)}
                                {p.provider ? ` • ${toPaymentProviderLabel(p.provider)}` : ""}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">{money(p.amount)}</td>
                            <td className="px-3 py-2 text-xs text-red-700">
                              {toTechnicalFailureLabel(p.ledgerError)}
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

          <SectionCard
            title="Bloc C - Activite commerciale (hors tresorerie)"
            icon={ShoppingCart}
            help={<InfoTooltip label={FINANCIAL_UI_TOOLTIPS.commercialActivity} />}
            description="Libelles d'activite uniquement: ventes/reservations et encaissements periode. Ces chiffres ne representent pas l'argent disponible."
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                label="Volume reservations / ventes"
                value={`${data.activity.reservationCount} reservations`}
                icon={ShoppingCart}
              />
              <MetricCard label="Billets vendus (activite)" value={data.activity.tickets} icon={ShoppingCart} />
              <MetricCard
                label="Valeur commerciale periode"
                value={money(data.activity.salesAmountHint)}
                icon={ShoppingCart}
              />
              <MetricCard
                label="Activite guichet (encaissements periode)"
                value={money(data.activity.cashInPeriod)}
                icon={ShoppingCart}
              />
              <MetricCard
                label="Activite en ligne (encaissements periode)"
                value={money(data.activity.onlineInPeriod)}
                icon={ShoppingCart}
              />
              <MetricCard
                label="Resultat net activite periode"
                value={money(data.activity.caNet)}
                icon={ShoppingCart}
              />
            </div>

            <p className="mt-4 text-xs text-gray-600">
              Encaissements periode: {money(data.activity.encaissementsTotal)}. Ce bloc reste strictement separe des soldes
              de tresorerie du bloc A.
            </p>
          </SectionCard>

          <SectionCard
            title="Alertes critiques et top agences a risque"
            icon={ShieldAlert}
            description="Orientation controle financier: ecarts, argent en attente, operations a corriger, validations en retard."
          >
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <div className="space-y-3">
                {data.alerts.length === 0 ? (
                  <StatusBadge status="success">Aucune alerte critique sur la periode.</StatusBadge>
                ) : (
                  data.alerts.map((alert, idx) => (
                    <div key={`${alert.title}-${idx}`} className="rounded-xl border border-gray-200 p-4">
                      <div className="mb-2">
                        <StatusBadge status={alert.status}>{alert.title}</StatusBadge>
                      </div>
                      <p className="text-sm text-gray-700">{alert.description}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-xl border border-gray-200">
                <div className="border-b border-gray-100 px-4 py-3 text-sm font-semibold text-gray-900">
                  Top agences a risque
                </div>
                {data.topRiskAgencies.length === 0 ? (
                  <div className="px-4 py-6 text-sm text-gray-500">Aucun signal de risque agence sur la periode.</div>
                ) : (
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left">Agence</th>
                          <th className="px-3 py-2 text-right">Argent en attente de consolidation</th>
                          <th className="px-3 py-2 text-right">Operations a corriger</th>
                          <th className="px-3 py-2 text-right">Validations retard</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.topRiskAgencies.map((row) => (
                          <tr key={row.agencyId} className="border-t border-gray-100">
                            <td className="px-3 py-2 font-medium text-gray-900">{row.agencyName}</td>
                            <td className="px-3 py-2 text-right">{money(row.pendingCash)}</td>
                            <td className="px-3 py-2 text-right">{row.failedPayments}</td>
                            <td className="px-3 py-2 text-right">{row.delayedValidations}</td>
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




