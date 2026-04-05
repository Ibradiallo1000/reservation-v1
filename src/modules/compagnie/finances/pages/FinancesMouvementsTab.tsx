/**
 * Onglet Mouvements — journal financialTransactions sur la période globale.
 */
import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { SectionCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { listFinancialTransactionsByPeriod } from "@/modules/compagnie/treasury/financialTransactions";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import { getStartOfDayForDate, getEndOfDayForDate, DEFAULT_AGENCY_TIMEZONE } from "@/shared/date/dateUtilsTz";
import { formatDateLongFr } from "@/utils/dateFmt";
import { ArrowRightLeft } from "lucide-react";

function performedAtMs(row: FinancialTransactionDoc & { id: string }): number {
  const p = row.performedAt as Timestamp | undefined;
  const d = p?.toDate?.();
  return d ? d.getTime() : 0;
}

function sourceLabel(row: FinancialTransactionDoc & { id: string }): string {
  const pm = String(row.paymentMethod ?? "");
  const ch = String(row.paymentChannel ?? "");
  const prov = String(row.paymentProvider ?? "");
  if (prov) return `${pm || ch || "—"} (${prov})`.trim();
  return pm || ch || String(row.source ?? "—");
}

export default function FinancesMouvementsTab() {
  const { user } = useAuth();
  const { companyId: routeId } = useParams<{ companyId: string }>();
  const companyId = routeId ?? user?.companyId ?? "";
  const globalPeriod = useGlobalPeriodContext();
  const money = useFormatCurrency();
  const [rows, setRows] = useState<Array<FinancialTransactionDoc & { id: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const start = Timestamp.fromDate(
          getStartOfDayForDate(globalPeriod.startDate, DEFAULT_AGENCY_TIMEZONE)
        );
        const end = Timestamp.fromDate(getEndOfDayForDate(globalPeriod.endDate, DEFAULT_AGENCY_TIMEZONE));
        const list = await listFinancialTransactionsByPeriod(companyId, start, end);
        if (!cancelled) {
          setRows([...list].sort((a, b) => performedAtMs(b) - performedAtMs(a)));
        }
      } catch (e) {
        console.error("[FinancesMouvementsTab]", e);
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, globalPeriod.startDate, globalPeriod.endDate]);

  return (
    <SectionCard title="Mouvements" icon={ArrowRightLeft}>
      {loading ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun mouvement sur cette période.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-600">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Montant</th>
                <th className="px-3 py-2 font-medium">Source</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const p = r.performedAt as Timestamp | undefined;
                const d = p?.toDate?.() ?? new Date(0);
                const amt = Number(r.amount) || 0;
                return (
                  <tr key={r.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateLongFr(d)}</td>
                    <td className="px-3 py-2">{String(r.type ?? "—")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(amt)}</td>
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{sourceLabel(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
