import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
} from "firebase/firestore";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Landmark,
  RefreshCw,
  Smartphone,
  Wallet,
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { MetricCard, SectionCard, StatusBadge } from "@/ui";
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
    <div className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase text-emerald-700">Supervision réseau</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Situation financière</h1>
          <p className="mt-1 text-sm text-slate-600">
            Patrimoine, liquidités et points de contrôle de la compagnie.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
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

      <section aria-label="Patrimoine financier" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard
          label="Patrimoine financier"
          value={money(snapshot.liquidity.total)}
          icon={Wallet}
          hint="Somme des comptes inclus dans la liquidité"
        />
        <MetricCard
          label="Espèces agences"
          value={money(snapshot.liquidity.cash)}
          icon={Wallet}
          hint="Soldes caisse du réseau"
        />
        <MetricCard
          label="Banques compagnie"
          value={money(snapshot.liquidity.bank)}
          icon={Landmark}
          hint="Comptes bancaires liquides"
        />
        <MetricCard
          label="Mobile Money compagnie"
          value={money(snapshot.liquidity.mobileMoney)}
          icon={Smartphone}
          hint="Portefeuilles liquides enregistrés dans le ledger"
        />
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <SectionCard
          title="Agences à surveiller"
          icon={Building2}
          description="Agences présentant un écart ou une remise non régularisée."
          right={
            <StatusBadge status={agenciesToWatch.length > 0 ? "warning" : "success"}>
              {agenciesToWatch.length} agence{agenciesToWatch.length > 1 ? "s" : ""}
            </StatusBadge>
          }
          noPad
        >
          {agenciesToWatch.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Aucun point de vigilance détecté.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Agence</th>
                    <th className="px-4 py-3 text-right">Caisse</th>
                    <th className="px-4 py-3 text-right">Encaissements jour</th>
                    <th className="px-4 py-3 text-right">Dépenses jour</th>
                    <th className="px-4 py-3 text-right">Écart contrôle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agenciesToWatch.slice(0, 6).map((agency) => (
                    <tr key={agency.id} className="bg-white">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900">{agency.name}</p>
                        <p className="text-xs text-slate-500">
                          {agency.pendingSessions} remise{agency.pendingSessions > 1 ? "s" : ""} à régulariser
                        </p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{money(agency.cashBalance)}</td>
                      <td className="px-4 py-3 text-right">{money(agency.receiptsToday)}</td>
                      <td className="px-4 py-3 text-right">{money(agency.expensesToday)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${hasCashDifference(agency) ? "text-red-700" : "text-emerald-700"}`}>
                        {agency.latestCashDifference == null ? "Non contrôlé" : money(agency.latestCashDifference)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Remises et mouvements à régulariser" icon={Landmark}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-xs font-semibold uppercase text-rose-700">Remises à régulariser</p>
              <p className="mt-2 text-xl font-bold text-rose-950">{pendingRemittancesCount}</p>
              <p className="mt-1 text-xs text-rose-800">Sessions billetterie ou courrier clôturées</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase text-blue-700">Fonds en transit</p>
              <p className="mt-2 text-xl font-bold text-blue-950">{money(snapshot.fundsInTransitAmount)}</p>
              <p className="mt-1 text-xs text-blue-800">Transactions de transfert en statut pending</p>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Accès rapides" icon={ArrowRight}>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link
              to={`/compagnie/${companyId}/accounting/reservations-reseau`}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Réseau financier
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={`/compagnie/${companyId}/accounting/treasury`}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Trésorerie
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={`/compagnie/${companyId}/accounting/finances`}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Flux financiers
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to={`/compagnie/${companyId}/accounting/rapports`}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Rapports
              <ArrowRight className="h-4 w-4" />
            </Link>
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
