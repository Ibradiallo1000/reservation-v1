import React from "react";
import { useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import { getDateRangeForPeriod, type PeriodKind } from "@/shared/date/periodUtils";

export type GlobalPeriodPreset = PeriodKind; // day|week|month|year|custom

export type GlobalPeriodState = {
  preset: GlobalPeriodPreset;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
};

type GlobalPeriodContextValue = GlobalPeriodState & {
  setPreset: (preset: GlobalPeriodPreset) => void;
  setCustomRange: (startDate: string, endDate: string) => void;
  /** Helper: { dateFrom, dateTo } for finance services */
  toFinancialPeriod: () => { dateFrom: string; dateTo: string };
};

const GlobalPeriodContext = React.createContext<GlobalPeriodContextValue | null>(null);

const Q_PRESET = "p";
const Q_START = "start";
const Q_END = "end";

/** Par défaut : jour J (aujourd'hui). Aucun paramètre URL = jour. */
function clampPreset(raw: string | null): GlobalPeriodPreset {
  const v = (raw ?? "").toLowerCase().trim();
  if (v === "day" || v === "week" || v === "month" || v === "year" || v === "custom") return v;
  return "day";
}

function dateKeyFromDate(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function computeRangeForPreset(preset: GlobalPeriodPreset): { startDate: string; endDate: string } {
  if (preset === "day") {
    const today = getTodayBamako();
    return { startDate: today, endDate: today };
  }
  const range = getDateRangeForPeriod(preset, new Date());
  return { startDate: dateKeyFromDate(range.start), endDate: dateKeyFromDate(range.end) };
}

function isValidDateKey(s: string | null): s is string {
  if (!s) return false;
  // basic YYYY-MM-DD check (avoid Date.parse locale surprises)
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function GlobalPeriodProvider({ children }: { children: React.ReactNode }) {
  const [params, setParams] = useSearchParams();

  const preset = React.useMemo(() => clampPreset(params.get(Q_PRESET)), [params]);
  const startParam = params.get(Q_START);
  const endParam = params.get(Q_END);

  const computed = React.useMemo(() => {
    if (preset === "custom" && isValidDateKey(startParam) && isValidDateKey(endParam)) {
      return { startDate: startParam, endDate: endParam };
    }
    return computeRangeForPreset(preset);
  }, [preset, startParam, endParam]);

  // Ensure URL always carries a canonical period (hard lock: no independent page period).
  React.useEffect(() => {
    const next = new URLSearchParams(params);
    const needsPreset = next.get(Q_PRESET) !== preset;
    const needsStart = next.get(Q_START) !== computed.startDate;
    const needsEnd = next.get(Q_END) !== computed.endDate;
    if (!needsPreset && !needsStart && !needsEnd) return;

    next.set(Q_PRESET, preset);
    next.set(Q_START, computed.startDate);
    next.set(Q_END, computed.endDate);
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, computed.startDate, computed.endDate]);

  const setPreset = React.useCallback(
    (nextPreset: GlobalPeriodPreset) => {
      const next = new URLSearchParams(params);
      next.set(Q_PRESET, nextPreset);
      if (nextPreset !== "custom") {
        const r = computeRangeForPreset(nextPreset);
        next.set(Q_START, r.startDate);
        next.set(Q_END, r.endDate);
      }
      setParams(next);
    },
    [params, setParams]
  );

  const setCustomRange = React.useCallback(
    (startDate: string, endDate: string) => {
      const next = new URLSearchParams(params);
      next.set(Q_PRESET, "custom");
      next.set(Q_START, startDate);
      next.set(Q_END, endDate);
      setParams(next);
    },
    [params, setParams]
  );

  const value = React.useMemo<GlobalPeriodContextValue>(
    () => ({
      preset,
      startDate: computed.startDate,
      endDate: computed.endDate,
      setPreset,
      setCustomRange,
      toFinancialPeriod: () => ({ dateFrom: computed.startDate, dateTo: computed.endDate }),
    }),
    [preset, computed.startDate, computed.endDate, setPreset, setCustomRange]
  );

  return <GlobalPeriodContext.Provider value={value}>{children}</GlobalPeriodContext.Provider>;
}

export function useGlobalPeriodContext(): GlobalPeriodContextValue {
  const ctx = React.useContext(GlobalPeriodContext);
  if (!ctx) throw new Error("useGlobalPeriodContext must be used within GlobalPeriodProvider");
  return ctx;
}

