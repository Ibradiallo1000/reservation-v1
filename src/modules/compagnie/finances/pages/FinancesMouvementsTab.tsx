/**
 * Section « Flux récents » — 5 dernières opérations, libellés métier uniquement.
 */
import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Timestamp } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { useGlobalPeriodContext } from "@/contexts/GlobalPeriodContext";
import { SectionCard } from "@/ui";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { listFinancialTransactionsByPeriod } from "@/modules/compagnie/treasury/financialTransactions";
import type { FinancialTransactionDoc } from "@/modules/compagnie/treasury/types";
import { getStartOfDayForDate, getEndOfDayForDate, DEFAULT_AGENCY_TIMEZONE } from "@/shared/date/dateUtilsTz";
import { ArrowRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDateFrSlash, mapTransactionToFluxRecent } from "../financesCeoDisplayMap";
import {
  resolveLiquidCompanyColors,
  liquidFluxRowStyle,
  liquidFluxRowAccent,
  liquidMetricValueColor,
} from "../financesLiquidityCardStyles";
import { useHtmlDarkClass } from "@/shared/hooks/useHtmlDarkClass";
import InfoTooltip from "@/shared/ui/InfoTooltip";

const MAX_FLUX = 5;

function performedAtMs(row: FinancialTransactionDoc & { id: string }): number {
  const p = row.performedAt as Timestamp | undefined;
  const d = p?.toDate?.();
  return d ? d.getTime() : 0;
}

export default function FinancesMouvementsTab() {
  const { user, company } = useAuth();
  const { primary, secondary } = useMemo(() => resolveLiquidCompanyColors(company ?? undefined), [company]);
  const isDark = useHtmlDarkClass();
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

  const fluxLines = React.useMemo(() => {
    const out: Array<{
      key: string;
      dateStr: string;
      mapped: NonNullable<ReturnType<typeof mapTransactionToFluxRecent>>;
    }> = [];
    for (const r of rows) {
      const mapped = mapTransactionToFluxRecent(r);
      if (!mapped) continue;
      const p = r.performedAt as Timestamp | undefined;
      const d = p?.toDate?.() ?? new Date(0);
      out.push({
        key: r.id,
        dateStr: formatDateFrSlash(d),
        mapped,
      });
      if (out.length >= MAX_FLUX) break;
    }
    return out;
  }, [rows]);

  return (
    <section aria-labelledby="finances-flux-recents" className="space-y-4">
      <SectionCard title="Flux récents" icon={ArrowRightLeft}>
        <div className="mb-3 flex justify-end">
          <InfoTooltip label={`Jusqu'à ${MAX_FLUX} dernières transactions de la période sélectionnée.`} />
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Chargement…</p>
        ) : fluxLines.length === 0 ? (
          <p className="text-sm text-slate-500">Aucun flux sur cette période.</p>
        ) : (
          <ul className="space-y-2.5 sm:space-y-3">
            {fluxLines.map(({ key, dateStr, mapped }, index) => {
              const rowAccent = liquidFluxRowAccent(index, primary, secondary);
              return (
                <li
                  key={key}
                  className={cn(
                    "overflow-hidden rounded-xl border border-slate-200/80 px-4 py-3 text-sm shadow-sm",
                    "ring-1 ring-inset ring-white/45 dark:border-slate-600/55 dark:ring-white/10"
                  )}
                  style={liquidFluxRowStyle({ index, primary, secondary, isDark })}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span
                      className={cn(
                        "font-semibold tabular-nums",
                        mapped.signChar === "−" && "text-rose-700 dark:text-rose-200"
                      )}
                      style={
                        mapped.signChar === "+"
                          ? { color: liquidMetricValueColor(rowAccent, isDark) }
                          : undefined
                      }
                    >
                      {mapped.signChar}
                      {money(mapped.amountAbs)}
                    </span>
                    <span className="[color:var(--flux-arrow)] opacity-90" aria-hidden>
                      →
                    </span>
                    <span className="font-medium text-slate-800 dark:text-slate-100">{mapped.label}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{dateStr}</p>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>
    </section>
  );
}
