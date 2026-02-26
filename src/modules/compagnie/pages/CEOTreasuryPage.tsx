// Treasury dashboard — CEO: liquid cash, by agency, bank, mobile money, reserves, cash flow, timeline.
import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
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
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { listExpenses } from "@/modules/compagnie/treasury/expenses";
import { formatDateLongFr } from "@/utils/dateFmt";
import { getDateRangeForPeriod, isInRange, type PeriodKind } from "@/shared/date/periodUtils";
import PeriodFilterBar from "@/shared/date/PeriodFilterBar";
import { Wallet, Building2, TrendingUp, AlertCircle } from "lucide-react";

const MOVEMENTS_LIMIT = 100;
const LOW_BALANCE_THRESHOLD = 50000;

export default function CEOTreasuryPage() {
  const { user, company } = useAuth() as { user?: { companyId?: string }; company?: { nom?: string } };
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const { setHeader, resetHeader } = usePageHeader();

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
    setHeader({ title: "Trésorerie" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

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
      <div className="p-6">
        <p className="text-gray-500">Compagnie introuvable.</p>
      </div>
    );
  }

  if (loading && accounts.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Chargement trésorerie…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-gray-600">{formatDateLongFr(new Date())}</p>
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

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Wallet className="w-5 h-5" /> Liquidité totale
        </h2>
        <div className="text-2xl font-bold text-indigo-700">{totalLiquid.toLocaleString("fr-FR")}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div className="p-3 rounded-lg bg-amber-50">
            <div className="text-sm text-amber-800">Caisse (agences)</div>
            <div className="font-bold">{cashByType.cash.toLocaleString("fr-FR")}</div>
          </div>
          <div className="p-3 rounded-lg bg-blue-50">
            <div className="text-sm text-blue-800">Banque</div>
            <div className="font-bold">{cashByType.bank.toLocaleString("fr-FR")}</div>
          </div>
          <div className="p-3 rounded-lg bg-green-50">
            <div className="text-sm text-green-800">Mobile money</div>
            <div className="font-bold">{cashByType.mobile.toLocaleString("fr-FR")}</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50">
            <div className="text-sm text-slate-800">Réserve dépenses</div>
            <div className="font-bold">{cashByType.reserve.toLocaleString("fr-FR")}</div>
          </div>
        </div>
      </section>

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Building2 className="w-5 h-5" /> Par agence
        </h2>
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
      </section>

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> Flux sur la période
        </h2>
        <div className="text-xl font-bold">{flowInPeriod.toLocaleString("fr-FR")}</div>
      </section>

      {lowBalanceAccounts.length > 0 && (
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2 text-amber-700">
            <AlertCircle className="w-5 h-5" /> Comptes à faible solde
          </h2>
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
        </section>
      )}

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Derniers mouvements</h2>
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
      </section>

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Dépenses récentes</h2>
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
      </section>
    </div>
  );
}
