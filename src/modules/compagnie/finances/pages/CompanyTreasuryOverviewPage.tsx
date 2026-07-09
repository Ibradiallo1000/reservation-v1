import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
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
} from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { SectionCard, StatusBadge } from "@/ui";
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

type ConfiguredPaymentMethod = {
  id: string;
  label: string;
  providerCode?: string | null;
};

type MobileMoneyTransaction = {
  id: string;
  amount: number;
  paymentProvider?: string | null;
  metadata?: Record<string, unknown> | null;
};

function agencyName(data: Record<string, unknown>): string {
  return String(data.nomAgence ?? data.nom ?? data.name ?? data.ville ?? "Agence");
}

function asOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function providerMatchKey(value?: string | null): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
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
  const [configuredPaymentMethods, setConfiguredPaymentMethods] = useState<ConfiguredPaymentMethod[]>([]);
  const [mobileMoneyTransactions, setMobileMoneyTransactions] = useState<MobileMoneyTransaction[]>([]);
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
        paymentConfigsSnap,
        confirmedMobileMoneySnap,
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
        getDocs(
          query(
            collection(db, "companies", companyId, "paymentConfigs"),
            where("active", "==", true),
            where("isEnabled", "==", true)
          )
        ),
        getDocs(
          query(
            collection(db, "companies", companyId, "financialTransactions"),
            where("paymentMethod", "==", "mobile_money"),
            where("status", "==", "confirmed"),
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
      const configuredMethods = (
        await Promise.all(
          paymentConfigsSnap.docs.map(async (configDoc): Promise<ConfiguredPaymentMethod | null> => {
            const config = configDoc.data() as Record<string, unknown>;
            const methodId = asOptionalString(config.methodId) ?? configDoc.id;
            if (!methodId) return null;
            const methodSnap = await getDoc(doc(db, "paymentMethods", methodId));
            const method = methodSnap.exists() ? (methodSnap.data() as Record<string, unknown>) : {};
            const label = asOptionalString(method.name) ?? asOptionalString(config.name) ?? methodId;
            return {
              id: methodId,
              label,
              providerCode: asOptionalString(method.providerCode) ?? asOptionalString(config.providerCode) ?? null,
            };
          })
        )
      )
        .filter((method): method is ConfiguredPaymentMethod => Boolean(method?.id && method.label))
        .sort((left, right) => left.label.localeCompare(right.label, "fr"));
      const confirmedMobileMoney = confirmedMobileMoneySnap.docs.map((transactionDoc) => {
        const data = transactionDoc.data() as Record<string, unknown>;
        return {
          id: transactionDoc.id,
          amount: Math.abs(Number(data.amount ?? 0) || 0),
          paymentProvider: asOptionalString(data.paymentProvider),
          metadata: (data.metadata as Record<string, unknown> | undefined) ?? null,
        };
      });

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
      setConfiguredPaymentMethods(configuredMethods);
      setMobileMoneyTransactions(confirmedMobileMoney);
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
  const mobileMoneyByConfiguredMethod = useMemo(() => {
    const methodAliases = configuredPaymentMethods.map((method) => ({
      method,
      aliases: [method.id, method.label, method.providerCode]
        .map((value) => providerMatchKey(value))
        .filter(Boolean),
    }));
    const totalsByMethod = new Map(configuredPaymentMethods.map((method) => [method.id, 0]));

    mobileMoneyTransactions.forEach((transaction) => {
      const providerKey = providerMatchKey(
        transaction.paymentProvider ?? asOptionalString(transaction.metadata?.provider)
      );
      if (!providerKey) return;
      const configured = methodAliases.find(({ aliases }) => aliases.includes(providerKey));
      if (!configured) return;
      totalsByMethod.set(
        configured.method.id,
        (totalsByMethod.get(configured.method.id) ?? 0) + transaction.amount
      );
    });

    return configuredPaymentMethods.map((method) => ({
      id: method.id,
      label: method.label,
      amount: totalsByMethod.get(method.id) ?? 0,
    }));
  }, [configuredPaymentMethods, mobileMoneyTransactions]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-950 dark:text-white">Trésorerie</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-300">
            Localisation de l'argent réel : espèces, liquidités numériques et transferts.
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SectionCard title="Espèces agences" icon={Banknote}>
          <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200">
              <Banknote className="h-4 w-4" />
              <span className="text-sm font-semibold">Espèces agences</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-emerald-950 dark:text-emerald-100">
              {loading ? "—" : money(totals.cash)}
            </p>
            <p className="mt-1 text-xs text-emerald-700 dark:text-emerald-200">
              {cashAccounts.length} caisse{cashAccounts.length > 1 ? "s" : ""} active{cashAccounts.length > 1 ? "s" : ""}
            </p>
          </div>
          <AccountList rows={cashAccounts} emptyLabel="Aucune caisse agence disponible." money={money} />
        </SectionCard>

        <SectionCard title="Mobile Money" icon={Smartphone}>
          <div className="mb-4 grid grid-cols-1 gap-3">
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 dark:border-violet-900 dark:bg-violet-950/30">
              <div className="flex items-center gap-2 text-violet-800 dark:text-violet-200">
                <Smartphone className="h-4 w-4" />
                <span className="text-sm font-semibold">Mobile Money</span>
              </div>
              <p className="mt-3 text-2xl font-bold text-violet-950 dark:text-violet-100">{loading ? "—" : money(totals.mobileMoney)}</p>
              <p className="mt-1 text-xs text-violet-700 dark:text-violet-200">Répartition selon les moyens configurés par la compagnie</p>
            </div>
          </div>
          {mobileMoneyByConfiguredMethod.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">Aucun portefeuille Mobile Money configuré.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {mobileMoneyByConfiguredMethod.map((method) => (
                <li key={method.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-900 dark:text-white">{method.label}</p>
                    <p className="mt-0.5 text-xs text-gray-500">Configuré par la compagnie</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold">{money(method.amount)}</p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        <SectionCard title="Banques" icon={Landmark}>
          <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30">
            <div className="flex items-center gap-2 text-blue-800 dark:text-blue-200">
              <Landmark className="h-4 w-4" />
              <span className="text-sm font-semibold">Banques</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-blue-950 dark:text-blue-100">{loading ? "—" : money(totals.bank)}</p>
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-200">{bankAccounts.length} compte{bankAccounts.length > 1 ? "s" : ""} actif{bankAccounts.length > 1 ? "s" : ""}</p>
          </div>
          <AccountList rows={bankAccounts} emptyLabel="Aucun compte bancaire disponible." money={money} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Fonds en transit" icon={Clock3}>
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <Clock3 className="h-4 w-4" />
              <span className="text-sm font-semibold">Transferts en cours</span>
            </div>
            <p className="mt-3 text-2xl font-bold text-amber-950 dark:text-amber-100">{loading ? "—" : money(totals.transit)}</p>
          </div>
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
