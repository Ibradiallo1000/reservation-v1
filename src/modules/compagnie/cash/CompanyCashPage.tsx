/**
 * Vue Finance / Caisse compagnie : revenus par agence, par escale, argent en caisse, clôturé, différences.
 * Accessible par admin_compagnie.
 */
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { useGlobalDataSnapshot } from "@/contexts/GlobalDataSnapshotContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  getCashTransactionsByPaidAtRange,
  getClosuresByDate,
  getCashRefundsByDate,
  getCashTransfersByDate,
} from "./cashService";
import { getLedgerBalances } from "@/modules/compagnie/treasury/financialTransactions";
import { getAgencyLedgerLiquidityMap } from "@/modules/compagnie/treasury/ledgerAccounts";
import { CASH_TRANSACTION_STATUS } from "./cashTypes";
import type { CashTransactionDocWithId, CashClosureDocWithId, CashRefundDocWithId, CashTransferDocWithId } from "./cashTypes";
import { listRoutes } from "@/modules/compagnie/routes/routesService";
import type { RouteDocWithId } from "@/modules/compagnie/routes/routesTypes";
import { Wallet, Building2, MapPin, TrendingUp, AlertCircle, Route, ArrowUpRight, ArrowDownLeft, Smartphone } from "lucide-react";

type CompanyCashPageProps = { embedded?: boolean };

export default function CompanyCashPage({ embedded = false }: CompanyCashPageProps) {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const globalPeriod = useGlobalPeriodContext();
  const globalSnapshot = useGlobalDataSnapshot();
  /** Date d'encaissement = premier jour de la période globale (jour J par défaut). */
  const date = globalPeriod.startDate;
  const setDate = useCallback(
    (newDate: string) => {
      globalPeriod.setCustomRange(newDate, newDate);
    },
    [globalPeriod]
  );
  const [transactions, setTransactions] = useState<CashTransactionDocWithId[]>([]);
  const [closures, setClosures] = useState<CashClosureDocWithId[]>([]);
  const [refunds, setRefunds] = useState<CashRefundDocWithId[]>([]);
  const [transfers, setTransfers] = useState<CashTransferDocWithId[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string; type?: string }[]>([]);
  const [routes, setRoutes] = useState<RouteDocWithId[]>([]);
  const [loading, setLoading] = useState(true);
  /** Somme des comptes ledger `type === cash` (caisse physique réseau, hors mobile money). */
  const [ledgerLiquidity, setLedgerLiquidity] = useState<{
    cash: number;
    mobileMoney: number;
    bank: number;
    total: number;
  } | null>(null);
  const [agencyLedger, setAgencyLedger] = useState<Record<string, { cash: number; mobileMoney: number }>>({});

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      setLedgerLiquidity(null);
      return;
    }
    setLoading(true);
    try {
      const [agencesSnap, txList, closureList, routesList, refundsList, transfersList, ledger] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "agences")),
        getCashTransactionsByPaidAtRange(companyId, date, date),
        getClosuresByDate(companyId, date),
        listRoutes(companyId).catch(() => []),
        getCashRefundsByDate(companyId, date),
        getCashTransfersByDate(companyId, date),
        getLedgerBalances(companyId).catch(() => null),
      ]);
      setLedgerLiquidity(ledger);
      setRoutes(routesList);
      setRefunds(refundsList);
      setTransfers(transfersList);
      const ags = agencesSnap.docs.map((d) => {
        const data = d.data() as { nom?: string; nomAgence?: string; name?: string; type?: string };
        return {
          id: d.id,
          nom: data.nom ?? data.nomAgence ?? data.name ?? d.id,
          type: data.type,
        };
      });
      setAgencies(ags);
      const map = await getAgencyLedgerLiquidityMap(companyId, ags.map((a) => a.id)).catch(() => ({}));
      setAgencyLedger(map);
      setTransactions(txList);
      setClosures(closureList);
    } catch (e) {
      console.error("[CompanyCashPage] load:", e);
    } finally {
      setLoading(false);
    }
  }, [companyId, date]);

  useEffect(() => {
    load();
  }, [load]);

  /** Volume encaissements du jour (cashTransactions) — activité, pas solde ledger. */
  const byLocation = React.useMemo(() => {
    const map = new Map<string, { amount: number; count: number; locationType: string }>();
    for (const t of transactions) {
      if ((t as { status?: string }).status === CASH_TRANSACTION_STATUS.REFUNDED) continue;
      const loc = t.locationId;
      const cur = map.get(loc) ?? { amount: 0, count: 0, locationType: t.locationType };
      cur.amount += Number(t.amount) || 0;
      cur.count += 1;
      cur.locationType = t.locationType;
      map.set(loc, cur);
    }
    return map;
  }, [transactions]);

  const byRoute = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const t of transactions) {
      if ((t as { status?: string }).status === CASH_TRANSACTION_STATUS.REFUNDED) continue;
      const rid = (t as { routeId?: string | null }).routeId ?? "_sans_route";
      map.set(rid, (map.get(rid) ?? 0) + (Number(t.amount) || 0));
    }
    return map;
  }, [transactions]);

  const totalClosed = closures.reduce((s, c) => s + c.declaredAmount, 0);
  const totalDiff = closures.reduce((s, c) => s + c.difference, 0);
  const totalRefunded = refunds.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalTransferred = transfers.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  if (!companyId) {
    const msg = <SectionCard title="Accès"><p className="text-gray-600 dark:text-gray-400">Compagnie non identifiée.</p></SectionCard>;
    return embedded ? msg : <StandardLayoutWrapper><PageHeader title="Finance — Caisse" icon={Wallet} />{msg}</StandardLayoutWrapper>;
  }

  const content = (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          {globalSnapshot.snapshot.mode === "realtime" ? "Mis à jour en temps réel" : "Mis à jour"}{" "}
          :{" "}
          {globalSnapshot.snapshot.lastUpdatedAt
            ? globalSnapshot.snapshot.lastUpdatedAt.toLocaleTimeString("fr-FR")
            : "—"}
        </span>
        <button
          type="button"
          onClick={() => void globalSnapshot.refresh()}
          className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          Rafraîchir
        </button>
      </div>
      <div className="mb-4 flex items-center gap-4">
        <label className="text-sm font-medium">Jour d&apos;activité (filtre createdAt + fuseau agence)</label>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-700"
        />
      </div>

      {loading ? (
        <SectionCard title="Chargement">
          <p className="text-gray-500">Chargement des données caisse…</p>
        </SectionCard>
      ) : (
        <>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">
            1 — Argent réel (comptes <code className="text-xs">accounts</code>, champ <code className="text-xs">type</code>)
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-2">
            <MetricCard
              label="Caisse espèces (ledger)"
              value={ledgerLiquidity == null ? "—" : money(ledgerLiquidity.cash)}
              icon={Wallet}
            />
            <MetricCard
              label="Mobile money (ledger)"
              value={ledgerLiquidity == null ? "—" : money(ledgerLiquidity.mobileMoney)}
              icon={Smartphone}
            />
            <MetricCard
              label="Banque (ledger)"
              value={ledgerLiquidity == null ? "—" : money(ledgerLiquidity.bank)}
              icon={Building2}
            />
          </div>
          <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mt-6 mb-2">
            2 — Activité (jour) — cashTransactions / clôtures
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-2">
            <MetricCard
              label="Volume encaissements (jour)"
              value={globalSnapshot.loading ? "—" : money(globalSnapshot.snapshot.cash)}
              icon={TrendingUp}
            />
            <MetricCard
              label="Argent transféré"
              value={money(totalTransferred)}
              icon={ArrowUpRight}
            />
            <MetricCard
              label="Argent remboursé"
              value={money(totalRefunded)}
              icon={ArrowDownLeft}
              valueColorVar={totalRefunded > 0 ? "#b91c1c" : undefined}
            />
            <MetricCard
              label="Argent clôturé (jour)"
              value={money(totalClosed)}
              icon={TrendingUp}
            />
            <MetricCard
              label="Écart clôtures"
              value={money(totalDiff)}
              icon={AlertCircle}
              valueColorVar={totalDiff !== 0 ? "#b91c1c" : undefined}
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            La caisse affichée en section 1 = uniquement les soldes des comptes <strong>type=cash</strong>. Le volume du jour =
            somme des <strong>cashTransactions</strong> payées (tous canaux) — ne pas confondre avec le solde.
          </p>

          {byRoute.size > 0 && (
            <SectionCard title="Revenus par route" noPad className="mb-6">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left p-3">Route</th>
                      <th className="text-right p-3">Montant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(byRoute.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([routeId, amount]) => {
                        const route = routes.find((r) => r.id === routeId);
                        const label =
                          routeId === "_sans_route"
                            ? "Sans route"
                            : route
                              ? `${route.origin ?? (route as { departureCity?: string }).departureCity ?? "?"} → ${route.destination ?? (route as { arrivalCity?: string }).arrivalCity ?? "?"}`
                              : routeId;
                        return (
                          <tr key={routeId} className="border-b border-gray-100 dark:border-gray-800">
                            <td className="p-3 font-medium">
                              {routeId === "_sans_route" ? (
                                <span className="text-gray-500">{label}</span>
                              ) : (
                                <span className="inline-flex items-center gap-1">
                                  <Route className="w-3.5 h-3.5 text-gray-400" />
                                  {label}
                                </span>
                              )}
                            </td>
                            <td className="p-3 text-right font-medium">{money(amount)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}

          <SectionCard title="Par point de vente : soldes ledger vs volume du jour" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-3">Point de vente</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-right p-3">Caisse ledger (cash)</th>
                    <th className="text-right p-3">MM ledger</th>
                    <th className="text-right p-3">Tx (jour)</th>
                    <th className="text-right p-3">Volume jour</th>
                  </tr>
                </thead>
                <tbody>
                  {agencies.map((ag) => {
                    const row = byLocation.get(ag.id);
                    const vol = row?.amount ?? 0;
                    const count = row?.count ?? 0;
                    const locType = row?.locationType ?? ag.type ?? "agence";
                    const led = agencyLedger[ag.id] ?? { cash: 0, mobileMoney: 0 };
                    return (
                      <tr key={ag.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="p-3 font-medium">{ag.nom}</td>
                        <td className="p-3">
                          {locType === "escale" ? (
                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                              <MapPin className="w-3.5 h-3.5" /> Escale
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-gray-600 dark:text-gray-400">
                              <Building2 className="w-3.5 h-3.5" /> Agence
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-right font-medium">{money(led.cash)}</td>
                        <td className="p-3 text-right">{money(led.mobileMoney)}</td>
                        <td className="p-3 text-right">{count}</td>
                        <td className="p-3 text-right font-medium text-slate-600 dark:text-slate-300">{money(vol)}</td>
                      </tr>
                    );
                  })}
                  {agencies.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-gray-500">
                        Aucune agence.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <SectionCard title="Clôtures du jour" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-3">Point de vente</th>
                    <th className="text-right p-3">Attendu</th>
                    <th className="text-right p-3">Déclaré</th>
                    <th className="text-right p-3">Différence</th>
                  </tr>
                </thead>
                <tbody>
                  {closures.map((c) => {
                    const ag = agencies.find((a) => a.id === c.locationId);
                    return (
                      <tr key={c.id} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="p-3 font-medium">{ag?.nom ?? c.locationId}</td>
                        <td className="p-3 text-right">{money(c.expectedAmount)}</td>
                        <td className="p-3 text-right">{money(c.declaredAmount)}</td>
                        <td
                          className={`p-3 text-right font-medium ${
                            c.difference > 0 ? "text-green-600" : c.difference < 0 ? "text-red-600" : "text-gray-500"
                          }`}
                        >
                          {c.difference > 0 ? "+" : ""}
                          {money(c.difference)}
                        </td>
                      </tr>
                    );
                  })}
                  {closures.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-gray-500">
                        Aucune clôture pour cette date.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </>
  );

  if (embedded) return content;
  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Finance — Caisse"
        subtitle="Caisse ledger, encaissements du jour et clôtures"
        icon={Wallet}
      />
      {content}
    </StandardLayoutWrapper>
  );
}
