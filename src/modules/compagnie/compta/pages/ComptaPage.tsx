/**
 * Module Comptabilité — Grand livre, Balance, Compte de résultat.
 * Données issues du ledger financier (financialTransactions / accounts).
 */

import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  BookOpen,
  Scale,
  TrendingUp,
  Calendar,
  RefreshCw,
  Download,
  ChevronDown,
  AlertTriangle,
  Building2,
  Wallet,
} from "lucide-react";
import { SectionCard, MetricCard } from "@/ui";
import {
  listMovements,
  getBalanceForPeriod,
  getCompteDeResultat,
} from "../comptaService";
import { listAccounts } from "@/modules/compagnie/treasury/financialAccounts";
import { getFinancialAccountDisplayName } from "@/modules/compagnie/treasury/accountDisplay";
import type { ComptaMovementRow, BalanceLine, CompteDeResultatData } from "../comptaTypes";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";

type TabId = "grand-livre" | "balance" | "compte-resultat";

function getPeriodRange(period: string, customStart?: Date | null, customEnd?: Date | null) {
  const now = new Date();
  let start: Date;
  let end: Date;
  if (period === "custom" && customStart && customEnd) {
    start = new Date(customStart);
    end = new Date(customEnd);
    end.setHours(23, 59, 59, 999);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (period === "quarter") {
    const q = Math.floor(now.getMonth() / 3) + 1;
    start = new Date(now.getFullYear(), (q - 1) * 3, 1);
    end = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59);
  } else {
    // week
    start = new Date(now);
    start.setDate(now.getDate() - 7);
    start.setHours(0, 0, 0, 0);
    end = new Date(now);
    end.setHours(23, 59, 59, 999);
  }
  return { start, end };
}

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  revenue_cash: "Encaissement caisse",
  revenue_online: "Encaissement en ligne",
  expense_payment: "Paiement dépense",
  payable_payment: "Paiement fournisseur",
  deposit_to_bank: "Dépôt banque",
  withdrawal_from_bank: "Retrait banque",
  internal_transfer: "Virement interne",
  manual_adjustment: "Ajustement",
  salary_payment: "Paiement salaire",
};

const ComptaPage: React.FC = () => {
  const { user, company } = useAuth() as any;
  const theme = useCompanyTheme(company) || { primary: "#2563eb", secondary: "#3b82f6" };
  const money = useFormatCurrency();

  const [tab, setTab] = useState<TabId>("grand-livre");
  const [period, setPeriod] = useState<"week" | "month" | "quarter" | "custom">("month");
  const [customStart, setCustomStart] = useState<Date | null>(null);
  const [customEnd, setCustomEnd] = useState<Date | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [accounts, setAccounts] = useState<{ id: string; agencyId: string | null; accountName: string; accountType: string }[]>([]);
  const [agencyNameById, setAgencyNameById] = useState<Record<string, string>>({});
  const [companyBanksById, setCompanyBanksById] = useState<Record<string, string>>({});
  const [movements, setMovements] = useState<ComptaMovementRow[]>([]);
  const [balanceLines, setBalanceLines] = useState<BalanceLine[]>([]);
  const [compteResultat, setCompteResultat] = useState<CompteDeResultatData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const companyId = user?.companyId as string | undefined;
  const dateRange = useMemo(
    () => getPeriodRange(period, customStart, customEnd),
    [period, customStart, customEnd]
  );

  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      listAccounts(companyId),
      getDocs(collection(db, "companies", companyId, "agences")),
      getDocs(collection(db, "companies", companyId, "companyBanks")),
    ]).then(([list, agencySnap, banksSnap]) => {
      setAccounts(list.map((a) => ({ id: a.id, agencyId: a.agencyId ?? null, accountName: a.accountName, accountType: a.accountType })));
      if (list.length && !accountId) setAccountId(list[0].id);
      const agenciesMap: Record<string, string> = {};
      agencySnap.docs.forEach((d) => {
        const data = d.data() as { nom?: string; nomAgence?: string; name?: string };
        agenciesMap[d.id] = data.nom ?? data.nomAgence ?? data.name ?? d.id;
      });
      setAgencyNameById(agenciesMap);
      const banksMap: Record<string, string> = {};
      banksSnap.docs.forEach((d) => {
        const data = d.data() as { name?: string; isActive?: boolean };
        if (data.isActive === false) return;
        banksMap[d.id] = data.name ?? d.id;
      });
      setCompanyBanksById(banksMap);
    });
  }, [companyId]);

  const loadData = async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      if (tab === "grand-livre") {
        const opts: { dateFrom?: Date; dateTo?: Date; accountId?: string } = {
          dateFrom: dateRange.start,
          dateTo: dateRange.end,
        };
        if (accountId) opts.accountId = accountId;
        const list = await listMovements(companyId, opts);
        setMovements(list);
      } else if (tab === "balance") {
        const lines = await getBalanceForPeriod(companyId, dateRange.start, dateRange.end);
        setBalanceLines(lines);
      } else {
        const data = await getCompteDeResultat(companyId, dateRange.start, dateRange.end);
        setCompteResultat(data);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!companyId) return;
    loadData();
  }, [companyId, tab, period, customStart, customEnd, accountId]);

  const tabs = [
    { id: "grand-livre" as TabId, label: "Grand livre", icon: BookOpen },
    { id: "balance" as TabId, label: "Balance", icon: Scale },
    { id: "compte-resultat" as TabId, label: "Compte de résultat", icon: TrendingUp },
  ];

  return (
    <div className="space-y-6">
      <SectionCard
        title="Comptabilité centrale"
        icon={BookOpen}
        help="Grand livre, balance des comptes et compte de résultat à partir de la trésorerie."
        right={
          <div className="flex items-center gap-2">
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as typeof period)}
              className="h-9 min-w-[170px] rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700"
            >
              <option value="week">7 derniers jours</option>
              <option value="month">Mois en cours</option>
              <option value="quarter">Trimestre</option>
              <option value="custom">Personnalisé</option>
            </select>
            {period === "custom" && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center rounded-lg border border-gray-300 bg-white px-2">
                  <input
                    type="date"
                    value={customStart?.toISOString().slice(0, 10) ?? ""}
                    onChange={(e) => setCustomStart(e.target.value ? new Date(e.target.value) : null)}
                    className="h-9 text-sm text-gray-700 outline-none"
                  />
                </div>
                <span className="text-gray-400">→</span>
                <div className="flex items-center rounded-lg border border-gray-300 bg-white px-2">
                  <input
                    type="date"
                    value={customEnd?.toISOString().slice(0, 10) ?? ""}
                    onChange={(e) => setCustomEnd(e.target.value ? new Date(e.target.value) : null)}
                    className="h-9 text-sm text-gray-700 outline-none"
                  />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => loadData()}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-sm font-medium"
            >
              <RefreshCw className="h-4 w-4" /> Actualiser
            </button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-4">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t.id
                  ? "text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
              style={tab === t.id ? { backgroundColor: (theme as any)?.colors?.primary ?? theme?.primary ?? "#2563eb" } : undefined}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
        {tab === "grand-livre" && (
          <div className="flex items-center gap-2 mt-2">
            <label className="text-sm text-gray-600">Compte :</label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[220px]"
            >
              <option value="">Tous les comptes</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById: companyBanksById })} ({a.accountType})
                </option>
              ))}
            </select>
          </div>
        )}
      </SectionCard>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-50 border border-red-200 text-red-800">
          <AlertTriangle className="h-5 w-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-10 w-10 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      )}

      {!loading && tab === "grand-livre" && (
        <SectionCard title="Grand livre" icon={BookOpen} noPad>
          <p className="px-4 py-2 text-sm text-gray-600">
            Période : {dateRange.start.toLocaleDateString("fr-FR")} → {dateRange.end.toLocaleDateString("fr-FR")}
            {accountId
              ? ` • Compte : ${getFinancialAccountDisplayName(
                  accounts.find((a) => a.id === accountId) ?? { id: accountId, accountType: "", accountName: accountId, agencyId: null },
                  { agencyNameById, companyBankNameById: companyBanksById }
                )}`
              : ""}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Libellé</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Débit</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Crédit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {movements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                      Aucun mouvement sur la période.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => {
                    const date = (m.performedAt as { toDate?: () => Date })?.toDate?.() ?? new Date();
                    const libelle = MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType;
                    const debit = m.entryType === "debit" ? m.amount : 0;
                    const credit = m.entryType === "credit" ? m.amount : 0;
                    return (
                      <tr key={m.id} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2">{date.toLocaleDateString("fr-FR")}</td>
                        <td className="px-4 py-2">{libelle} {m.referenceId ? `#${m.referenceId.slice(0, 8)}` : ""}</td>
                        <td className="px-4 py-2 text-right font-medium">{debit ? money(debit) : ""}</td>
                        <td className="px-4 py-2 text-right font-medium">{credit ? money(credit) : ""}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {!loading && tab === "balance" && (
        <SectionCard title="Balance des comptes" icon={Scale} noPad>
          <p className="px-4 py-2 text-sm text-gray-600">
            Période : {dateRange.start.toLocaleDateString("fr-FR")} → {dateRange.end.toLocaleDateString("fr-FR")}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-y border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-700">Compte</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Solde début</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Débit</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Crédit</th>
                  <th className="px-4 py-3 text-right font-semibold text-gray-700">Solde fin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {balanceLines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                      Aucun compte ou mouvement.
                    </td>
                  </tr>
                ) : (
                  balanceLines.map((l) => (
                    <tr key={l.accountId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2">
                        <div className="font-medium text-gray-900">{l.accountName}</div>
                        <div className="text-xs text-gray-500">{l.accountType}</div>
                      </td>
                      <td className="px-4 py-2 text-right">{money(l.soldeDebut)}</td>
                      <td className="px-4 py-2 text-right">{money(l.debit)}</td>
                      <td className="px-4 py-2 text-right">{money(l.credit)}</td>
                      <td className="px-4 py-2 text-right font-medium">{money(l.soldeFin)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {!loading && tab === "compte-resultat" && compteResultat && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <MetricCard
              label="Revenus"
              value={money(compteResultat.revenus.total)}
              icon={TrendingUp}
              valueColorVar={(theme as any)?.colors?.primary}
            />
            <MetricCard
              label="Charges"
              value={money(compteResultat.charges.total)}
              icon={Wallet}
            />
            <MetricCard
              label="Résultat"
              value={money(compteResultat.resultat)}
              icon={Scale}
            />
          </div>
          <SectionCard title="Compte de résultat" icon={TrendingUp} noPad>
            <p className="px-4 py-2 text-sm text-gray-600">{compteResultat.period.label}</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-y border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-gray-700">Poste</th>
                    <th className="px-4 py-3 text-right font-semibold text-gray-700">Montant</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  <tr className="bg-green-50/50">
                    <td className="px-4 py-2 font-medium">Revenus</td>
                    <td className="px-4 py-2 text-right font-medium">{money(compteResultat.revenus.total)}</td>
                  </tr>
                  {Object.entries(compteResultat.revenus.byType).map(([k, v]) => (
                    <tr key={k}>
                      <td className="px-4 py-1 pl-8 text-gray-700">{MOVEMENT_TYPE_LABELS[k] ?? k}</td>
                      <td className="px-4 py-1 text-right">{money(v)}</td>
                    </tr>
                  ))}
                  <tr className="bg-red-50/30">
                    <td className="px-4 py-2 font-medium">Charges</td>
                    <td className="px-4 py-2 text-right font-medium">{money(compteResultat.charges.total)}</td>
                  </tr>
                  {Object.entries(compteResultat.charges.byType).map(([k, v]) => (
                    <tr key={k}>
                      <td className="px-4 py-1 pl-8 text-gray-700">{MOVEMENT_TYPE_LABELS[k] ?? k}</td>
                      <td className="px-4 py-1 text-right">{money(v)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-4 py-3 font-bold text-gray-900">Résultat</td>
                    <td className="px-4 py-3 text-right font-bold">{money(compteResultat.resultat)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
};

export default ComptaPage;
