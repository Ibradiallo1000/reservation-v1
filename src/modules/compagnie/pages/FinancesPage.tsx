/**
 * Finance CEO — synthèse exécutive du domaine financier consolidé.
 */
import React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  Building2,
  Clock3,
  DollarSign,
  FileText,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react";
import {
  Timestamp,
  collection,
  getDocs,
  limit,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { StandardLayoutWrapper, PageHeader } from "@/ui";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useAuth } from "@/contexts/AuthContext";
import { useCompanyPlan } from "@/core/hooks/useCompanyPlan";
import { hasCapability } from "@/core/subscription/capabilities";
import PremiumGate from "@/core/ui/PremiumGate";
import { getUnifiedCompanyFinance } from "@/modules/finance/services/unifiedFinanceService";
import {
  getAgencyLedgerLiquidityMap,
  ledgerAccountsRef,
} from "@/modules/compagnie/treasury/ledgerAccounts";
import {
  isConfirmedTransactionStatus,
  listFinancialTransactionsByPeriod,
} from "@/modules/compagnie/treasury/financialTransactions";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import {
  isLiquidityBucketType,
  parseStrictLedgerAccountType,
} from "@/modules/compagnie/treasury/ledgerAccountStrictTypes";
import { sumComptaEncaissementsInRange } from "@/modules/agence/comptabilite/comptaEncaissementsService";
import { listAgencyCashAudits } from "@/modules/agence/comptabilite/agencyCashAuditService";
import {
  DEFAULT_AGENCY_TIMEZONE,
  getEndOfDayForDate,
  getStartOfDayForDate,
} from "@/shared/date/dateUtilsTz";

type TxRow = FinancialTransactionDoc & { id: string };

type AgencyFinanceRow = {
  id: string;
  name: string;
  cashBalance: number;
  physicalReceipts: number;
  expenses: number;
  transfers: number;
  pendingRemittances: number;
  auditDifference: number | null;
  status: "compliant" | "watch" | "critical" | "uncontrolled";
};

type DecisionSignal = {
  id: string;
  severity: "success" | "warning" | "danger";
  title: string;
  constat: string;
  cause: string;
  impact: string;
  decision: string;
};

type FinanceSnapshot = {
  liquidity: {
    cash: number;
    bank: number;
    mobileMoney: number;
    total: number;
  };
  activeAccounts: number;
  fundsInTransit: number;
  incoming: number;
  outgoing: number;
  net: number;
  movementsCount: number;
  agencies: AgencyFinanceRow[];
  recentMovements: TxRow[];
  significantMovements: TxRow[];
  signals: DecisionSignal[];
};

const money = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "XOF",
  maximumFractionDigits: 0,
});

function formatMoney(value: number): string {
  return money.format(Number.isFinite(value) ? value : 0).replace("XOF", "FCFA");
}

function pct(value: number, total: number): string {
  if (!total) return "0 %";
  return `${Math.round((value / total) * 100)} %`;
}

function normalizeTxType(type: string | undefined): string {
  return type === "transfer_to_bank" ? "transfer" : String(type ?? "");
}

function isOutgoingTx(row: Pick<FinancialTransactionDoc, "type">): boolean {
  const type = normalizeTxType(row.type);
  return type === "expense" || type === "refund";
}

function isTransferTx(row: Pick<FinancialTransactionDoc, "type">): boolean {
  return normalizeTxType(row.type) === "transfer";
}

function isPaymentReceivedTx(row: Pick<FinancialTransactionDoc, "type">): boolean {
  return normalizeTxType(row.type) === "payment_received";
}

function timestampToMillis(value: unknown): number {
  if (value && typeof (value as Timestamp).toMillis === "function") {
    return (value as Timestamp).toMillis();
  }
  return 0;
}

function agencyNameFromDoc(docSnap: QueryDocumentSnapshot): string {
  const data = docSnap.data() as Record<string, unknown>;
  return String(data.nom ?? data.name ?? data.displayName ?? data.label ?? docSnap.id);
}

function accountIsActive(data: Record<string, unknown>): boolean {
  return data.isActive !== false && data.active !== false && data.disabled !== true;
}

function decisionStatus(snapshot: FinanceSnapshot): "Sain" | "À surveiller" | "Critique" {
  if (snapshot.agencies.some((agency) => agency.status === "critical") || snapshot.net < 0) {
    return "Critique";
  }
  if (
    snapshot.fundsInTransit > 0 ||
    snapshot.agencies.some((agency) => agency.status === "watch" || agency.status === "uncontrolled")
  ) {
    return "À surveiller";
  }
  return "Sain";
}

function statusClasses(status: "Sain" | "À surveiller" | "Critique"): string {
  if (status === "Critique") return "border-red-200 bg-red-50 text-red-700";
  if (status === "À surveiller") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function signalClasses(severity: DecisionSignal["severity"]): string {
  if (severity === "danger") return "border-red-200 bg-red-50";
  if (severity === "warning") return "border-amber-200 bg-amber-50";
  return "border-emerald-200 bg-emerald-50";
}

function agencyStatusLabel(status: AgencyFinanceRow["status"]): string {
  if (status === "critical") return "Critique";
  if (status === "watch") return "À surveiller";
  if (status === "uncontrolled") return "Non contrôlée";
  return "Conforme";
}

function agencyStatusClasses(status: AgencyFinanceRow["status"]): string {
  if (status === "critical") return "bg-red-100 text-red-700";
  if (status === "watch") return "bg-amber-100 text-amber-700";
  if (status === "uncontrolled") return "bg-slate-100 text-slate-700";
  return "bg-emerald-100 text-emerald-700";
}

function periodLabel(preset: string): string {
  if (preset === "day") return "Jour";
  if (preset === "week") return "Semaine";
  if (preset === "month") return "Mois";
  return "Personnalisé";
}

async function countActiveLiquidityAccounts(companyId: string): Promise<number> {
  const snap = await getDocs(query(ledgerAccountsRef(companyId), limit(500)));
  let count = 0;
  snap.docs.forEach((docSnap) => {
    const raw = docSnap.data() as Record<string, unknown>;
    try {
      const type = parseStrictLedgerAccountType(raw, docSnap.id);
      if (isLiquidityBucketType(type) && raw.includeInLiquidity !== false && accountIsActive(raw)) {
        count += 1;
      }
    } catch (error) {
      console.error("[FinancesPage] Compte ignoré pour compteur comptes actifs", error);
    }
  });
  return count;
}

function buildSignals(snapshot: Omit<FinanceSnapshot, "signals">): DecisionSignal[] {
  const signals: DecisionSignal[] = [];
  const criticalAgencies = snapshot.agencies.filter((agency) => agency.status === "critical");
  const pendingAgencies = snapshot.agencies.filter((agency) => agency.pendingRemittances > 0);
  const uncontrolledAgencies = snapshot.agencies.filter((agency) => agency.status === "uncontrolled");
  const highCashAgency = snapshot.agencies
    .filter((agency) => agency.cashBalance > 0)
    .sort((a, b) => b.cashBalance - a.cashBalance)[0];
  const largestOut = snapshot.significantMovements.find((movement) => isOutgoingTx(movement));

  if (criticalAgencies.length > 0) {
    const first = criticalAgencies[0];
    signals.push({
      id: "critical-agency",
      severity: "danger",
      title: "Solde agence critique",
      constat: `${first.name} présente un solde caisse négatif.`,
      cause: "Le solde réel remonté par les comptes consolidés est inférieur à zéro.",
      impact: `Risque financier immédiat sur ${formatMoney(Math.abs(first.cashBalance))}.`,
      decision: "Vérifier cette agence dans le réseau financier.",
    });
  }

  if (snapshot.fundsInTransit > 0) {
    signals.push({
      id: "funds-transit",
      severity: "warning",
      title: "Fonds en transit",
      constat: `${formatMoney(snapshot.fundsInTransit)} ne sont pas encore stabilisés.`,
      cause: "Des mouvements financiers restent en statut pending.",
      impact: "La liquidité disponible peut évoluer après régularisation.",
      decision: "Contrôler les mouvements en attente avant décision de trésorerie.",
    });
  }

  if (pendingAgencies.length > 0) {
    signals.push({
      id: "pending-remittances",
      severity: "warning",
      title: "Remises à régulariser",
      constat: `${pendingAgencies.length} agence(s) ont des sessions clôturées non remises.`,
      cause: "Des validations guichet ou courrier attendent encore la remise comptable.",
      impact: "Une partie de l'activité peut ne pas être visible en caisse réelle.",
      decision: "Prioriser les agences avec sessions clôturées.",
    });
  }

  if (uncontrolledAgencies.length > 0) {
    signals.push({
      id: "uncontrolled-agencies",
      severity: "warning",
      title: "Contrôles caisse manquants",
      constat: `${uncontrolledAgencies.length} agence(s) sans contrôle récent exploitable.`,
      cause: "Aucun écart de contrôle n'est disponible sur la dernière vérification.",
      impact: "Le risque d'écart non détecté augmente.",
      decision: "Demander un contrôle caisse sur les agences concernées.",
    });
  }

  if (highCashAgency && snapshot.liquidity.cash > 0 && highCashAgency.cashBalance > snapshot.liquidity.cash * 0.35) {
    signals.push({
      id: "cash-concentration",
      severity: "warning",
      title: "Concentration de liquidités",
      constat: `${highCashAgency.name} concentre ${pct(highCashAgency.cashBalance, snapshot.liquidity.cash)} des espèces agences.`,
      cause: "Les soldes comptes montrent une caisse agence dominante.",
      impact: `Exposition locale estimée à ${formatMoney(highCashAgency.cashBalance)}.`,
      decision: "Vérifier si un versement banque est nécessaire.",
    });
  }

  if (largestOut && Math.abs(Number(largestOut.amount ?? 0)) > Math.max(50_000, snapshot.incoming * 0.5)) {
    signals.push({
      id: "large-outgoing",
      severity: "warning",
      title: "Sortie significative",
      constat: `Une sortie de ${formatMoney(Math.abs(Number(largestOut.amount ?? 0)))} domine la période.`,
      cause: "Un mouvement de dépense ou remboursement dépasse le niveau habituel de la période.",
      impact: "Le solde net peut être fortement tiré vers le bas.",
      decision: "Lire le détail du flux financier correspondant.",
    });
  }

  if (signals.length === 0) {
    return [
      {
        id: "stable",
        severity: "success",
        title: "Aucun signal financier prioritaire",
        constat: "Les indicateurs consolidés ne montrent pas d'anomalie immédiate.",
        cause: "La trésorerie est stabilisée et les flux restent cohérents sur la période.",
        impact: "Le CEO peut conserver le pilotage courant.",
        decision: "Maintenir la surveillance périodique.",
      },
    ];
  }

  return signals.slice(0, 5);
}

async function loadFinanceSnapshot(companyId: string, startDate: string, endDate: string): Promise<FinanceSnapshot> {
  const start = getStartOfDayForDate(startDate, DEFAULT_AGENCY_TIMEZONE);
  const end = getEndOfDayForDate(endDate, DEFAULT_AGENCY_TIMEZONE);
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);
  const endExclusive = new Date(end.getTime() + 1);

  const [unified, transactions, agencySnap, activeAccounts, pendingSnap] = await Promise.all([
    getUnifiedCompanyFinance(companyId, startDate, endDate),
    listFinancialTransactionsByPeriod(companyId, startTs, endTs),
    getDocs(query(collection(db, "companies", companyId, "agences"), limit(200))),
    countActiveLiquidityAccounts(companyId),
    getDocs(
      query(
        collection(db, "companies", companyId, "financialTransactions"),
        where("status", "==", "pending"),
        limit(500)
      )
    ),
  ]);

  const agencies = agencySnap.docs.map((docSnap) => ({
    id: docSnap.id,
    name: agencyNameFromDoc(docSnap),
  }));
  const agencyIds = agencies.map((agency) => agency.id);
  const liquidityByAgency = await getAgencyLedgerLiquidityMap(companyId, agencyIds);

  const confirmed = transactions.filter((row) => isConfirmedTransactionStatus(row.status));
  const expensesByAgency: Record<string, number> = {};
  const transfersByAgency: Record<string, number> = {};
  confirmed.forEach((row) => {
    const agencyId = row.agencyId ?? "";
    if (!agencyId) return;
    const amount = Math.abs(Number(row.amount ?? 0));
    if (isOutgoingTx(row)) expensesByAgency[agencyId] = (expensesByAgency[agencyId] ?? 0) + amount;
    if (isTransferTx(row)) transfersByAgency[agencyId] = (transfersByAgency[agencyId] ?? 0) + amount;
  });

  const agencyRows = await Promise.all(
    agencies.map(async (agency): Promise<AgencyFinanceRow> => {
      const [physicalReceiptsSummary, audits, shiftSnap, courierSnap] = await Promise.all([
        sumComptaEncaissementsInRange(companyId, agency.id, start, endExclusive),
        listAgencyCashAudits(companyId, agency.id, 1),
        getDocs(
          query(
            collection(db, "companies", companyId, "agences", agency.id, "shifts"),
            where("status", "==", "closed"),
            limit(50)
          )
        ),
        getDocs(
          query(
            collection(db, "companies", companyId, "agences", agency.id, "courierSessions"),
            where("status", "==", "CLOSED"),
            limit(50)
          )
        ),
      ]);
      const latestAudit = audits[0];
      const auditDifference = latestAudit ? Number(latestAudit.difference ?? 0) : null;
      const cashBalance = liquidityByAgency[agency.id]?.cash ?? 0;
      const physicalReceipts = physicalReceiptsSummary.total;
      const pendingRemittances = shiftSnap.size + courierSnap.size;
      const status: AgencyFinanceRow["status"] =
        cashBalance < 0
          ? "critical"
          : auditDifference === null
            ? "uncontrolled"
            : Math.abs(auditDifference) > 0 || pendingRemittances > 0
              ? "watch"
              : "compliant";

      return {
        id: agency.id,
        name: agency.name,
        cashBalance,
        physicalReceipts,
        expenses: expensesByAgency[agency.id] ?? 0,
        transfers: transfersByAgency[agency.id] ?? 0,
        pendingRemittances,
        auditDifference,
        status,
      };
    })
  );

  const pendingRows = pendingSnap.docs.map((docSnap) => docSnap.data() as FinancialTransactionDoc);
  const fundsInTransit = pendingRows.reduce((sum, row) => sum + Math.abs(Number(row.amount ?? 0)), 0);
  const outgoing = confirmed.reduce((sum, row) => (isOutgoingTx(row) ? sum + Math.abs(Number(row.amount ?? 0)) : sum), 0);
  const recentMovements = [...confirmed]
    .sort((a, b) => timestampToMillis(b.performedAt) - timestampToMillis(a.performedAt))
    .slice(0, 6);
  const significantMovements = [...confirmed]
    .filter((row) => !isPaymentReceivedTx(row) || Math.abs(Number(row.amount ?? 0)) > 0)
    .sort((a, b) => Math.abs(Number(b.amount ?? 0)) - Math.abs(Number(a.amount ?? 0)))
    .slice(0, 5);

  const baseSnapshot = {
    liquidity: {
      cash: unified.realMoney.cash,
      bank: unified.realMoney.bank,
      mobileMoney: unified.realMoney.mobileMoney,
      total: unified.realMoney.total,
    },
    activeAccounts,
    fundsInTransit,
    incoming: unified.activity.encaissements.total,
    outgoing,
    net: unified.activity.encaissements.total - outgoing,
    movementsCount: confirmed.length,
    agencies: agencyRows.sort((a, b) => b.cashBalance - a.cashBalance),
    recentMovements,
    significantMovements,
  };

  return {
    ...baseSnapshot,
    signals: buildSignals(baseSnapshot),
  };
}

function PeriodControls({ onRefresh, loading }: { onRefresh: () => void; loading: boolean }) {
  const period = useGlobalPeriodContext();
  const presets: Array<{ key: "day" | "week" | "month"; label: string }> = [
    { key: "day", label: "Jour" },
    { key: "week", label: "Semaine" },
    { key: "month", label: "Mois" },
  ];

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
        {presets.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => period.setPreset(preset.key)}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
              period.preset === preset.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
        <input
          type="date"
          value={period.startDate}
          onChange={(event) => period.setCustomRange(event.target.value, period.endDate)}
          className="h-8 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
          aria-label="Début période Finance CEO"
        />
        <span className="text-slate-400">à</span>
        <input
          type="date"
          value={period.endDate}
          onChange={(event) => period.setCustomRange(period.startDate, event.target.value)}
          className="h-8 rounded-md border border-slate-200 px-2 text-sm text-slate-700"
          aria-label="Fin période Finance CEO"
        />
      </div>
      <button
        type="button"
        onClick={onRefresh}
        disabled={loading}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        Actualiser
      </button>
    </div>
  );
}

function ExecutiveMetric({
  label,
  value,
  hint,
  icon: Icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ElementType;
  tone?: "slate" | "green" | "red" | "amber";
}) {
  const toneClasses =
    tone === "green"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "red"
        ? "bg-red-50 text-red-700"
        : tone === "amber"
          ? "bg-amber-50 text-amber-700"
          : "bg-slate-100 text-slate-700";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-bold text-slate-950">{value}</p>
          <p className="mt-1 text-sm text-slate-500">{hint}</p>
        </div>
        <span className={`rounded-lg p-2 ${toneClasses}`}>
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </div>
  );
}

function TreasuryBucket({
  label,
  value,
  total,
  icon: Icon,
}: {
  label: string;
  value: number;
  total: number;
  icon: React.ElementType;
}) {
  const percent = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-600">{label}</p>
          <p className="mt-1 text-lg font-bold text-slate-950">{formatMoney(value)}</p>
        </div>
        <Icon className="h-5 w-5 shrink-0 text-slate-500" />
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.min(percent, 100)}%` }} />
      </div>
      <p className="mt-2 text-xs font-medium text-slate-500">{percent} % de la trésorerie</p>
    </div>
  );
}

function DecisionCard({ signal }: { signal: DecisionSignal }) {
  return (
    <div className={`rounded-xl border p-4 ${signalClasses(signal.severity)}`}>
      <h3 className="text-sm font-bold text-slate-950">{signal.title}</h3>
      <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
        <p>
          <span className="font-semibold text-slate-900">Constat : </span>
          {signal.constat}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Cause : </span>
          {signal.cause}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Impact : </span>
          {signal.impact}
        </p>
        <p>
          <span className="font-semibold text-slate-900">Décision : </span>
          {signal.decision}
        </p>
      </div>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
      {text}
    </div>
  );
}

export default function FinancesPage() {
  const { user } = useAuth();
  const globalPeriod = useGlobalPeriodContext();
  const { companyId: companyIdFromUrl } = useParams<{ companyId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";
  const { company, loading: planLoading } = useCompanyPlan(companyId);
  const [snapshot, setSnapshot] = React.useState<FinanceSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && ["mouvements", "caisse", "liquidites", "ca"].includes(tab)) {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadFinance = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await loadFinanceSnapshot(companyId, globalPeriod.startDate, globalPeriod.endDate);
      setSnapshot(data);
    } catch (loadError) {
      console.error("[FinancesPage] Finance CEO unavailable", loadError);
      setError("Les données Finance CEO sont momentanément indisponibles.");
    } finally {
      setLoading(false);
    }
  }, [companyId, globalPeriod.startDate, globalPeriod.endDate]);

  React.useEffect(() => {
    void loadFinance();
  }, [loadFinance]);

  if (!companyId) {
    return (
      <StandardLayoutWrapper maxWidthClass="w-full" className="px-4">
        <PageHeader title="Finances" icon={DollarSign} />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  if (planLoading) {
    return (
      <StandardLayoutWrapper maxWidthClass="w-full" className="px-4">
        <PageHeader title="Finances" icon={DollarSign} />
        <p className="text-gray-500">Chargement...</p>
      </StandardLayoutWrapper>
    );
  }

  if (!hasCapability(company, "financial_advanced")) {
    return (
      <StandardLayoutWrapper maxWidthClass="w-full" className="px-4">
        <PageHeader title="Finances" icon={DollarSign} />
        <PremiumGate companyId={companyId} featureName="Tableaux financiers avances" />
      </StandardLayoutWrapper>
    );
  }

  const status = snapshot ? decisionStatus(snapshot) : "À surveiller";
  const quickLinks = [
    { label: "Réseau financier", to: `/compagnie/${companyId}/accounting/reservations-reseau`, icon: Building2 },
    { label: "Trésorerie", to: `/compagnie/${companyId}/accounting/treasury`, icon: Wallet },
    { label: "Flux financiers", to: `/compagnie/${companyId}/accounting/finances`, icon: ArrowRightLeft },
    { label: "Rapports", to: `/compagnie/${companyId}/accounting/rapports`, icon: FileText },
  ];
  const agenciesToWatch = snapshot?.agencies.filter((agency) => agency.status !== "compliant").slice(0, 6) ?? [];

  return (
    <StandardLayoutWrapper maxWidthClass="w-full" className="px-4">
      <PageHeader
        title="Finance CEO"
        subtitle="Situation financière réelle de la compagnie, liquidités, flux et risques."
        icon={DollarSign}
        right={<PeriodControls onRefresh={loadFinance} loading={loading} />}
      />

      <div className="space-y-5">
        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">{error}</div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">Diagnostic financier</p>
              <h2 className="mt-1 text-2xl font-bold text-slate-950">
                {snapshot ? `Situation ${status.toLowerCase()}` : "Chargement du diagnostic"}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Période {periodLabel(globalPeriod.preset)} · {globalPeriod.startDate} au {globalPeriod.endDate}
              </p>
            </div>
            <span className={`rounded-full border px-3 py-1 text-sm font-bold ${statusClasses(status)}`}>{status}</span>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ExecutiveMetric
              label="Patrimoine financier"
              value={formatMoney(snapshot?.liquidity.total ?? 0)}
              hint="Somme accounts cash, banque et Mobile Money"
              icon={ShieldCheck}
              tone="green"
            />
            <ExecutiveMetric
              label="Trésorerie disponible"
              value={formatMoney(snapshot?.liquidity.total ?? 0)}
              hint={`${formatMoney(snapshot?.fundsInTransit ?? 0)} en transit`}
              icon={Wallet}
              tone="slate"
            />
            <ExecutiveMetric
              label="Entrées période"
              value={formatMoney(snapshot?.incoming ?? 0)}
              hint={`${snapshot?.movementsCount ?? 0} mouvements confirmés`}
              icon={ArrowUpRight}
              tone="green"
            />
            <ExecutiveMetric
              label="Solde net période"
              value={formatMoney(snapshot?.net ?? 0)}
              hint={`Sorties ${formatMoney(snapshot?.outgoing ?? 0)}`}
              icon={snapshot && snapshot.net < 0 ? ArrowDownLeft : ArrowRightLeft}
              tone={snapshot && snapshot.net < 0 ? "red" : "green"}
            />
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
            <div className="grid gap-3 text-sm text-slate-700 lg:grid-cols-4">
              <p>
                <span className="font-semibold text-slate-950">Constat : </span>
                {status === "Sain"
                  ? "La trésorerie consolidée ne montre pas d'alerte majeure."
                  : "La situation demande une attention exécutive."}
              </p>
              <p>
                <span className="font-semibold text-slate-950">Cause : </span>
                {status === "Critique"
                  ? "Un solde net ou une agence passe en zone critique."
                  : status === "À surveiller"
                    ? "Des fonds, contrôles ou remises restent à stabiliser."
                    : "Les flux confirmés restent cohérents avec les soldes."}
              </p>
              <p>
                <span className="font-semibold text-slate-950">Impact : </span>
                {snapshot
                  ? `${formatMoney(snapshot.liquidity.total)} de patrimoine financier visible.`
                  : "Analyse en cours."}
              </p>
              <p>
                <span className="font-semibold text-slate-950">Décision : </span>
                {status === "Sain" ? "Maintenir le pilotage courant." : "Traiter les signaux prioritaires ci-dessous."}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Trésorerie</h2>
                  <p className="text-sm text-slate-500">Répartition des liquidités issues des comptes consolidés.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {snapshot?.activeAccounts ?? 0} comptes actifs
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <TreasuryBucket label="Espèces agences" value={snapshot?.liquidity.cash ?? 0} total={snapshot?.liquidity.total ?? 0} icon={Banknote} />
                <TreasuryBucket label="Banques compagnie" value={snapshot?.liquidity.bank ?? 0} total={snapshot?.liquidity.total ?? 0} icon={Landmark} />
                <TreasuryBucket label="Mobile Money" value={snapshot?.liquidity.mobileMoney ?? 0} total={snapshot?.liquidity.total ?? 0} icon={Smartphone} />
                <TreasuryBucket label="Fonds en transit" value={snapshot?.fundsInTransit ?? 0} total={(snapshot?.liquidity.total ?? 0) + (snapshot?.fundsInTransit ?? 0)} icon={Clock3} />
              </div>
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <span className="font-semibold text-slate-950">Décision : </span>
                {snapshot && snapshot.fundsInTransit > 0
                  ? "Valider les mouvements en transit avant d'engager une décision de trésorerie."
                  : "La trésorerie affichée est stabilisée sur les comptes liquidité."}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Réseau financier</h2>
                  <p className="text-sm text-slate-500">Agences à surveiller, remises et soldes caisse.</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/compagnie/${companyId}/accounting/reservations-reseau`)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Ouvrir réseau financier
                </button>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-[720px] w-full table-fixed text-left text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="w-[24%] py-3 pr-3">Agence</th>
                      <th className="w-[16%] px-3 py-3">Solde caisse</th>
                      <th className="w-[16%] px-3 py-3">Encaissements</th>
                      <th className="w-[14%] px-3 py-3">Dépenses</th>
                      <th className="w-[16%] px-3 py-3">Remises/versements</th>
                      <th className="w-[14%] py-3 pl-3">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(agenciesToWatch.length > 0 ? agenciesToWatch : snapshot?.agencies.slice(0, 5) ?? []).map((agency) => (
                      <tr key={agency.id} className="align-top hover:bg-slate-50">
                        <td className="py-3 pr-3 font-semibold text-slate-900">{agency.name}</td>
                        <td className="px-3 py-3 text-slate-700">{formatMoney(agency.cashBalance)}</td>
                        <td className="px-3 py-3 text-slate-700">{formatMoney(agency.physicalReceipts)}</td>
                        <td className="px-3 py-3 text-slate-700">{formatMoney(agency.expenses)}</td>
                        <td className="px-3 py-3 text-slate-700">
                          <span className="block">{formatMoney(agency.transfers)}</span>
                          <span className="block text-xs text-slate-500">{agency.pendingRemittances} à régulariser</span>
                        </td>
                        <td className="py-3 pl-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${agencyStatusClasses(agency.status)}`}>
                            {agencyStatusLabel(agency.status)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!snapshot || snapshot.agencies.length === 0 ? <EmptyState text="Aucune agence financière disponible sur la période." /> : null}
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <span className="font-semibold text-slate-950">Décision : </span>
                {agenciesToWatch[0]
                  ? `Prioriser ${agenciesToWatch[0].name}, état ${agencyStatusLabel(agenciesToWatch[0].status).toLowerCase()}.`
                  : "Aucune agence ne ressort en priorité financière immédiate."}
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Flux financiers</h2>
              <p className="text-sm text-slate-500">Entrées, sorties et mouvements récents de la période.</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-emerald-50 p-3">
                  <p className="text-xs font-bold uppercase text-emerald-700">Entrées</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{formatMoney(snapshot?.incoming ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="text-xs font-bold uppercase text-red-700">Sorties</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{formatMoney(snapshot?.outgoing ?? 0)}</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3">
                  <p className="text-xs font-bold uppercase text-slate-600">Solde net</p>
                  <p className="mt-1 text-lg font-bold text-slate-950">{formatMoney(snapshot?.net ?? 0)}</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {snapshot?.recentMovements.length ? (
                  snapshot.recentMovements.map((movement) => (
                    <div key={movement.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {normalizeTxType(movement.type) || "Mouvement financier"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {movement.referenceType ?? "référence"} · {movement.agencyId ?? "compagnie"}
                        </p>
                      </div>
                      <p className={`shrink-0 text-sm font-bold ${isOutgoingTx(movement) ? "text-red-700" : "text-emerald-700"}`}>
                        {formatMoney(Math.abs(Number(movement.amount ?? 0)))}
                      </p>
                    </div>
                  ))
                ) : (
                  <EmptyState text="Aucun mouvement financier confirmé sur la période." />
                )}
              </div>
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <span className="font-semibold text-slate-950">Décision : </span>
                {snapshot && snapshot.net < 0
                  ? "Lire les sorties significatives avant validation d'une nouvelle dépense."
                  : "Les flux de la période restent favorables ou neutres."}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Centre de décision financier</h2>
              <p className="text-sm text-slate-500">Signaux consolidés à traiter par priorité.</p>
              <div className="mt-4 space-y-3">
                {(snapshot?.signals ?? []).map((signal) => (
                  <DecisionCard key={signal.id} signal={signal} />
                ))}
                {!snapshot ? <EmptyState text="Chargement des signaux financiers." /> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Accès rapides</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {quickLinks.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.label}
                      to={link.to}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                        <Icon className="h-4 w-4" />
                      </span>
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>
    </StandardLayoutWrapper>
  );
}
