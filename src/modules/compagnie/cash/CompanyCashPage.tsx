/**
 * Vue Finance / Caisse compagnie : revenus par agence, par escale, argent en caisse, clôturé, différences.
 * Accessible par admin_compagnie.
 */
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import {
  getCashTransactionsByDate,
  getClosuresByDate,
  getCashRefundsByDate,
  getCashTransfersByDate,
} from "./cashService";
import { CASH_TRANSACTION_STATUS } from "./cashTypes";
import type { CashTransactionDocWithId, CashClosureDocWithId, CashRefundDocWithId, CashTransferDocWithId } from "./cashTypes";
import { listRoutes } from "@/modules/compagnie/routes/routesService";
import type { RouteDocWithId } from "@/modules/compagnie/routes/routesTypes";
import { Wallet, Building2, MapPin, TrendingUp, AlertCircle, Route, ArrowUpRight, ArrowDownLeft } from "lucide-react";

export default function CompanyCashPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const money = useFormatCurrency();
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [transactions, setTransactions] = useState<CashTransactionDocWithId[]>([]);
  const [closures, setClosures] = useState<CashClosureDocWithId[]>([]);
  const [refunds, setRefunds] = useState<CashRefundDocWithId[]>([]);
  const [transfers, setTransfers] = useState<CashTransferDocWithId[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nom: string; type?: string }[]>([]);
  const [routes, setRoutes] = useState<RouteDocWithId[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [agencesSnap, txList, closureList, routesList, refundsList, transfersList] = await Promise.all([
        getDocs(collection(db, "companies", companyId, "agences")),
        getCashTransactionsByDate(companyId, date),
        getClosuresByDate(companyId, date),
        listRoutes(companyId).catch(() => []),
        getCashRefundsByDate(companyId, date),
        getCashTransfersByDate(companyId, date),
      ]);
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

  const totalCash = Array.from(byLocation.values()).reduce((s, v) => s + v.amount, 0);
  const totalClosed = closures.reduce((s, c) => s + c.declaredAmount, 0);
  const totalDiff = closures.reduce((s, c) => s + c.difference, 0);
  const totalRefunded = refunds.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const totalTransferred = transfers.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  if (!companyId) {
    return (
      <StandardLayoutWrapper>
        <PageHeader title="Finance — Caisse" icon={Wallet} />
        <SectionCard title="Accès">
          <p className="text-gray-600 dark:text-gray-400">Compagnie non identifiée.</p>
        </SectionCard>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Finance — Caisse"
        subtitle="Revenus par point de vente, argent en caisse et clôtures"
        icon={Wallet}
      />

      <div className="mb-4 flex items-center gap-4">
        <label className="text-sm font-medium">Date</label>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            <MetricCard
              label="Argent en caisse"
              value={money(totalCash)}
              icon={Wallet}
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

          <SectionCard title="Revenus par point de vente" noPad>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left p-3">Point de vente</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-right p-3">Transactions</th>
                    <th className="text-right p-3">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {agencies.map((ag) => {
                    const row = byLocation.get(ag.id);
                    const amount = row?.amount ?? 0;
                    const count = row?.count ?? 0;
                    const locType = row?.locationType ?? ag.type ?? "agence";
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
                        <td className="p-3 text-right">{count}</td>
                        <td className="p-3 text-right font-medium">{money(amount)}</td>
                      </tr>
                    );
                  })}
                  {agencies.length === 0 && (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-gray-500">
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
    </StandardLayoutWrapper>
  );
}
