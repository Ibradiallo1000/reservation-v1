/**
 * Période Activité réseau : Aujourd’hui / Ce mois (secondaires) + calendrier (principal).
 * Clic extérieur : ignore le portail react-datepicker (listes mois/année) pour ne pas fermer avant Appliquer.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import DatePicker, { registerLocale } from "react-datepicker";
import { fr } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";
import { cn } from "@/lib/utils";
import type { GlobalPeriodPreset } from "@/contexts/GlobalPeriodContext";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import { formatActivityPeriodLabelFr } from "@/shared/date/formatActivityPeriodFr";

registerLocale("fr", fr);

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function fmtYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isInsideDatePickerUi(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".react-datepicker")) return true;
  if (target.closest(".react-datepicker-popper")) return true;
  return false;
}

const btnSecondary =
  "inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-800 dark:hover:text-white";

const btnSecondaryActive =
  "border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-500 dark:bg-gray-800 dark:text-white";

export type NetworkActivityPeriodBarProps = {
  preset: GlobalPeriodPreset;
  startDate: string;
  endDate: string;
  setPreset: (p: GlobalPeriodPreset) => void;
  setCustomRange: (start: string, end: string) => void;
};

export const NetworkActivityPeriodBar: React.FC<NetworkActivityPeriodBarProps> = ({
  preset,
  startDate,
  endDate,
  setPreset,
  setCustomRange,
}) => {
  const todayKey = getTodayBamako();
  const isToday = preset === "day" && startDate === todayKey && endDate === todayKey;
  const isThisMonth = preset === "month";
  const calendarIsPrimarySelection = !isToday && !isThisMonth;

  const appliedLabel = formatActivityPeriodLabelFr(startDate, endDate, todayKey);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [pickerMode, setPickerMode] = useState<"single" | "range">("range");
  const [draftSingle, setDraftSingle] = useState<Date | null>(() => parseYmd(startDate));
  const [draftRange, setDraftRange] = useState<[Date | null, Date | null]>([
    parseYmd(startDate),
    parseYmd(endDate),
  ]);

  useEffect(() => {
    setDraftSingle(parseYmd(startDate));
    setDraftRange([parseYmd(startDate), parseYmd(endDate)]);
  }, [startDate, endDate]);

  useEffect(() => {
    function onDocMouseDown(e: MouseEvent) {
      const t = e.target;
      if (isInsideDatePickerUi(t)) return;
      if (calendarRef.current?.contains(t as Node)) return;
      setCalendarOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  const maxDate = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d;
  }, []);

  const applyCalendar = useCallback(() => {
    if (pickerMode === "single" && draftSingle) {
      const key = fmtYmd(draftSingle);
      setCustomRange(key, key);
    } else if (pickerMode === "range") {
      const a = draftRange[0];
      const b = draftRange[1];
      if (a && b) {
        const [from, to] = a <= b ? [a, b] : [b, a];
        setCustomRange(fmtYmd(from), fmtYmd(to));
      } else if (a && !b) {
        const key = fmtYmd(a);
        setCustomRange(key, key);
      }
    }
    setCalendarOpen(false);
  }, [pickerMode, draftSingle, draftRange, setCustomRange]);

  return (
    <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={cn(btnSecondary, isToday && btnSecondaryActive)}
          onClick={() => {
            setPreset("day");
            setCalendarOpen(false);
          }}
        >
          Aujourd&apos;hui
        </button>
        <button
          type="button"
          className={cn(btnSecondary, isThisMonth && btnSecondaryActive)}
          onClick={() => {
            setPreset("month");
            setCalendarOpen(false);
          }}
        >
          Ce mois
        </button>
      </div>

      <div className="relative w-full sm:ml-auto sm:max-w-md sm:flex-1" ref={calendarRef}>
        <button
          type="button"
          className={cn(
            "flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-shadow",
            calendarIsPrimarySelection || calendarOpen
              ? "border-gray-900 bg-white shadow-md dark:border-gray-100 dark:bg-gray-900"
              : "border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"
          )}
          onClick={() => setCalendarOpen((o) => !o)}
          aria-expanded={calendarOpen}
          aria-haspopup="dialog"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200">
            <CalendarIcon className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Période
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-gray-900 dark:text-white">
              {appliedLabel}
            </span>
          </span>
        </button>

        {calendarOpen && (
          <div
            className="absolute right-0 z-[100] mt-2 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-600 dark:bg-gray-900 sm:w-auto sm:min-w-[300px]"
            role="dialog"
            aria-label="Choisir une période"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex gap-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-800">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md py-2 text-xs font-semibold transition-colors",
                  pickerMode === "single"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                )}
                onClick={() => setPickerMode("single")}
              >
                Un jour
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md py-2 text-xs font-semibold transition-colors",
                  pickerMode === "range"
                    ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                )}
                onClick={() => setPickerMode("range")}
              >
                Plage
              </button>
            </div>

            <div className="network-activity-datepicker text-gray-900 dark:text-gray-100">
              {pickerMode === "single" ? (
                <DatePicker
                  selected={draftSingle}
                  onChange={(d) => setDraftSingle(d)}
                  locale="fr"
                  maxDate={maxDate}
                  inline
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  calendarClassName="!border-0 !bg-transparent"
                />
              ) : (
                <DatePicker
                  selectsRange
                  startDate={draftRange[0]}
                  endDate={draftRange[1]}
                  onChange={(update) => {
                    const u = update as [Date | null, Date | null];
                    setDraftRange(u);
                  }}
                  locale="fr"
                  maxDate={maxDate}
                  inline
                  monthsShown={1}
                  showMonthDropdown
                  showYearDropdown
                  dropdownMode="select"
                  calendarClassName="!border-0 !bg-transparent"
                />
              )}
            </div>

            <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800">
              <button
                type="button"
                className="rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800"
                onClick={() => setCalendarOpen(false)}
              >
                Annuler
              </button>
              <button
                type="button"
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  applyCalendar();
                }}
              >
                Appliquer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

NetworkActivityPeriodBar.displayName = "NetworkActivityPeriodBar";
