import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import {
  AlertTriangle,
  Banknote,
  Building2,
  Clock3,
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
  isLiquidityBucketType,
  parseStrictLedgerAccountType,
  type StrictLedgerAccountType,
} from "@/modules/compagnie/treasury/ledgerAccountStrictTypes";
import { listAgencyCashAudits } from "@/modules/agence/comptabilite/agencyCashAuditService";

const LOW_CASH_THRESHOLD = 50_000;

type TreasuryAccount = {
  id: string;
  agencyId: string | null;
  type: "cash" | "bank" | "mobile_money";
  label: string;
  balance: number;
  currency: string;
  active: boolean;
};

type Agency = {
  id: string;
  name: string;
};

type PendingMovement = {
  id: string;
  agencyId: string | null;
  amount: number;
  kind: "transit" | "transfer_request";
  createdAt: Date | null;
  status: string;
};

type TreasuryAlert = {
  id: string;
  severity: "warning" | "danger" | "neutral";
  title: string;
  detail: string;
  amount?: number;
};

function agencyName(data: Record<string, unknown>): string {
  return String(data.nomAgence ?? data.nom ?? data.name ?? data.ville ?? "Agence");
}

function toDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const converter = (value as { toDate?: () => Date }).toDate;
    return typeof converter === "function" ? converter.call(value) : null;
  }
  return value instanceof Date ? value : null;
}

function accountLabel(
  account: TreasuryAccount,
  agencies: Map<string, string>,
  bankNames: Map<string, string>
): string {
  if (account.type === "cash" && account.agencyId) {
    return agencies.get(account.agencyId) ?? account.label;
  }
  if (account.type === "bank") {
    const bankId = account.id.startsWith("company_bank_")
      ? account.id.slice("company_bank_".length)
      : account.id;
    return bankNames.get(bankId) ?? account.label;
  }
  return account.label;
}

function AccountList({
  rows,
  emptyLabel,
  money,
}: {
  rows: Array<TreasuryAccount & { displayLabel: string }>;
  emptyLabel: string;
  money: (value: number) => string;
}) {
  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">{emptyLabel}</p>;
  }
  return (
    <ul className="divide-y divide-gray-100 dark:divide-gray-800">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
              {row.displayLabel}
            </p>
            <p className="mt-0.5 truncate text-xs text-gray-500">{row.label}</p>
          </div>
          <p className="shrink-0 text-sm font-semibold text-gray-950 dark:text-white">
            {money(row.balance)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export default function CompanyTreasuryOverviewPage() {
  const { user } = useAuth() as any;
  const companyId = user?.companyId ?? "";
  const money = useFormatCurrency();

  const [accounts, setAccounts] = useState<TreasuryAccount[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [bankNames, setBankNames] = useState<Map<string, string>>(new Map());
  const [pendingMovements, setPendingMovements] = useState<PendingMovement[]>([]);
  const [alerts, setAlerts] = useState<TreasuryAlert[]>([]);
  const [inactiveAccountCount, setInactiveAccountCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadTreasury = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [
        accountsSnap,
        agenciesSnap,
        banksSnap,
        pendingTransactionsSnap,
      ] = await Promise.all([
        getDocs(query(collection(db, "companies", companyId, "accounts"), limit(500))),
        getDocs(collection(db, "companies", companyId, "agences")),
        getDocs(collection(db, "companies", companyId, "companyBanks")),
        getDocs(
          query(
            collection(db, "companies", companyId, "financialTransactions"),
            where("status", "==", "pending"),
            limit(500)
          )
        ),
      ]);

      const nextAgencies = agenciesSnap.docs.map((agencyDoc) => ({
        id: agencyDoc.id,
        name: agencyName(agencyDoc.data() as Record<string, unknown>),
      }));
      const agencyNames = new Map(nextAgencies.map((agency) => [agency.id, agency.name]));
      const nextBankNames = new Map<string, string>();
      let inactiveBanks = 0;
      banksSnap.docs.forEach((bankDoc) => {
        const data = bankDoc.data() as Record<string, unknown>;
        nextBankNames.set(bankDoc.id, String(data.name ?? bankDoc.id));
        if (data.isActive === false) inactiveBanks += 1;
      });

      const nextAccounts: TreasuryAccount[] = [];
      accountsSnap.docs.forEach((accountDoc) => {
        const data = accountDoc.data() as Record<string, unknown>;
        let type: StrictLedgerAccountType;
        try {
          type = parseStrictLedgerAccountType(data, accountDoc.id);
        } catch (parseError) {
          console.warn("[CompanyTreasuryOverview] compte ignoré", accountDoc.id, parseError);
          return;
        }
        if (!isLiquidityBucketType(type) || data.includeInLiquidity === false) return;
        nextAccounts.push({
          id: accountDoc.id,
          agencyId: data.agencyId ? String(data.agencyId) : null,
          type,
          label: String(data.label ?? accountDoc.id),
          balance: Number(data.balance ?? 0) || 0,
          currency: String(data.currency ?? "XOF"),
          active: data.isActive !== false,
        });
      });

      const transitMovements: PendingMovement[] = pendingTransactionsSnap.docs
        .map((transactionDoc): PendingMovement | null => {
          const data = transactionDoc.data() as Record<string, unknown>;
          const type = String(data.type ?? "");
          if (type !== "transfer" && type !== "transfer_to_bank") return null;
          return {
            id: transactionDoc.id,
            agencyId: data.agencyId ? String(data.agencyId) : null,
            amount: Math.abs(Number(data.amount ?? 0) || 0),
            kind: "transit",
            createdAt: toDate(data.performedAt ?? data.createdAt),
            status: "En transit",
          };
        })
        .filter((row): row is PendingMovement => row !== null);
      const auditRows = await Promise.all(
        nextAgencies.map(async (agency) => ({
          agency,
          audits: await listAgencyCashAudits(companyId, agency.id, 1),
        }))
      );

      const nextAlerts: TreasuryAlert[] = [];
      nextAccounts
        .filter(
          (account) =>
            account.active
            && account.type === "cash"
            && account.agencyId
            && account.balance < LOW_CASH_THRESHOLD
        )
        .forEach((account) => {
          nextAlerts.push({
            id: `low-${account.id}`,
            severity: account.balance < 0 ? "danger" : "warning",
            title: "Solde caisse faible",
            detail: agencyNames.get(account.agencyId!) ?? account.label,
            amount: account.balance,
          });
        });
      auditRows.forEach(({ agency, audits }) => {
        const difference = audits[0] ? Number(audits[0].difference) : 0;
        if (Math.abs(difference) <= 0.009) return;
        nextAlerts.push({
          id: `audit-${agency.id}`,
          severity: "danger",
          title: "Écart de caisse détecté",
          detail: agency.name,
          amount: difference,
        });
      });
      if (inactiveBanks > 0) {
        nextAlerts.push({
          id: "inactive-banks",
          severity: "neutral",
          title: "Compte bancaire inactif",
          detail: `${inactiveBanks} compte${inactiveBanks > 1 ? "s" : ""} configuré${inactiveBanks > 1 ? "s" : ""}`,
        });
      }

      setAccounts(nextAccounts.filter((account) => account.active));
      setAgencies(nextAgencies);
      setBankNames(nextBankNames);
      setPendingMovements(transitMovements);
      setAlerts(nextAlerts);
      setInactiveAccountCount(inactiveBanks);
    } catch (loadError) {
      console.error("[CompanyTreasuryOverview] load failed", loadError);
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Impossible de charger la trésorerie consolidée."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadTreasury();
  }, [loadTreasury]);

  const agencyNames = useMemo(
    () => new Map(agencies.map((agency) => [agency.id, agency.name])),
    [agencies]
  );
  const displayAccounts = useMemo(
    () =>
      accounts
        .map((account) => ({
          ...account,
          displayLabel: accountLabel(account, agencyNames, bankNames),
        }))
        .sort((left, right) => Math.abs(right.balance) - Math.abs(left.balance)),
    [accounts, agencyNames, bankNames]
  );
  const cashAccounts = useMemo(
    () => displayAccounts.filter((account) => account.type === "cash" && account.agencyId),
    [displayAccounts]
  );
  const bankAccounts = useMemo(
    () => displayAccounts.filter((account) => account.type === "bank" && !account.agencyId),
    [displayAccounts]
  );
  const mobileMoneyAccounts = useMemo(
    () =>
      displayAccounts.filter(
        (account) => account.type === "mobile_money" && !account.agencyId
      ),
    [displayAccounts]
  );
  const totals = useMemo(() => {
    const cash = cashAccounts.reduce((sum, account) => sum + account.balance, 0);
    const bank = bankAccounts.reduce((sum, account) => sum + account.balance, 0);
    const mobileMoney = mobileMoneyAccounts.reduce(
      (sum, account) => sum + account.balance,
      0
    );
    const transit = pendingMovements
      .filter((movement) => movement.kind === "transit")
      .reduce((sum, movement) => sum + movement.amount, 0);
    return {
      cash,
      bank,
      mobileMoney,
      held: cash + bank + mobileMoney,
      transit,
    };
  }, [cashAccounts, bankAccounts, mobileMoneyAccounts, pendingMovements]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">Trésorerie</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
            Localisation consolidée des liquidités de la compagnie
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadTreasury()}
          disabled={loading}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Actualiser
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Patrimoine financier global" value={loading ? "—" : money(totals.held)} icon={Landmark} />
        <MetricCard label="Liquidités réellement détenues" value={loading ? "—" : money(totals.held)} icon={Wallet} />
        <MetricCard label="Fonds en transit" value={loading ? "—" : money(totals.transit)} icon={Clock3} />
        <MetricCard label="Comptes actifs" value={loading ? "—" : displayAccounts.length} icon={Building2} />
      </div>

      <SectionCard title="Liquidités détenues" icon={Wallet}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-2 text-emerald-800"><Banknote className="h-4 w-4" /><span className="text-sm font-semibold">Espèces agences</span></div>
            <p className="mt-3 text-2xl font-bold text-emerald-950">{loading ? "—" : money(totals.cash)}</p>
            <p className="mt-1 text-xs text-emerald-700">{cashAccounts.length} caisse{cashAccounts.length > 1 ? "s" : ""} active{cashAccounts.length > 1 ? "s" : ""}</p>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 text-blue-800"><Landmark className="h-4 w-4" /><span className="text-sm font-semibold">Banques compagnie</span></div>
            <p className="mt-3 text-2xl font-bold text-blue-950">{loading ? "—" : money(totals.bank)}</p>
            <p className="mt-1 text-xs text-blue-700">{bankAccounts.length} compte{bankAccounts.length > 1 ? "s" : ""} actif{bankAccounts.length > 1 ? "s" : ""}</p>
          </div>
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-4">
            <div className="flex items-center gap-2 text-violet-800"><Smartphone className="h-4 w-4" /><span className="text-sm font-semibold">Mobile Money compagnie</span></div>
            <p className="mt-3 text-2xl font-bold text-violet-950">{loading ? "—" : money(totals.mobileMoney)}</p>
            <p className="mt-1 text-xs text-violet-700">{mobileMoneyAccounts.length} portefeuille{mobileMoneyAccounts.length > 1 ? "s" : ""} actif{mobileMoneyAccounts.length > 1 ? "s" : ""}</p>
          </div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <SectionCard title="Espèces par agence" icon={Banknote}>
          <AccountList rows={cashAccounts} emptyLabel="Aucune caisse agence disponible." money={money} />
        </SectionCard>
        <SectionCard title="Comptes bancaires" icon={Landmark}>
          <AccountList rows={bankAccounts} emptyLabel="Aucun compte bancaire disponible." money={money} />
        </SectionCard>
        <SectionCard title="Portefeuilles Mobile Money" icon={Smartphone}>
          <AccountList rows={mobileMoneyAccounts} emptyLabel="Aucun portefeuille compagnie disponible." money={money} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <SectionCard title="Mouvements en cours" icon={Clock3}>
          {pendingMovements.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Aucun mouvement en cours.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {pendingMovements.map((movement) => (
                <li key={`${movement.kind}-${movement.id}`} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {movement.kind === "transit" ? "Fonds en transit" : "Versement agence"}
                      </p>
                      <StatusBadge status="warning">{movement.status}</StatusBadge>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {movement.agencyId
                        ? agencyNames.get(movement.agencyId) ?? "Agence"
                        : "Niveau compagnie"}
                      {movement.createdAt
                        ? ` · ${movement.createdAt.toLocaleDateString("fr-FR")}`
                        : ""}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{money(movement.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Alertes trésorerie" icon={AlertTriangle}>
          {alerts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Aucune alerte de trésorerie.</p>
          ) : (
            <ul className="space-y-2">
              {alerts.map((alert) => (
                <li key={alert.id} className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 px-3 py-3 dark:border-gray-700">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${alert.severity === "danger" ? "text-red-600" : alert.severity === "warning" ? "text-amber-600" : "text-gray-500"}`} />
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{alert.title}</p>
                    </div>
                    <p className="mt-1 truncate text-xs text-gray-500">{alert.detail}</p>
                  </div>
                  {alert.amount != null ? <p className="shrink-0 text-sm font-semibold">{money(alert.amount)}</p> : null}
                </li>
              ))}
            </ul>
          )}
          {inactiveAccountCount > 0 ? (
            <p className="mt-3 text-xs text-gray-500">
              Les comptes inactifs sont signalés mais exclus des liquidités détenues.
            </p>
          ) : null}
        </SectionCard>
      </div>

      <p className="text-xs text-gray-500">
        Les fonds en transit sont présentés séparément et ne sont pas additionnés au patrimoine. Les comptes techniques et tout compte avec includeInLiquidity=false sont exclus.
      </p>
    </div>
  );
}
