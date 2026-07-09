import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Building2,
  Landmark,
  RefreshCw,
  Wallet,
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

type AgencySnapshot = {
  id: string;
  name: string;
  cashBalance: number;
  receiptsToday: number;
  expensesToday: number;
  latestCashDifference: number | null;
  pendingSessions: number;
};

type DashboardSnapshot = {
  liquidity: {
    total: number;
    cash: number;
    bank: number;
    mobileMoney: number;
  };
  agencies: AgencySnapshot[];
  fundsInTransitAmount: number;
};

const EMPTY_SNAPSHOT: DashboardSnapshot = {
  liquidity: { total: 0, cash: 0, bank: 0, mobileMoney: 0 },
  agencies: [],
  fundsInTransitAmount: 0,
};

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

function needsAttention(row: AgencySnapshot): boolean {
  return (
    row.cashBalance < 0
    || hasCashDifference(row)
    || row.pendingSessions > 0
  );
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

      const agencyRows = await Promise.all(
        agencies.map(async (agency): Promise<AgencySnapshot> => {
          const [receipts, audits, shiftsSnap, courierSnap] = await Promise.all([
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
          ]);

          return {
            id: agency.id,
            name: agency.name,
            cashBalance: liquidityByAgency[agency.id]?.cash ?? 0,
            receiptsToday: receipts.total,
            expensesToday: expenseByAgency.get(agency.id) ?? 0,
            latestCashDifference: audits[0]?.difference ?? null,
            pendingSessions: shiftsSnap.size + courierSnap.size,
          };
        })
      );

      agencyRows.sort((left, right) => {
        const priority = Number(needsAttention(right)) - Number(needsAttention(left));
        return priority || Math.abs(right.latestCashDifference ?? 0) - Math.abs(left.latestCashDifference ?? 0);
      });

      setSnapshot({
        liquidity,
        agencies: agencyRows,
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
  }, [companyId]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const agenciesToWatch = useMemo(
    () => snapshot.agencies.filter(needsAttention),
    [snapshot.agencies]
  );
  const pendingRemittancesCount = useMemo(
    () => snapshot.agencies.reduce((sum, agency) => sum + agency.pendingSessions, 0),
    [snapshot.agencies]
  );
  const criticalAnomalies = useMemo(
    () =>
      snapshot.agencies
        .flatMap((agency) => {
          const anomalies: Array<{
            id: string;
            agency: string;
            label: string;
            value?: string;
            severity: "danger" | "warning";
          }> = [];
          if (agency.cashBalance < 0) {
            anomalies.push({
              id: `${agency.id}-negative-cash`,
              agency: agency.name,
              label: "Solde caisse négatif",
              value: money(agency.cashBalance),
              severity: "danger",
            });
          }
          if (hasCashDifference(agency)) {
            anomalies.push({
              id: `${agency.id}-cash-gap`,
              agency: agency.name,
              label: "Écart au dernier contrôle",
              value: money(agency.latestCashDifference ?? 0),
              severity: "danger",
            });
          }
          if (agency.pendingSessions > 0) {
            anomalies.push({
              id: `${agency.id}-pending-sessions`,
              agency: agency.name,
              label: `${agency.pendingSessions} remise${agency.pendingSessions > 1 ? "s" : ""} à régulariser`,
              severity: "warning",
            });
          }
          return anomalies;
        })
        .slice(0, 5),
    [money, snapshot.agencies]
  );
  const recommendedAction = useMemo(() => {
    const critical = criticalAnomalies[0];
    if (critical) {
      return {
        title: `Contrôler ${critical.agency}`,
        detail: critical.label,
        tone: "danger" as const,
      };
    }
    const agency = agenciesToWatch[0];
    if (agency) {
      return {
        title: `Ouvrir le contrôle agence`,
        detail: `${agency.name} nécessite une vérification.`,
        tone: "warning" as const,
      };
    }
    if (snapshot.fundsInTransitAmount > 0) {
      return {
        title: "Vérifier les fonds en transit",
        detail: `${money(snapshot.fundsInTransitAmount)} à suivre en trésorerie.`,
        tone: "warning" as const,
      };
    }
    return {
      title: "Aucune intervention urgente",
      detail: "Le réseau ne présente pas d'alerte prioritaire.",
      tone: "success" as const,
    };
  }, [agenciesToWatch, criticalAnomalies, money, snapshot.fundsInTransitAmount]);

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
          <h1 className="mt-1 text-2xl font-bold text-slate-950 dark:text-white">Dashboard financier</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
            Vue de décision : santé globale, alertes et prochaines actions.
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

      <section aria-label="Décision financière" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
            <Wallet className="h-4 w-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">Situation financière globale</span>
          </div>
          <p className="mt-3 text-3xl font-bold text-emerald-950 dark:text-emerald-100">
            {money(snapshot.liquidity.total)}
          </p>
          <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-200">
            Résumé consolidé. Le détail banques, Mobile Money et comptes reste dans Trésorerie.
          </p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-200">Argent à surveiller</p>
          <p className="mt-3 text-3xl font-bold text-amber-950 dark:text-amber-100">{money(snapshot.fundsInTransitAmount)}</p>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
            Fonds en transit ou mouvements à régulariser.
          </p>
        </div>
        <div className={`rounded-xl border p-4 ${
          recommendedAction.tone === "danger"
            ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
            : recommendedAction.tone === "warning"
              ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30"
              : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
        }`}>
          <p className={`text-xs font-semibold uppercase tracking-wide ${
            recommendedAction.tone === "danger"
              ? "text-red-700 dark:text-red-200"
              : recommendedAction.tone === "warning"
                ? "text-amber-700 dark:text-amber-200"
                : "text-emerald-700 dark:text-emerald-200"
          }`}>
            Prochaine action recommandée
          </p>
          <p className="mt-3 text-lg font-bold text-slate-950 dark:text-white">{recommendedAction.title}</p>
          <p className="mt-1 text-sm text-slate-700 dark:text-slate-200">{recommendedAction.detail}</p>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_0.8fr]">
        <SectionCard
          title="Agences à surveiller"
          icon={Building2}
          description="Liste courte des agences où intervenir."
          right={
            <StatusBadge status={agenciesToWatch.length > 0 ? "warning" : "success"}>
              {agenciesToWatch.length} agence{agenciesToWatch.length > 1 ? "s" : ""}
            </StatusBadge>
          }
        >
          {agenciesToWatch.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">
              Aucun point de vigilance détecté.
            </p>
          ) : (
            <ul className="space-y-2">
              {agenciesToWatch.slice(0, 5).map((agency) => (
                <li key={agency.id} className="rounded-lg border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-950 dark:text-white">{agency.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {agency.pendingSessions > 0
                          ? `${agency.pendingSessions} remise${agency.pendingSessions > 1 ? "s" : ""} à régulariser`
                          : hasCashDifference(agency)
                            ? "Écart au dernier contrôle"
                            : "Solde caisse à vérifier"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {agency.cashBalance < 0 ? <StatusBadge status="danger">Caisse négative</StatusBadge> : null}
                      {hasCashDifference(agency) ? <StatusBadge status="danger">{money(agency.latestCashDifference ?? 0)}</StatusBadge> : null}
                      {agency.pendingSessions > 0 ? <StatusBadge status="warning">Remise</StatusBadge> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard
          title="Anomalies critiques"
          icon={AlertTriangle}
          right={
            <StatusBadge status={criticalAnomalies.length > 0 ? "danger" : "success"}>
              {criticalAnomalies.length}
            </StatusBadge>
          }
        >
          {criticalAnomalies.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucune anomalie critique.</p>
          ) : (
            <ul className="space-y-2">
              {criticalAnomalies.map((anomaly) => (
                <li key={anomaly.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{anomaly.agency}</p>
                      <p className="mt-0.5 text-xs text-slate-600">{anomaly.label}</p>
                    </div>
                    {anomaly.value ? (
                      <span className="text-sm font-bold text-red-700">{anomaly.value}</span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
        <SectionCard title="Remises et mouvements à régulariser" icon={Landmark}>
          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase text-rose-700">Remises à régulariser</p>
              <p className="mt-2 text-xl font-bold text-rose-950">{pendingRemittancesCount}</p>
              <p className="mt-1 text-xs text-rose-800">Sessions billetterie ou courrier clôturées</p>
            </div>
          </div>
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

export default VueGlobale;
