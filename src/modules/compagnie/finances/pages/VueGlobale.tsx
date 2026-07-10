import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  collection,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Landmark,
  RefreshCw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { SectionCard, StatusBadge } from "@/ui";
import {
  getAgencyLedgerLiquidityMap,
  getLiquidityFromAccounts,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import {
  isConfirmedTransactionStatus,
  listFinancialTransactionsByPeriod,
} from "@/modules/compagnie/treasury/financialTransactions";
import { sumComptaEncaissementsInRange } from "@/modules/agence/comptabilite/comptaEncaissementsService";
import { listAgencyCashAudits } from "@/modules/agence/comptabilite/agencyCashAuditService";
import { PENDING_REMITTANCE_ALERT_HOURS } from "@/modules/agence/comptabilite/pendingCashSafety";
import { getCourierSessionLedgerTotal } from "@/modules/logistics/services/courierSessionLedger";

type RemittanceType = "ticket" | "courier";
type RemittancePriority = "normal" | "late" | "critical";
type AnomalySeverity = "danger" | "warning";

type PendingRemittance = {
  id: string;
  agencyId: string;
  agencyName: string;
  sessionId: string;
  type: RemittanceType;
  typeLabel: "Billetterie" | "Courrier";
  reference: string;
  amount: number;
  closedAt: Date | null;
  ageMinutes: number | null;
  priority: RemittancePriority;
  priorityLabel: "À traiter" | "En retard" | "Critique";
  priorityReason: string;
  agentLabel?: string;
  differenceAmount?: number;
};

type DashboardAnomaly = {
  id: string;
  agency: string;
  label: string;
  detail: string;
  value?: string;
  severity: AnomalySeverity;
};

type AgencySnapshot = {
  id: string;
  name: string;
  cashBalance: number;
  receiptsToday: number;
  expensesToday: number;
  latestCashDifference: number | null;
};

type DashboardSnapshot = {
  liquidity: {
    total: number;
    cash: number;
    bank: number;
    mobileMoney: number;
  };
  agencies: AgencySnapshot[];
  remittances: PendingRemittance[];
  anomalies: DashboardAnomaly[];
  fundsInTransitAmount: number;
};

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  liquidity: { total: 0, cash: 0, bank: 0, mobileMoney: 0 },
  agencies: [],
  remittances: [],
  anomalies: [],
  fundsInTransitAmount: 0,
};

const LATE_REMITTANCE_MINUTES = PENDING_REMITTANCE_ALERT_HOURS * 60;

function todayRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function agencyName(data: Record<string, unknown>): string {
  return String(data.nomAgence ?? data.nom ?? data.name ?? data.ville ?? "Agence");
}

function transactionIsExpense(row: {
  type?: string;
  status?: string;
  agencyId?: string | null;
}): boolean {
  return (
    row.type === "expense"
    && isConfirmedTransactionStatus(row.status as any)
    && Boolean(row.agencyId)
  );
}

function transactionIsInTransit(row: {
  type?: string;
  status?: string;
}): boolean {
  const type = row.type === "transfer_to_bank" ? "transfer" : row.type;
  return type === "transfer" && row.status === "pending";
}

function hasCashDifference(row: AgencySnapshot): boolean {
  return row.latestCashDifference != null && Math.abs(row.latestCashDifference) > 0.009;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const timestampLike = value as { toDate?: () => Date; seconds?: number };
  if (typeof timestampLike.toDate === "function") {
    const d = timestampLike.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof timestampLike.seconds === "number") {
    const d = new Date(timestampLike.seconds * 1000);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function ageMinutesSince(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
}

function formatAge(minutes: number | null): string {
  if (minutes == null) return "ancienneté inconnue";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours < 24) return mins > 0 ? `${hours} h ${mins} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} j ${restHours} h` : `${days} j`;
}

function formatTime(date: Date | null): string {
  if (!date) return "Heure inconnue";
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function numberFromFields(data: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const raw = data[key];
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function expectedTicketAmount(data: Record<string, unknown>): number {
  return numberFromFields(data, [
    "expectedAmount",
    "totalCash",
    "cashExpected",
    "totalRevenue",
    "amount",
    "montant",
    "totalAmount",
  ]);
}

function priorityFor(ageMinutes: number | null, differenceAmount = 0): Pick<PendingRemittance, "priority" | "priorityLabel" | "priorityReason"> {
  if (Math.abs(differenceAmount) > 0.009) {
    return {
      priority: "critical",
      priorityLabel: "Critique",
      priorityReason: "écart déclaré à la clôture",
    };
  }
  if (ageMinutes != null && ageMinutes >= LATE_REMITTANCE_MINUTES) {
    return {
      priority: "late",
      priorityLabel: "En retard",
      priorityReason: `dépasse ${PENDING_REMITTANCE_ALERT_HOURS} h`,
    };
  }
  return {
    priority: "normal",
    priorityLabel: "À traiter",
    priorityReason: "remise clôturée",
  };
}

function priorityRank(priority: RemittancePriority): number {
  if (priority === "critical") return 3;
  if (priority === "late") return 2;
  return 1;
}

function priorityBadgeStatus(priority: RemittancePriority): "danger" | "warning" | "success" {
  if (priority === "critical") return "danger";
  if (priority === "late") return "warning";
  return "success";
}

function compactNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function remittanceDetailSearchParams(remittance: PendingRemittance): string {
  return new URLSearchParams({
    agencyId: remittance.agencyId,
    sessionId: remittance.sessionId,
    sessionType: remittance.type === "ticket" ? "ticketing" : "courier",
    priority: remittance.priority,
  }).toString();
}

function buildTicketRemittance(params: {
  agencyId: string;
  agencyName: string;
  docId: string;
  data: Record<string, unknown>;
}): PendingRemittance {
  const closedAt = toDate(params.data.closedAt ?? params.data.endAt ?? params.data.updatedAt ?? params.data.createdAt);
  const ageMinutes = ageMinutesSince(closedAt);
  const differenceAmount = Number(params.data.ecart ?? params.data.difference ?? 0) || 0;
  return {
    id: `ticket-${params.agencyId}-${params.docId}`,
    agencyId: params.agencyId,
    agencyName: params.agencyName,
    sessionId: params.docId,
    type: "ticket",
    typeLabel: "Billetterie",
    reference: String(params.data.shiftId ?? params.docId),
    amount: expectedTicketAmount(params.data),
    closedAt,
    ageMinutes,
    ...priorityFor(ageMinutes, differenceAmount),
    agentLabel: String(params.data.userName ?? params.data.userCode ?? "").trim() || undefined,
    differenceAmount,
  };
}

async function buildCourierRemittance(params: {
  companyId: string;
  agencyId: string;
  agencyName: string;
  docId: string;
  data: Record<string, unknown>;
}): Promise<PendingRemittance> {
  const closedAt = toDate(params.data.closedAt ?? params.data.updatedAt ?? params.data.createdAt);
  const ageMinutes = ageMinutesSince(closedAt);
  const fallbackAmount = numberFromFields(params.data, [
    "expectedAmount",
    "ledgerSessionTotal",
    "validatedAmount",
    "amount",
    "totalAmount",
  ]);
  let ledgerAmount = fallbackAmount;
  try {
    ledgerAmount = await getCourierSessionLedgerTotal(params.companyId, params.docId, {
      agencyId: params.agencyId,
      paymentChannel: "courrier",
    });
  } catch (error) {
    console.warn("[CompanyAccountantDashboard] courier total unavailable", {
      companyId: params.companyId,
      agencyId: params.agencyId,
      sessionId: params.docId,
      error,
    });
  }

  return {
    id: `courier-${params.agencyId}-${params.docId}`,
    agencyId: params.agencyId,
    agencyName: params.agencyName,
    sessionId: params.docId,
    type: "courier",
    typeLabel: "Courrier",
    reference: String(params.data.sessionId ?? params.docId),
    amount: ledgerAmount,
    closedAt,
    ageMinutes,
    ...priorityFor(ageMinutes),
    agentLabel: String(params.data.agentCode ?? params.data.agentId ?? "").trim() || undefined,
  };
}

const VueGlobale: React.FC = () => {
  const { user } = useAuth() as any;
  const money = useFormatCurrency();
  const companyId = user?.companyId ?? "";

  const [snapshot, setSnapshot] = useState<DashboardSnapshot>(EMPTY_SNAPSHOT);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { start, end } = todayRange();
      const startTs = Timestamp.fromDate(start);
      const endTs = Timestamp.fromDate(end);

      const [agenciesSnap, liquidity, transactions, pendingTransactionsSnap] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "agences")),
        getLiquidityFromAccounts(companyId),
        listFinancialTransactionsByPeriod(companyId, startTs, endTs),
        getDocs(
          query(
            collection(db, "companies", companyId, "financialTransactions"),
            where("status", "==", "pending"),
            limit(500)
          )
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

      const expenseByAgency = new Map<string, number>();
      transactions.forEach((row) => {
        if (transactionIsExpense(row)) {
          const id = String(row.agencyId);
          expenseByAgency.set(
            id,
            (expenseByAgency.get(id) ?? 0) + Math.abs(Number(row.amount) || 0)
          );
        }
      });

      const fundsInTransitAmount = pendingTransactionsSnap.docs.reduce((sum, transactionDoc) => {
        const row = transactionDoc.data() as { type?: string; status?: string; amount?: number };
        return transactionIsInTransit(row)
          ? sum + Math.abs(Number(row.amount) || 0)
          : sum;
      }, 0);

      const allAnomalies: DashboardAnomaly[] = [];
      const allRemittances: PendingRemittance[] = [];

      const agencyRows = await Promise.all(
        agencies.map(async (agency): Promise<AgencySnapshot> => {
          const [receipts, audits, shiftsSnap, courierSnap, partialShiftsSnap, partialCourierSnap] = await Promise.all([
            sumComptaEncaissementsInRange(companyId, agency.id, start, new Date(end.getTime() + 1)),
            listAgencyCashAudits(companyId, agency.id, 1),
            getDocs(
              query(
                collection(db, "companies", companyId, "agences", agency.id, "shifts"),
                where("status", "==", "closed"),
                limit(100)
              )
            ),
            getDocs(
              query(
                collection(db, "companies", companyId, "agences", agency.id, "courierSessions"),
                where("status", "==", "CLOSED"),
                limit(100)
              )
            ),
            getDocs(
              query(
                collection(db, "companies", companyId, "agences", agency.id, "shifts"),
                where("remittanceStatus", "==", "partial_remittance"),
                limit(100)
              )
            ),
            getDocs(
              query(
                collection(db, "companies", companyId, "agences", agency.id, "courierSessions"),
                where("remittanceStatus", "==", "partial_remittance"),
                limit(100)
              )
            ),
          ]);

          shiftsSnap.docs.forEach((docSnap) => {
            allRemittances.push(
              buildTicketRemittance({
                agencyId: agency.id,
                agencyName: agency.name,
                docId: docSnap.id,
                data: docSnap.data() as Record<string, unknown>,
              })
            );
          });

          const courierRows = await Promise.all(
            courierSnap.docs.map((docSnap) =>
              buildCourierRemittance({
                companyId,
                agencyId: agency.id,
                agencyName: agency.name,
                docId: docSnap.id,
                data: docSnap.data() as Record<string, unknown>,
              })
            )
          );
          allRemittances.push(...courierRows);

          partialShiftsSnap.docs.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const amount = Number(data.remittanceDiscrepancyAmount ?? data.ecart ?? 0) || 0;
            if (amount > 0) {
              allAnomalies.push({
                id: `partial-shift-${agency.id}-${docSnap.id}`,
                agency: agency.name,
                label: "Remise partielle billetterie",
                detail: `Session ${String(data.shiftId ?? docSnap.id)}`,
                value: money(amount),
                severity: "danger",
              });
            }
          });

          partialCourierSnap.docs.forEach((docSnap) => {
            const data = docSnap.data() as Record<string, unknown>;
            const amount = Number(data.remittanceDiscrepancyAmount ?? data.difference ?? 0) || 0;
            if (amount > 0) {
              allAnomalies.push({
                id: `partial-courier-${agency.id}-${docSnap.id}`,
                agency: agency.name,
                label: "Remise partielle courrier",
                detail: `Session ${String(data.sessionId ?? docSnap.id)}`,
                value: money(amount),
                severity: "danger",
              });
            }
          });

          const cashBalance = liquidityByAgency[agency.id]?.cash ?? 0;
          const latestCashDifference = audits[0]?.difference ?? null;

          if (cashBalance < 0) {
            allAnomalies.push({
              id: `${agency.id}-negative-cash`,
              agency: agency.name,
              label: "Solde caisse négatif",
              detail: "La caisse agence doit être vérifiée.",
              value: money(cashBalance),
              severity: "danger",
            });
          }

          if (latestCashDifference != null && Math.abs(latestCashDifference) > 0.009) {
            allAnomalies.push({
              id: `${agency.id}-cash-gap`,
              agency: agency.name,
              label: "Écart au dernier contrôle",
              detail: "Contrôle caisse non équilibré.",
              value: money(latestCashDifference),
              severity: "danger",
            });
          }

          return {
            id: agency.id,
            name: agency.name,
            cashBalance,
            receiptsToday: receipts.total,
            expensesToday: expenseByAgency.get(agency.id) ?? 0,
            latestCashDifference,
          };
        })
      );

      allRemittances.forEach((remittance) => {
        if (remittance.priority === "late") {
          allAnomalies.push({
            id: `late-${remittance.id}`,
            agency: remittance.agencyName,
            label: "Remise en retard",
            detail: `${remittance.typeLabel} ${remittance.reference} clôturée il y a ${formatAge(remittance.ageMinutes)}`,
            value: money(remittance.amount),
            severity: "warning",
          });
        }
        if (remittance.priority === "critical" && Math.abs(remittance.differenceAmount ?? 0) > 0.009) {
          allAnomalies.push({
            id: `gap-${remittance.id}`,
            agency: remittance.agencyName,
            label: "Écart déclaré à la clôture",
            detail: `${remittance.typeLabel} ${remittance.reference}`,
            value: money(remittance.differenceAmount ?? 0),
            severity: "danger",
          });
        }
      });

      allRemittances.sort((left, right) => {
        const priority = priorityRank(right.priority) - priorityRank(left.priority);
        const age = (right.ageMinutes ?? -1) - (left.ageMinutes ?? -1);
        return priority || age || right.amount - left.amount;
      });

      allAnomalies.sort((left, right) => {
        const severity = Number(right.severity === "danger") - Number(left.severity === "danger");
        return severity || left.agency.localeCompare(right.agency);
      });

      setSnapshot({
        liquidity,
        agencies: agencyRows,
        remittances: allRemittances,
        anomalies: allAnomalies,
        fundsInTransitAmount,
      });
      setLastUpdated(new Date());
    } catch (loadError) {
      console.error("[CompanyAccountantDashboard] load failed", loadError);
      setSnapshot(EMPTY_SNAPSHOT);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger la supervision financière."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, money]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const remittances = snapshot.remittances;
  const pendingRemittancesCount = remittances.length;
  const pendingAmount = useMemo(
    () => remittances.reduce((sum, remittance) => sum + remittance.amount, 0),
    [remittances]
  );
  const agenciesConcernedCount = useMemo(
    () => new Set(remittances.map((remittance) => remittance.agencyId)).size,
    [remittances]
  );
  const oldestRemittance = useMemo(
    () =>
      [...remittances].sort(
        (left, right) => (right.ageMinutes ?? -1) - (left.ageMinutes ?? -1)
      )[0] ?? null,
    [remittances]
  );
  const topRemittances = useMemo(() => remittances.slice(0, 5), [remittances]);
  const anomalies = snapshot.anomalies;

  const recommendedAction = useMemo(() => {
    const criticalAnomaly = anomalies.find((anomaly) => anomaly.severity === "danger");
    if (criticalAnomaly) {
      return {
        title: `Vérifier ${criticalAnomaly.agency}`,
        detail: `${criticalAnomaly.label}${criticalAnomaly.value ? ` — ${criticalAnomaly.value}` : ""}`,
        tone: "danger" as const,
        reason: criticalAnomaly.detail,
      };
    }

    const target = remittances[0];
    if (target) {
      const title =
        target.priority === "late"
          ? `Contrôler la remise en retard de ${target.agencyName}`
          : `Traiter la remise de ${target.agencyName}`;
      return {
        title,
        detail: `${target.typeLabel} — ${money(target.amount)} — clôturée il y a ${formatAge(target.ageMinutes)}`,
        tone: target.priority === "late" ? "warning" as const : "info" as const,
        reason: target.priorityReason,
      };
    }

    if (snapshot.fundsInTransitAmount > 0) {
      return {
        title: "Vérifier les fonds en transit",
        detail: `${money(snapshot.fundsInTransitAmount)} restent en attente de mouvement.`,
        tone: "warning" as const,
        reason: "mouvement financier non finalisé",
      };
    }

    return {
      title: "Aucune intervention prioritaire",
      detail: "Aucune remise en attente ni anomalie détectée.",
      tone: "success" as const,
      reason: "situation stable",
    };
  }, [anomalies, money, remittances, snapshot.fundsInTransitAmount]);

  const basePath = `/compagnie/${companyId}/accounting`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mx-auto mb-3 h-11 w-11 animate-spin rounded-full border-4 border-slate-200 border-t-emerald-600" />
          <div className="text-sm text-slate-600">Chargement de la supervision financière...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Poste de contrôle</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Pilotage des remises</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Remises à traiter, priorités et anomalies financières réelles.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          <RefreshCw className="h-4 w-4" />
          Actualiser
        </button>
      </header>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <section aria-label="Synthèse des remises" className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={<WalletCards className="h-4 w-4" />}
          label="Remises en attente"
          value={compactNumber(pendingRemittancesCount)}
          detail="sessions clôturées"
          tone={pendingRemittancesCount > 0 ? "warning" : "success"}
        />
        <KpiCard
          icon={<Landmark className="h-4 w-4" />}
          label="Montant à remettre"
          value={money(pendingAmount)}
          detail="billetterie et courrier"
          tone={pendingAmount > 0 ? "warning" : "success"}
        />
        <KpiCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Agences concernées"
          value={compactNumber(agenciesConcernedCount)}
          detail={`${snapshot.agencies.length} agence${snapshot.agencies.length > 1 ? "s" : ""} suivie${snapshot.agencies.length > 1 ? "s" : ""}`}
          tone={agenciesConcernedCount > 0 ? "info" : "success"}
        />
        <KpiCard
          icon={<Clock3 className="h-4 w-4" />}
          label="Plus ancienne"
          value={oldestRemittance ? formatAge(oldestRemittance.ageMinutes) : "0 min"}
          detail={oldestRemittance ? oldestRemittance.agencyName : "aucune remise"}
          tone={
            oldestRemittance?.priority === "critical"
              ? "danger"
              : oldestRemittance?.priority === "late"
                ? "warning"
                : oldestRemittance
                  ? "info"
                  : "success"
          }
        />
      </section>

      <section
        className={`rounded-xl border p-4 ${
          recommendedAction.tone === "danger"
            ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"
            : recommendedAction.tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
              : recommendedAction.tone === "info"
                ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
                : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
        }`}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-70">Prochaine action</p>
            <p className="mt-1 text-lg font-bold">{recommendedAction.title}</p>
            <p className="mt-0.5 text-sm opacity-80">{recommendedAction.detail}</p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-white/60 px-3 py-1 text-xs font-semibold dark:bg-slate-950/30">
            {recommendedAction.reason}
          </span>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <SectionCard
          title="File de travail"
          icon={Landmark}
          description="Les remises à traiter en priorité."
          right={
            <StatusBadge status={pendingRemittancesCount > 0 ? "warning" : "success"}>
              {pendingRemittancesCount}
            </StatusBadge>
          }
        >
          {topRemittances.length === 0 ? (
            <PositiveState text="Aucune remise en attente." />
          ) : (
            <ul className="space-y-2">
              {topRemittances.map((remittance) => (
                <li
                  key={remittance.id}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">
                          {remittance.agencyName}
                        </p>
                        <StatusBadge status={priorityBadgeStatus(remittance.priority)}>
                          {remittance.priorityLabel}
                        </StatusBadge>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {remittance.typeLabel}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Session {remittance.reference}
                        {remittance.agentLabel ? ` · Agent ${remittance.agentLabel}` : ""}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4 lg:min-w-[420px]">
                      <MiniFact label="Montant" value={money(remittance.amount)} strong />
                      <MiniFact label="Clôture" value={formatTime(remittance.closedAt)} />
                      <MiniFact label="Ancienneté" value={formatAge(remittance.ageMinutes)} />
                      <Link
                        to={`${basePath}/reservations-reseau?${remittanceDetailSearchParams(remittance)}`}
                        className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 hover:bg-white dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        Voir le détail
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Anomalies réelles"
          icon={AlertTriangle}
          right={
            <StatusBadge status={anomalies.length > 0 ? "danger" : "success"}>
              {anomalies.length}
            </StatusBadge>
          }
        >
          {anomalies.length === 0 ? (
            <PositiveState text="Aucune anomalie détectée." />
          ) : (
            <ul className="space-y-2">
              {anomalies.slice(0, 5).map((anomaly) => (
                <li
                  key={anomaly.id}
                  className={`rounded-lg border px-3 py-3 ${
                    anomaly.severity === "danger"
                      ? "border-red-200 bg-red-50 text-red-950"
                      : "border-amber-200 bg-amber-50 text-amber-950"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{anomaly.agency}</p>
                      <p className="mt-0.5 text-xs font-medium">{anomaly.label}</p>
                      <p className="mt-0.5 text-xs opacity-75">{anomaly.detail}</p>
                    </div>
                    {anomaly.value ? (
                      <span className="shrink-0 text-sm font-bold">{anomaly.value}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <p className="text-right text-xs text-slate-500">
        Dernière mise à jour :{" "}
        {lastUpdated
          ? lastUpdated.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
          : "—"}
      </p>
    </div>
  );
};

function KpiCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info";
}) {
  const classes =
    tone === "danger"
      ? "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/30 dark:text-red-100"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        : tone === "info"
          ? "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100";

  return (
    <div className={`rounded-xl border px-3 py-3 shadow-sm ${classes}`}>
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/70 dark:bg-slate-950/30">
          {icon}
        </span>
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      </div>
      <p className="mt-2 truncate text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-0.5 truncate text-xs font-medium opacity-75">{detail}</p>
    </div>
  );
}

function MiniFact({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 truncate text-xs ${strong ? "font-bold text-slate-950 dark:text-white" : "font-semibold text-slate-700 dark:text-slate-200"}`}>
        {value}
      </p>
    </div>
  );
}

function PositiveState({ text }: { text: string }) {
  return (
    <div className="flex min-h-[72px] items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-sm font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
      <CheckCircle2 className="mr-2 h-4 w-4" />
      {text}
    </div>
  );
}

export default VueGlobale;
