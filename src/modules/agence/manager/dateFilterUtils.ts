/**
 * Date filter logic for Manager pages. No UI — use DateFilterBar for UI.
 */
import { useState, useMemo } from "react";

export type DatePreset = "today" | "7d" | "30d" | "month" | "custom";

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Aujourd'hui",
  "7d": "7 jours",
  "30d": "30 jours",
  month: "Ce mois",
  custom: "Personnalisé",
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function computeRange(
  preset: DatePreset,
  customStart: string,
  customEnd: string
): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "7d": {
      const s = new Date();
      s.setDate(s.getDate() - 7);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case "30d": {
      const s = new Date();
      s.setDate(s.getDate() - 30);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case "month": {
      const s = new Date();
      s.setDate(1);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case "custom":
      return {
        start: customStart ? startOfDay(new Date(customStart)) : startOfDay(now),
        end: customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now),
      };
  }
}

export function useDateFilter(initial: DatePreset = "today") {
  const [preset, setPreset] = useState<DatePreset>(initial);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = useMemo(
    () => computeRange(preset, customStart, customEnd),
    [preset, customStart, customEnd]
  );
  return {
    preset,
    setPreset,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    range,
  };
}
