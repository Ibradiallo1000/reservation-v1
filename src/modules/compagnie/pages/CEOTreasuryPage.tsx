// Treasury dashboard — CEO: liquid cash, by agency, bank, mobile money, reserves, cash flow, timeline.
import React, { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocs,
  getDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, MetricCard, SectionCard, ActionButton } from "@/ui";
import { listExpenses } from "@/modules/compagnie/treasury/expenses";
import { getFinancialAccountDisplayName, getCompanyBankDocIdFromAccountId } from "@/modules/compagnie/treasury/accountDisplay";
import { formatDateLongFr } from "@/utils/dateFmt";
import { getDateRangeForPeriod, isInRange, type PeriodKind } from "@/shared/date/periodUtils";
import PeriodFilterBar from "@/shared/date/PeriodFilterBar";
import { Wallet, Building2, TrendingUp, AlertCircle, Banknote, Smartphone, PiggyBank, Eye, EyeOff } from "lucide-react";

const MOVEMENTS_LIMIT = 100;
const LOW_BALANCE_THRESHOLD = 50000;

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  agency_cash: "Caisse agence",
  agency_bank: "Banque agence",
  company_bank: "Banque compagnie",
  mobile_money: "Mobile money",
  expense_reserve: "Réserve dépenses",
};
const PIN_MAX_ATTEMPTS = 3;
const PIN_LOCK_STEPS_MS = [60_000, 300_000, 900_000];

async function sha256Hex(value: string): Promise<string> {
  if (typeof window !== "undefined" && window.crypto?.subtle) {
    const data = new TextEncoder().encode(value);
    const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return value;
}

type CEOTreasuryPageProps = {
  embedded?: boolean;
};

export default function CEOTreasuryPage({ embedded = false }: CEOTreasuryPageProps) {
  const { user, company } = useAuth() as { user?: { uid?: string; companyId?: string; role?: string }; company?: { nom?: string } };
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const [accounts, setAccounts] = useState<{ id: string; agencyId: string | null; accountType: string; accountName: string; currentBalance: number; currency: string }[]>([]);
  const [movements, setMovements] = useState<{ id: string; amount: number; movementType: string; performedAt: unknown; referenceId: string; agencyId: string }[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [companyBanksById, setCompanyBanksById] = useState<Record<string, { name: string; pinHash: string | null }>>({});
  const [companyName, setCompanyName] = useState<string>("");
  const [expenses, setExpenses] = useState<{ id: string; amount: number; status: string; category: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKind>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [unlockedBankIds, setUnlockedBankIds] = useState<Set<string>>(new Set());
  const [pinLoading, setPinLoading] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    (async () => {
      const companySnap = await getDoc(doc(db, "companies", companyId));
      const cData = (companySnap.data() as { nom?: string } | undefined) ?? {};
      const nom = cData.nom ?? (company as { nom?: string } | undefined)?.nom ?? "";
      setCompanyName(nom);
      const [ags, exps, banks] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "agences")).then((s) =>
          s.docs.map((d) => {
            const data = d.data() as { nom?: string; nomAgence?: string; name?: string };
            const nom = data.nom ?? data.nomAgence ?? data.name ?? "";
            return { id: d.id, nom: nom || d.id };
          })
        ),
        listExpenses(companyId, { limitCount: 20 }),
        getDocs(collection(db, "companies", companyId, "companyBanks")).then((s) => {
          const map: Record<string, { name: string; pinHash: string | null }> = {};
          s.docs.forEach((d) => {
            const data = d.data() as { name?: string; isActive?: boolean; bankPinHash?: string };
            if (data.isActive === false) return;
            map[d.id] = {
              name: data.name || d.id,
              pinHash: typeof data.bankPinHash === "string" ? data.bankPinHash : null,
            };
          });
          return map;
        }),
      ]);
      setAgencies(ags);
      setExpenses(exps);
      setCompanyBanksById(banks);
    })();
  }, [companyId, company]);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    const q = query(
      collection(db, `companies/${companyId}/financialAccounts`),
      where("isActive", "==", true)
    );
    const unsub = onSnapshot(q, (snap) => {
      setAccounts(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            agencyId: data.agencyId ?? null,
            accountType: data.accountType ?? "",
            accountName: data.accountName ?? "",
            currentBalance: Number(data.currentBalance ?? 0),
            currency: data.currency ?? "",
          };
        })
      );
      setLoading(false);
    });
    return () => unsub();
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const q = query(
      collection(db, `companies/${companyId}/financialMovements`),
      orderBy("performedAt", "desc"),
      limit(MOVEMENTS_LIMIT)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMovements(
        snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            amount: Number(data.amount ?? 0),
            movementType: data.movementType ?? "",
            performedAt: data.performedAt,
            referenceId: data.referenceId ?? "",
            agencyId: data.agencyId ?? "",
          };
        })
      );
    });
    return () => unsub();
  }, [companyId]);

  const agencyNames = useMemo(() => new Map(agencies.map((a) => [a.id, a.nom])), [agencies]);
  const getAgencyDisplayName = (agencyId: string) => {
    const name = agencyNames.get(agencyId);
    return name && name !== agencyId ? name : "Agence inconnue";
  };
  const agencyNameById = useMemo(() => {
    const map: Record<string, string> = {};
    agencies.forEach((a) => {
      map[a.id] = getAgencyDisplayName(a.id);
    });
    return map;
  }, [agencies]);

  const displayAccounts = useMemo(
    () =>
      accounts.filter((a) => {
        if (a.accountType !== "company_bank") return true;
        if (!a.id.startsWith("company_bank_")) return false;
        const bankId = a.id.slice("company_bank_".length);
        return Boolean(companyBanksById[bankId]);
      }),
    [accounts, companyBanksById]
  );
  const hiddenLegacyBankCount = useMemo(
    () =>
      accounts.filter((a) => {
        if (a.accountType !== "company_bank") return false;
        if (!a.id.startsWith("company_bank_")) return true;
        const bankId = a.id.slice("company_bank_".length);
        return !companyBanksById[bankId];
      }).length,
    [accounts, companyBanksById]
  );

  const totalLiquid = useMemo(
    () => displayAccounts.reduce((s, a) => s + a.currentBalance, 0),
    [displayAccounts]
  );

  const byAgency = useMemo(() => {
    const map = new Map<string, number>();
    displayAccounts.forEach((a) => {
      const key = a.agencyId ?? "_company";
      map.set(key, (map.get(key) ?? 0) + a.currentBalance);
    });
    return map;
  }, [displayAccounts]);
  const accountRows = useMemo(
    () =>
      [...displayAccounts]
        .map((a) => {
          if (a.accountType !== "company_bank") return a;
          const bankId = getCompanyBankDocIdFromAccountId(a.id);
          if (!bankId) return a;
          return { ...a, accountName: companyBanksById[bankId]?.name ?? a.accountName };
        })
        .sort((a, b) => Math.abs(b.currentBalance) - Math.abs(a.currentBalance)),
    [displayAccounts, companyBanksById]
  );
  const companyBankRows = useMemo(
    () => accountRows.filter((a) => a.accountType === "company_bank"),
    [accountRows]
  );
  const agencyWalletRows = useMemo(
    () =>
      accountRows.filter(
        (a) => a.agencyId != null && (a.accountType === "agency_cash" || a.accountType === "mobile_money")
      ),
    [accountRows]
  );
  const reserveRows = useMemo(
    () => accountRows.filter((a) => a.accountType === "expense_reserve"),
    [accountRows]
  );

  const cashByType = useMemo(() => {
    const cash = displayAccounts.filter((a) => a.accountType === "agency_cash").reduce((s, a) => s + a.currentBalance, 0);
    const bank = displayAccounts.filter((a) => a.accountType === "agency_bank" || a.accountType === "company_bank").reduce((s, a) => s + a.currentBalance, 0);
    const mobile = displayAccounts.filter((a) => a.accountType === "mobile_money").reduce((s, a) => s + a.currentBalance, 0);
    const reserve = displayAccounts.filter((a) => a.accountType === "expense_reserve").reduce((s, a) => s + a.currentBalance, 0);
    return { cash, bank, mobile, reserve };
  }, [displayAccounts]);

  const dateRange = useMemo(
    () => getDateRangeForPeriod(period, new Date(), customStart || undefined, customEnd || undefined),
    [period, customStart, customEnd]
  );

  const movementsInPeriod = useMemo(
    () =>
      movements.filter((m) => {
        const t = (m.performedAt as { toMillis?: () => number })?.toMillis?.();
        return t != null && isInRange(t, dateRange);
      }),
    [movements, dateRange]
  );

  const flowInPeriod = useMemo(
    () => movementsInPeriod.reduce((s, m) => s + m.amount, 0),
    [movementsInPeriod]
  );

  const lowBalanceAccounts = useMemo(
    () =>
      displayAccounts.filter(
        (a) =>
          a.agencyId == null &&
          a.currentBalance < LOW_BALANCE_THRESHOLD &&
          a.currentBalance >= 0
      ),
    [displayAccounts]
  );

  const largestExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 10),
    [expenses]
  );
  const currency = useMemo(() => displayAccounts.find((a) => a.currency)?.currency || "XOF", [displayAccounts]);
  const moneyFormatter = useMemo(() => {
    try {
      return new Intl.NumberFormat("fr-FR", { style: "currency", currency, maximumFractionDigits: 0 });
    } catch {
      return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
    }
  }, [currency]);
  const money = (v: number) => moneyFormatter.format(Number(v) || 0);
  const userRole = user?.role ?? "";
  const canRevealSensitive = userRole === "admin_compagnie" || userRole === "company_accountant";
  const companyBankNameById = useMemo(() => {
    const map: Record<string, string> = {};
    Object.entries(companyBanksById).forEach(([id, row]) => {
      map[id] = row.name;
    });
    return map;
  }, [companyBanksById]);
  const allBanksUnlocked = useMemo(() => {
    if (companyBankRows.length === 0) return false;
    return companyBankRows.every((row) => {
      const bankId = getCompanyBankDocIdFromAccountId(row.id);
      return !!bankId && unlockedBankIds.has(bankId);
    });
  }, [companyBankRows, unlockedBankIds]);
  const bankMoney = (v: number) => (canRevealSensitive && allBanksUnlocked ? money(v) : "••••••");
  const bankMoneyByAccount = (accountId: string, v: number) => {
    if (!canRevealSensitive) return "••••••";
    const bankId = getCompanyBankDocIdFromAccountId(accountId);
    if (!bankId) return "••••••";
    return unlockedBankIds.has(bankId) ? money(v) : "••••••";
  };

  const getAttemptKey = (bankId: string) => `bank-pin-attempts:${companyId}:${bankId}:${user?.uid ?? "anon"}`;
  const readAttemptState = (bankId: string): { attempts: number; blockedUntil: number; lockLevel: number; failedCount: number; lastFailedAt: number } => {
    try {
      const raw = localStorage.getItem(getAttemptKey(bankId));
      if (!raw) return { attempts: 0, blockedUntil: 0, lockLevel: 0, failedCount: 0, lastFailedAt: 0 };
      const parsed = JSON.parse(raw) as {
        attempts?: number;
        blockedUntil?: number;
        lockLevel?: number;
        failedCount?: number;
        lastFailedAt?: number;
      };
      return {
        attempts: Number(parsed.attempts ?? 0),
        blockedUntil: Number(parsed.blockedUntil ?? 0),
        lockLevel: Number(parsed.lockLevel ?? 0),
        failedCount: Number(parsed.failedCount ?? 0),
        lastFailedAt: Number(parsed.lastFailedAt ?? 0),
      };
    } catch {
      return { attempts: 0, blockedUntil: 0, lockLevel: 0, failedCount: 0, lastFailedAt: 0 };
    }
  };
  const writeAttemptState = (
    bankId: string,
    state: { attempts: number; blockedUntil: number; lockLevel: number; failedCount: number; lastFailedAt: number }
  ) => {
    try {
      localStorage.setItem(getAttemptKey(bankId), JSON.stringify(state));
    } catch {
      // noop
    }
  };

  useEffect(() => {
    return () => setUnlockedBankIds(new Set());
  }, []);

  const handleBankUnlock = async (accountId: string) => {
    if (!canRevealSensitive) return;
    const bankId = getCompanyBankDocIdFromAccountId(accountId);
    if (!bankId) return;
    if (unlockedBankIds.has(bankId)) {
      setUnlockedBankIds((prev) => {
        const next = new Set(prev);
        next.delete(bankId);
        return next;
      });
      return;
    }
    if (pinLoading) return;
    setPinLoading(true);
    try {
      const pinHash = companyBanksById[bankId]?.pinHash;
      if (!pinHash) {
        window.alert("PIN non configuré pour cette banque. Définissez-le dans Paramètres > Banques.");
        return;
      }
      const attemptState = readAttemptState(bankId);
      const now = Date.now();
      if (attemptState.blockedUntil > now) {
        const remaining = Math.ceil((attemptState.blockedUntil - now) / 1000);
        window.alert(`Trop de tentatives. Réessayez dans ${remaining}s.`);
        return;
      }
      const pin = window.prompt("Entrez votre PIN banque (4 chiffres) :");
      if (!pin) return;
      if (!/^\d{4}$/.test(pin)) {
        window.alert("PIN invalide. Utilisez exactement 4 chiffres.");
        return;
      }
      const hash = await sha256Hex(pin);
      if (hash !== pinHash) {
        const nextAttempts = attemptState.attempts + 1;
        if (nextAttempts >= PIN_MAX_ATTEMPTS) {
          const nextLockLevel = Math.min(attemptState.lockLevel + 1, PIN_LOCK_STEPS_MS.length - 1);
          const lockMs = PIN_LOCK_STEPS_MS[nextLockLevel];
          writeAttemptState(bankId, {
            attempts: 0,
            blockedUntil: now + lockMs,
            lockLevel: nextLockLevel,
            failedCount: attemptState.failedCount + 1,
            lastFailedAt: now,
          });
          window.alert(`PIN incorrect. Banque bloquée ${Math.ceil(lockMs / 1000)}s.`);
          return;
        }
        writeAttemptState(bankId, {
          attempts: nextAttempts,
          blockedUntil: 0,
          lockLevel: attemptState.lockLevel,
          failedCount: attemptState.failedCount + 1,
          lastFailedAt: now,
        });
        window.alert(`PIN incorrect. Tentative ${nextAttempts}/${PIN_MAX_ATTEMPTS}.`);
        return;
      }
      writeAttemptState(bankId, {
        attempts: 0,
        blockedUntil: 0,
        lockLevel: 0,
        failedCount: attemptState.failedCount,
        lastFailedAt: attemptState.lastFailedAt,
      });
      setUnlockedBankIds((prev) => {
        const next = new Set(prev);
        next.add(bankId);
        return next;
      });
    } finally {
      setPinLoading(false);
    }
  };

  const wrap = (node: React.ReactNode) =>
    embedded ? <>{node}</> : <StandardLayoutWrapper>{node}</StandardLayoutWrapper>;

  if (!companyId) {
    return wrap(
      <>
        {!embedded && <PageHeader title="Trésorerie consolidée" />}
        <p className="text-gray-500">Compagnie introuvable.</p>
      </>
    );
  }

  if (loading && accounts.length === 0) {
    return wrap(
      <>
        {!embedded && <PageHeader title="Trésorerie consolidée" />}
        <div className="flex items-center justify-center min-h-[200px] text-gray-500">Chargement trésorerie…</div>
      </>
    );
  }

  return wrap(
    <div className={embedded ? "space-y-4" : "space-y-6"}>
      {!embedded && (
        <PageHeader
        title="Trésorerie consolidée"
        subtitle={formatDateLongFr(new Date())}
        right={
          <div className="flex items-center gap-2">
            <ActionButton onClick={() => navigate(`/compagnie/${companyId}/accounting/treasury/new-operation`)}>
              Nouvelle dépense
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => navigate(`/compagnie/${companyId}/accounting/treasury/transfer`)}>
              Transfert
            </ActionButton>
            <ActionButton variant="secondary" onClick={() => navigate(`/compagnie/${companyId}/accounting/supplier-payments`)}>
              Paiement fournisseur
            </ActionButton>
            <PeriodFilterBar
              period={period}
              customStart={customStart || undefined}
              customEnd={customEnd || undefined}
              onPeriodChange={(kind, start, end) => {
                setPeriod(kind);
                setCustomStart(start ?? "");
                setCustomEnd(end ?? "");
              }}
            />
          </div>
        }
        />
      )}

      <SectionCard title="Liquidité totale" icon={Wallet}>
        <MetricCard
          label="Liquidité totale"
          value={money(totalLiquid)}
          icon={Wallet}
          valueColorVar="#4338ca"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <MetricCard label="Caisse (agences)" value={money(cashByType.cash)} icon={Banknote} valueColorVar="#b45309" />
          <MetricCard label="Banque" value={bankMoney(cashByType.bank)} icon={Building2} valueColorVar="#1d4ed8" />
          <MetricCard label="Mobile money" value={money(cashByType.mobile)} icon={Smartphone} valueColorVar="#15803d" />
          <MetricCard label="Réserve dépenses" value={money(cashByType.reserve)} icon={PiggyBank} />
        </div>
      </SectionCard>

      <SectionCard
        title="Par agence"
        icon={Building2}
        className="border-secondary/30"
        right={<span className="text-xs text-gray-500">Niveau compagnie = comptes non rattaches a une agence</span>}
      >
        <div className="overflow-auto max-h-72 rounded-lg border border-gray-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-slate-700">
              <tr>
                <th className="text-left py-2 px-3">Unite</th>
                <th className="text-right py-2 px-3">Solde</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id} className="border-b dark:border-slate-700">
                  <td className="py-2 px-3 font-medium text-primary">{getAgencyDisplayName(a.id)}</td>
                  <td className="py-2 px-3 text-right font-semibold">{money(byAgency.get(a.id) ?? 0)}</td>
                </tr>
              ))}
              {Array.from(byAgency.keys())
                .filter((k) => k !== "_company" && !agencyNames.has(k))
                .map((agencyId) => (
                  <tr key={agencyId} className="border-b dark:border-slate-700">
                    <td className="py-2 px-3 text-gray-500">Agence inconnue</td>
                    <td className="py-2 px-3 text-right">{money(byAgency.get(agencyId) ?? 0)}</td>
                  </tr>
                ))}
              <tr className="bg-primary/10 dark:bg-primary/20">
                <td className="py-2 px-3 font-semibold text-primary">Niveau compagnie</td>
                <td className="py-2 px-3 text-right font-bold text-primary">{money(byAgency.get("_company") ?? 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard
        title="Comptes bancaires de la compagnie"
        icon={Building2}
        right={
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">
              {companyBankRows.length} compte(s) banque actif(s)
              {hiddenLegacyBankCount > 0 ? ` · ${hiddenLegacyBankCount} heritage masque(s)` : ""}
            </span>
            <span className="text-xs text-gray-500">Déverrouillage par banque (PIN 4 chiffres)</span>
          </div>
        }
      >
        <div className="text-xs text-gray-500 mb-2">
          Cette zone affiche uniquement les comptes banques de la compagnie (ex: UBA).
        </div>
        {companyBankRows.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun compte bancaire compagnie actif.</p>
        ) : (
          <div className="overflow-auto max-h-72 rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-slate-700">
                <tr>
                  <th className="text-left py-2 px-3">Banque</th>
                  <th className="text-left py-2 px-3">Accès</th>
                  <th className="text-right py-2 px-3">Solde</th>
                </tr>
              </thead>
              <tbody>
                {companyBankRows.map((a) => {
                  const bankId = getCompanyBankDocIdFromAccountId(a.id);
                  const unlocked = !!bankId && unlockedBankIds.has(bankId);
                  const st = bankId ? readAttemptState(bankId) : null;
                  const now = Date.now();
                  const blocked = !!st && st.blockedUntil > now;
                  const remaining = blocked && st ? Math.ceil((st.blockedUntil - now) / 1000) : 0;
                  return (
                    <tr key={a.id} className="border-b dark:border-slate-700">
                      <td className="py-2 px-3 font-medium">
                        {getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById })}
                      </td>
                      <td className="py-2 px-3">
                        {canRevealSensitive ? (
                          <div className="flex flex-col items-start gap-1">
                            <ActionButton variant="secondary" onClick={() => handleBankUnlock(a.id)} disabled={pinLoading || blocked}>
                              {unlocked ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              <span className="ml-1">{unlocked ? "Verrouiller" : "Déverrouiller"}</span>
                            </ActionButton>
                            {blocked && <span className="text-[11px] text-amber-600">Bloqué {remaining}s</span>}
                            {!blocked && st && st.failedCount > 0 && <span className="text-[11px] text-gray-500">Échecs récents: {st.failedCount}</span>}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-500">Masqué</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold">{bankMoneyByAccount(a.id, a.currentBalance)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Portefeuilles des agences"
        icon={Smartphone}
        right={<span className="text-xs text-gray-500">{agencyWalletRows.length} portefeuille(s) agence</span>}
      >
        <div className="text-xs text-gray-500 mb-2">
          Portefeuilles operationnels des agences (caisses et mobile money d&apos;agence).
        </div>
        {agencyWalletRows.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun portefeuille agence actif.</p>
        ) : (
          <div className="overflow-auto max-h-72 rounded-lg border border-gray-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-slate-700">
                <tr>
                  <th className="text-left py-2 px-3">Agence</th>
                  <th className="text-left py-2 px-3">Type</th>
                  <th className="text-left py-2 px-3">Compte</th>
                  <th className="text-right py-2 px-3">Solde</th>
                </tr>
              </thead>
              <tbody>
                {agencyWalletRows.map((a) => (
                  <tr key={a.id} className="border-b dark:border-slate-700">
                    <td className="py-2 px-3">{getAgencyDisplayName(a.agencyId ?? "")}</td>
                    <td className="py-2 px-3 text-gray-600 dark:text-slate-300">{ACCOUNT_TYPE_LABEL[a.accountType] ?? a.accountType}</td>
                    <td className="py-2 px-3 font-medium">
                      {getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById })}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">{money(a.currentBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Réserves compagnie" icon={PiggyBank}>
        {reserveRows.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune réserve active.</p>
        ) : (
          <div className="space-y-2">
            {reserveRows.map((a) => (
              <div key={a.id} className="flex items-center justify-between rounded-lg border border-gray-200 dark:border-slate-700 p-3">
                <div>
                  <div className="font-medium">{a.accountName || "Réserve dépenses"}</div>
                  <div className="text-xs text-gray-500">Niveau compagnie</div>
                </div>
                <div className="font-semibold">{money(a.currentBalance)}</div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Flux sur la période" icon={TrendingUp}>
        <div className="text-xl font-bold">{money(flowInPeriod)}</div>
      </SectionCard>

      {lowBalanceAccounts.length > 0 && (
        <SectionCard title="Comptes à faible solde" icon={AlertCircle}>
          <ul className="space-y-1 text-sm">
            {lowBalanceAccounts.map((a) => {
              const label = a.agencyId
                ? (a.accountType === "agency_cash" ? "Caisse " : a.accountType === "agency_bank" ? "Banque " : "") + getAgencyDisplayName(a.agencyId)
                : (companyName
                  ? `${companyName} — ${getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById })}`
                  : getFinancialAccountDisplayName(a, { agencyNameById, companyBankNameById }));
              return (
                <li key={a.id}>
                  {label} — {a.accountType === "company_bank" || a.accountType === "agency_bank" ? bankMoneyByAccount(a.id, a.currentBalance) : money(a.currentBalance)}
                </li>
              );
            })}
          </ul>
        </SectionCard>
      )}

      <SectionCard title="Derniers mouvements" noPad>
        <div className="overflow-x-auto max-h-64 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Type</th>
                <th className="text-right py-1">Montant</th>
                <th className="text-left py-1">Agence</th>
              </tr>
            </thead>
            <tbody>
              {movementsInPeriod.slice(0, 30).map((m) => (
                <tr key={m.id} className="border-b">
                  <td className="py-1">{m.movementType}</td>
                  <td className="py-1 text-right">+{money(m.amount)}</td>
                  <td className="py-1">{m.agencyId ? getAgencyDisplayName(m.agencyId) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Dépenses récentes">
        {largestExpenses.length === 0 ? (
          <p className="text-sm text-gray-500">Aucune dépense.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {largestExpenses.map((e) => (
              <li key={e.id}>
                {e.category} — {money(e.amount)} — {e.status}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
