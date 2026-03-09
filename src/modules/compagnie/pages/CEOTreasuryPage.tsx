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
import { formatDateLongFr } from "@/utils/dateFmt";
import { getDateRangeForPeriod, isInRange, type PeriodKind } from "@/shared/date/periodUtils";
import PeriodFilterBar from "@/shared/date/PeriodFilterBar";
import { Wallet, Building2, TrendingUp, AlertCircle, Banknote, Smartphone, PiggyBank } from "lucide-react";

const MOVEMENTS_LIMIT = 100;
const LOW_BALANCE_THRESHOLD = 50000;

export default function CEOTreasuryPage() {
  const { user, company } = useAuth() as { user?: { companyId?: string }; company?: { nom?: string } };
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const navigate = useNavigate();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const [accounts, setAccounts] = useState<{ id: string; agencyId: string | null; accountType: string; accountName: string; currentBalance: number; currency: string }[]>([]);
  const [movements, setMovements] = useState<{ id: string; amount: number; movementType: string; performedAt: unknown; referenceId: string; agencyId: string }[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string }[]>([]);
  const [companyName, setCompanyName] = useState<string>("");
  const [expenses, setExpenses] = useState<{ id: string; amount: number; status: string; category: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKind>("month");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    (async () => {
      const companySnap = await getDoc(doc(db, "companies", companyId));
      const nom = (companySnap.data() as { nom?: string } | undefined)?.nom ?? (company as { nom?: string } | undefined)?.nom ?? "";
      setCompanyName(nom);
      const [ags, exps] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "agences")).then((s) =>
          s.docs.map((d) => {
            const data = d.data() as { nom?: string; nomAgence?: string; name?: string };
            const nom = data.nom ?? data.nomAgence ?? data.name ?? "";
            return { id: d.id, nom: nom || d.id };
          })
        ),
        listExpenses(companyId, { limitCount: 20 }),
      ]);
      setAgencies(ags);
      setExpenses(exps);
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

  const totalLiquid = useMemo(
    () => accounts.reduce((s, a) => s + a.currentBalance, 0),
    [accounts]
  );

  const byAgency = useMemo(() => {
    const map = new Map<string, number>();
    accounts.forEach((a) => {
      const key = a.agencyId ?? "_company";
      map.set(key, (map.get(key) ?? 0) + a.currentBalance);
    });
    return map;
  }, [accounts]);

  const cashByType = useMemo(() => {
    const cash = accounts.filter((a) => a.accountType === "agency_cash").reduce((s, a) => s + a.currentBalance, 0);
    const bank = accounts.filter((a) => a.accountType === "agency_bank" || a.accountType === "company_bank").reduce((s, a) => s + a.currentBalance, 0);
    const mobile = accounts.filter((a) => a.accountType === "mobile_money").reduce((s, a) => s + a.currentBalance, 0);
    const reserve = accounts.filter((a) => a.accountType === "expense_reserve").reduce((s, a) => s + a.currentBalance, 0);
    return { cash, bank, mobile, reserve };
  }, [accounts]);

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
      accounts.filter(
        (a) =>
          a.agencyId == null &&
          a.currentBalance < LOW_BALANCE_THRESHOLD &&
          a.currentBalance >= 0
      ),
    [accounts]
  );

  const largestExpenses = useMemo(
    () => [...expenses].sort((a, b) => b.amount - a.amount).slice(0, 10),
    [expenses]
  );

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Trésorerie" />
        <p className="text-gray-500">Compagnie introuvable.</p>
      </StandardLayoutWrapper>
    );
  }

  if (loading && accounts.length === 0) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Trésorerie" />
        <div className="flex items-center justify-center min-h-[200px] text-gray-500">Chargement trésorerie…</div>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Trésorerie"
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

      <SectionCard title="Liquidité totale" icon={Wallet}>
        <MetricCard
          label="Liquidité totale"
          value={totalLiquid.toLocaleString("fr-FR")}
          icon={Wallet}
          valueColorVar="#4338ca"
        />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <MetricCard label="Caisse (agences)" value={cashByType.cash.toLocaleString("fr-FR")} icon={Banknote} valueColorVar="#b45309" />
          <MetricCard label="Banque" value={cashByType.bank.toLocaleString("fr-FR")} icon={Building2} valueColorVar="#1d4ed8" />
          <MetricCard label="Mobile money" value={cashByType.mobile.toLocaleString("fr-FR")} icon={Smartphone} valueColorVar="#15803d" />
          <MetricCard label="Réserve dépenses" value={cashByType.reserve.toLocaleString("fr-FR")} icon={PiggyBank} />
        </div>
      </SectionCard>

      <SectionCard title="Par agence" icon={Building2} noPad>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Agence</th>
                <th className="text-right py-2">Solde</th>
              </tr>
            </thead>
            <tbody>
              {agencies.map((a) => (
                <tr key={a.id} className="border-b">
                  <td className="py-2">{getAgencyDisplayName(a.id)}</td>
                  <td className="py-2 text-right font-medium">{(byAgency.get(a.id) ?? 0).toLocaleString("fr-FR")}</td>
                </tr>
              ))}
              {Array.from(byAgency.keys())
                .filter((k) => k !== "_company" && !agencyNames.has(k))
                .map((agencyId) => (
                  <tr key={agencyId} className="border-b">
                    <td className="py-2 text-gray-500">Agence inconnue</td>
                    <td className="py-2 text-right font-medium">{(byAgency.get(agencyId) ?? 0).toLocaleString("fr-FR")}</td>
                  </tr>
                ))}
              <tr className="border-b">
                <td className="py-2">Niveau compagnie</td>
                <td className="py-2 text-right font-medium">{(byAgency.get("_company") ?? 0).toLocaleString("fr-FR")}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      <SectionCard title="Flux sur la période" icon={TrendingUp}>
        <div className="text-xl font-bold">{flowInPeriod.toLocaleString("fr-FR")}</div>
      </SectionCard>

      {lowBalanceAccounts.length > 0 && (
        <SectionCard title="Comptes à faible solde" icon={AlertCircle}>
          <ul className="space-y-1 text-sm">
            {lowBalanceAccounts.map((a) => {
              const label = a.agencyId
                ? (a.accountType === "agency_cash" ? "Caisse " : a.accountType === "agency_bank" ? "Banque " : "") + getAgencyDisplayName(a.agencyId)
                : (companyName ? `${companyName} — ${a.accountName}` : a.accountName);
              return (
                <li key={a.id}>
                  {label} — {a.currentBalance.toLocaleString("fr-FR")} {a.currency}
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
                  <td className="py-1 text-right">+{m.amount.toLocaleString("fr-FR")}</td>
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
                {e.category} — {e.amount.toLocaleString("fr-FR")} — {e.status}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
