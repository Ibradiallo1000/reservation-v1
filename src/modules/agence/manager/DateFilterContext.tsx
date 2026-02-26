import React, { createContext, useContext, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import type { DatePreset } from "./ui";
import { computeRange } from "./ui";

interface DateFilterState {
  preset: DatePreset;
  customStart: string;
  customEnd: string;
  range: { start: Date; end: Date };
  setPreset: (p: DatePreset) => void;
  setCustomStart: (v: string) => void;
  setCustomEnd: (v: string) => void;
}

const DateFilterCtx = createContext<DateFilterState | null>(null);

const PARAM_KEY = "range";
const CUSTOM_START_KEY = "from";
const CUSTOM_END_KEY = "to";

const VALID_PRESETS: DatePreset[] = ["today", "7d", "30d", "month", "custom"];

export const DateFilterProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const storedPreset = searchParams.get(PARAM_KEY) as DatePreset | null;
  const initialPreset: DatePreset = storedPreset && VALID_PRESETS.includes(storedPreset) ? storedPreset : "today";

  const [preset, setPresetLocal] = useState<DatePreset>(initialPreset);
  const [customStart, setCustomStartLocal] = useState(searchParams.get(CUSTOM_START_KEY) || "");
  const [customEnd, setCustomEndLocal] = useState(searchParams.get(CUSTOM_END_KEY) || "");

  const setPreset = useCallback((p: DatePreset) => {
    setPresetLocal(p);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(PARAM_KEY, p);
      if (p !== "custom") { next.delete(CUSTOM_START_KEY); next.delete(CUSTOM_END_KEY); }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setCustomStart = useCallback((v: string) => {
    setCustomStartLocal(v);
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set(CUSTOM_START_KEY, v); return next; }, { replace: true });
  }, [setSearchParams]);

  const setCustomEnd = useCallback((v: string) => {
    setCustomEndLocal(v);
    setSearchParams((prev) => { const next = new URLSearchParams(prev); next.set(CUSTOM_END_KEY, v); return next; }, { replace: true });
  }, [setSearchParams]);

  const range = useMemo(() => computeRange(preset, customStart, customEnd), [preset, customStart, customEnd]);

  const value = useMemo(() => ({
    preset, customStart, customEnd, range, setPreset, setCustomStart, setCustomEnd,
  }), [preset, customStart, customEnd, range, setPreset, setCustomStart, setCustomEnd]);

  return <DateFilterCtx.Provider value={value}>{children}</DateFilterCtx.Provider>;
};

export function useDateFilterContext(): DateFilterState {
  const ctx = useContext(DateFilterCtx);
  if (!ctx) throw new Error("useDateFilterContext must be used within DateFilterProvider");
  return ctx;
}
