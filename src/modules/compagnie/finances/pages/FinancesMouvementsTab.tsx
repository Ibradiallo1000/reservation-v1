/**
 * Section "Flux recents" - flux de tresorerie uniquement (validations, transferts, mouvements internes).
 */
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { formatDateFrSlash } from "../financesCeoDisplayMap";
import {
  resolveLiquidCompanyColors,
  liquidFluxRowStyle,
  liquidFluxRowAccent,
  liquidMetricValueColor,
} from "../financesLiquidityCardStyles";
import { useHtmlDarkClass } from "@/shared/hooks/useHtmlDarkClass";
import InfoTooltip from "@/shared/ui/InfoTooltip";

const MAX_VISIBLE_FLUX = 5;

function performedAtMs(row: FinancialTransactionDoc & { id: string }): number {
  const p = row.performedAt as Timestamp | undefined;
  const d = p?.toDate?.();
  return d ? d.getTime() : 0;
}

export default function FinancesMouvementsTab() {
  const navigate = useNavigate();
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
        const start = Timestamp.fromDate(getStartOfDayForDate(globalPeriod.startDate, DEFAULT_AGENCY_TIMEZONE));
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

  const allFluxLines = useMemo(() => {
    const out: Array<{
      key: string;
      dateStr: string;
      mapped: { amountAbs: number; signChar: "+" | "-"; label: string };
    }> = [];

    const mapTreasuryFlux = (
      row: FinancialTransactionDoc
    ): { amountAbs: number; signChar: "+" | "-"; label: string } | null => {
      const amount = Number(row.amount);
      if (!Number.isFinite(amount)) return null;
      const type = String(row.type ?? "");
      const refType = String(row.referenceType ?? "");

      if (type === "remittance") {
        return { amountAbs: Math.abs(amount), signChar: "+", label: "Validation de remise guichet" };
      }

      if (type === "transfer" || type === "transfer_to_bank") {
        const internal = refType === "internal_transfer" || refType === "transfer";
        const signChar: "+" | "-" = amount < 0 ? "-" : "+";
        return {
          amountAbs: Math.abs(amount),
          signChar,
          label: internal ? "Mouvement interne" : "Transfert de caisse",
        };
      }

      if (type === "bank_withdrawal") {
        return { amountAbs: Math.abs(amount), signChar: "+", label: "Approvisionnement de caisse" };
      }

      return null;
    };

    for (const r of rows) {
      const mapped = mapTreasuryFlux(r);
      if (!mapped) continue;
      const p = r.performedAt as Timestamp | undefined;
      const d = p?.toDate?.() ?? new Date(0);
      out.push({
        key: r.id,
        dateStr: formatDateFrSlash(d),
        mapped,
      });
    }

    return out;
  }, [rows]);

  const visibleFluxLines = useMemo(() => allFluxLines.slice(0, MAX_VISIBLE_FLUX), [allFluxLines]);
  const hasMore = allFluxLines.length > MAX_VISIBLE_FLUX;

  return (
    <section aria-labelledby="finances-flux-recents" className="space-y-4">
      <SectionCard
        title="Flux recents"
        icon={ArrowRightLeft}
        help={<InfoTooltip label="Flux de tresorerie reels: validations de caisse, transferts et mouvements internes." />}
      >
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-700" />
            ))}
          </div>
        ) : visibleFluxLines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center dark:border-slate-600 dark:bg-slate-800/40">
            <ArrowRightLeft className="mx-auto mb-2 h-5 w-5 text-slate-400 dark:text-slate-500" aria-hidden />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Aucun flux sur cette periode.</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Aucun flux aujourd'hui - verifiez l'activite des agences et les validations en attente.
            </p>
            <div className="mt-3 flex justify-center">
              <button
                type="button"
                onClick={() => navigate(`/compagnie/${companyId}/comptabilite/validation`)}
                className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 dark:border-orange-700 dark:bg-orange-900/35 dark:text-orange-100 dark:hover:bg-orange-900/45"
              >
                Valider les guichets
              </button>
            </div>
          </div>
        ) : (
          <>
            <ul className="space-y-2">
              {visibleFluxLines.map(({ key, dateStr, mapped }, index) => {
                const rowAccent = liquidFluxRowAccent(index, primary, secondary);
                const signClass = mapped.signChar === "-" ? "text-rose-700 dark:text-rose-200" : "";
                const amountText = `${mapped.signChar}${money(mapped.amountAbs)}`;

                return (
                  <li
                    key={key}
                    className={cn(
                      "overflow-hidden rounded-xl border border-slate-200/80 px-3 py-2.5 text-sm shadow-sm",
                      "ring-1 ring-inset ring-white/45 dark:border-slate-600/55 dark:ring-white/10"
                    )}
                    style={liquidFluxRowStyle({ index, primary, secondary, isDark })}
                  >
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn("font-semibold tabular-nums", signClass)}
                        style={
                          mapped.signChar === "+"
                            ? { color: liquidMetricValueColor(rowAccent, isDark) }
                            : undefined
                        }
                      >
                        {amountText}
                      </span>
                      <span className="opacity-90" aria-hidden>
                        -
                      </span>
                      <span className="font-medium text-slate-800 dark:text-slate-100">{mapped.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{dateStr}</p>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {visibleFluxLines.length} element(s) affiches sur {allFluxLines.length} flux reel(s).
              </p>
              {hasMore ? (
                <button
                  type="button"
                  onClick={() => navigate(`/compagnie/${companyId}/accounting/treasury`)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                >
                  Voir plus
                </button>
              ) : null}
            </div>
          </>
        )}
      </SectionCard>
    </section>
  );
}
