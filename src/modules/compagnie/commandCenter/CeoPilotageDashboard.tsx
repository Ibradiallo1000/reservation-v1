/**
 * Poste de pilotage (CEO) — vue synthèse : trésorerie ledger, activité jour, alertes, tendance.
 * Règles : ledger ≠ activité ; sessions non affichées ici.
 */
import React, { useEffect, useMemo, useState } from "react";
import { collection, collectionGroup, getDocs, limit, query, Timestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { SectionCard, MetricCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { getUnifiedCompanyFinance } from "@/modules/finance/services/unifiedFinanceService";
import { getNetworkSales, type FinancialPeriod } from "@/modules/finance/services/financialConsistencyService";
import { getTodayBamako, getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { listUnpaidPayables } from "@/modules/compagnie/finance/payablesService";
import { listClosedCashSessionsWithDiscrepancy } from "@/modules/agence/cashControl/cashSessionService";
import { RevenueReservationsChart } from "@/modules/compagnie/admin/components/CompanyDashboard/RevenueReservationsChart";
import type { PeriodKind } from "@/shared/date/periodUtils";
import { AlertTriangle, Landmark, Ticket, Package, TrendingUp } from "lucide-react";

const PAID_SHIPMENT = new Set(["PAID_ORIGIN", "PAID_DESTINATION"]);

type DailyAgg = { date: string; revenue: number; reservations: number };

type Props = {
  companyId: string;
  periodStartStr: string;
  periodEndStr: string;
  periodKind: PeriodKind;
};

export default function CeoPilotageDashboard({ companyId, periodStartStr, periodEndStr, periodKind }: Props) {
  const money = useFormatCurrency();
  const [ledger, setLedger] = useState<{
    total: number;
    cash: number;
    mobileMoney: number;
    bank: number;
  } | null>(null);
  const [todayAct, setTodayAct] = useState<{ ventes: number; billets: number; colis: number } | null>(null);
  const [dailyChart, setDailyChart] = useState<DailyAgg[]>([]);
  const [alerts, setAlerts] = useState<{ level: "warning" | "error"; text: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const today = getTodayBamako();
        const dayStart = getStartOfDayInBamako(today);
        const dayEnd = getEndOfDayInBamako(today);
        const period: FinancialPeriod = { dateFrom: periodStartStr, dateTo: periodEndStr };
        const todayPeriod: FinancialPeriod = { dateFrom: today, dateTo: today };

        const agSnap = await getDocs(collection(db, "companies", companyId, "agences"));
        const aids = agSnap.docs.map((d) => d.id);
        if (cancelled) return;

        const [unified, salesToday, qDaily, payables, shipTodaySnap] = await Promise.all([
          getUnifiedCompanyFinance(companyId, periodStartStr, periodEndStr),
          getNetworkSales(companyId, todayPeriod),
          getDocs(
            query(
              collectionGroup(db, "dailyStats"),
              where("companyId", "==", companyId),
              where("date", ">=", periodStartStr),
              where("date", "<=", periodEndStr),
              limit(2000)
            )
          ).catch(() => ({ docs: [] as { data: () => Record<string, unknown> }[] })),
          listUnpaidPayables(companyId, { limitCount: 200 }).catch(() => []),
          getDocs(
            query(
              shipmentsRef(db, companyId),
              where("createdAt", ">=", Timestamp.fromDate(dayStart)),
              where("createdAt", "<=", Timestamp.fromDate(dayEnd))
            )
          ).catch(() => ({ docs: [] as { data: () => Record<string, unknown> }[] })),
        ]);

        if (cancelled) return;

        const rm = unified.realMoney;
        setLedger({
          total: rm.total,
          cash: rm.cash,
          mobileMoney: rm.mobileMoney,
          bank: rm.bank,
        });

        let colis = 0;
        let colisCa = 0;
        for (const d of shipTodaySnap.docs) {
          const x = d.data() as { paymentStatus?: string; transportFee?: number; insuranceAmount?: number };
          if (!PAID_SHIPMENT.has(String(x.paymentStatus ?? ""))) continue;
          colis += 1;
          colisCa += Number(x.transportFee ?? 0) + Number(x.insuranceAmount ?? 0);
        }
        setTodayAct({
          ventes: salesToday.total + colisCa,
          billets: salesToday.tickets,
          colis,
        });

        const byDate = new Map<string, DailyAgg>();
        for (const d of qDaily.docs) {
          const data = d.data() as {
            date?: string;
            ticketRevenue?: number;
            courierRevenue?: number;
            totalRevenue?: number;
            totalPassengers?: number;
          };
          const date = String(data.date ?? "");
          if (!date) continue;
          const ticket = Number(data.ticketRevenue ?? 0);
          const courier = Number(data.courierRevenue ?? 0);
          const total = Number(data.totalRevenue ?? 0) || ticket + courier;
          const passengers = Number(data.totalPassengers ?? 0);
          const cur = byDate.get(date) ?? { date, revenue: 0, reservations: 0 };
          cur.revenue += total;
          cur.reservations += passengers > 0 ? passengers : 0;
          byDate.set(date, cur);
        }
        const series = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
        setDailyChart(series);

        const nextAlerts: { level: "warning" | "error"; text: string }[] = [];
        const unpaid = payables.reduce((s, p) => s + (Number(p.remainingAmount) || 0), 0);
        if (unpaid > 0) {
          nextAlerts.push({
            level: "warning",
            text: `Engagements à payer : ${money(unpaid)} (${payables.length} ligne(s)).`,
          });
        }
        try {
          const disc = await listClosedCashSessionsWithDiscrepancy(companyId, aids);
          if (disc.length > 0) {
            nextAlerts.push({
              level: "warning",
              text: `${disc.length} session(s) caisse avec écart détecté — voir Finances › Caisse.`,
            });
          }
        } catch {
          /* ignore */
        }
        if (rm.total < 0) {
          nextAlerts.push({ level: "error", text: "Solde liquidité total négatif — vérifier les comptes." });
        }
        setAlerts(nextAlerts);
      } catch (e) {
        console.error("[CeoPilotageDashboard]", e);
        setLedger(null);
        setTodayAct(null);
        setDailyChart([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- money() stable pour l'affichage
  }, [companyId, periodStartStr, periodEndStr]);

  const chartPoints = useMemo(() => {
    if (dailyChart.length === 0) return [];
    return dailyChart.map((d) => ({
      date: d.date,
      revenue: d.revenue,
      reservations: d.reservations || Math.max(1, Math.round(d.revenue / 10000)),
    }));
  }, [dailyChart]);

  const chartRange = periodKind === "day" ? "day" : dailyChart.length <= 7 ? "week" : "month";

  return (
    <div className="space-y-6">
      <SectionCard title="Trésorerie disponible" icon={Landmark} className="border border-slate-200 dark:border-slate-600">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Soldes issus du grand livre (comptes réels). Hors sessions guichet en attente.
        </p>
        {loading && !ledger ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total disponible" value={money(ledger?.total ?? 0)} icon={Landmark} />
            <MetricCard label="Caisse agences" value={money(ledger?.cash ?? 0)} icon={Landmark} />
            <MetricCard label="Mobile money" value={money(ledger?.mobileMoney ?? 0)} icon={Landmark} />
            <MetricCard label="Banque" value={money(ledger?.bank ?? 0)} icon={Landmark} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Activité du jour" icon={Ticket} className="border border-slate-200 dark:border-slate-600">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Billets et colis enregistrés aujourd&apos;hui (passagers + courrier payé).
        </p>
        {loading && !todayAct ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <MetricCard
              label="Chiffre d'activité"
              value={money(todayAct?.ventes ?? 0)}
              icon={TrendingUp}
            />
            <MetricCard label="Billets vendus (places)" value={String(todayAct?.billets ?? 0)} icon={Ticket} />
            <MetricCard label="Colis envoyés" value={String(todayAct?.colis ?? 0)} icon={Package} />
          </div>
        )}
      </SectionCard>

      <SectionCard title="Alertes" icon={AlertTriangle} className="border border-slate-200 dark:border-slate-600">
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">Aucune alerte prioritaire.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a, i) => (
              <li
                key={i}
                className={
                  a.level === "error"
                    ? "text-red-700 dark:text-red-300 text-sm"
                    : "text-amber-800 dark:text-amber-200 text-sm"
                }
              >
                {a.text}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Évolution de l'activité" icon={TrendingUp} className="border border-slate-200 dark:border-slate-600">
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Agrégats journaliers (billets + courrier) sur la période sélectionnée.
        </p>
        <RevenueReservationsChart
          data={
            chartPoints.length > 0
              ? chartPoints
              : [{ date: periodStartStr, revenue: 0, reservations: 0 }]
          }
          loading={loading}
          range={chartRange}
        />
      </SectionCard>
    </div>
  );
}
