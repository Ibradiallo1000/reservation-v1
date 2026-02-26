import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Info, AlertTriangle, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ────────────────────────────────────────────────────────
   MANAGER DESIGN TOKENS
   ──────────────────────────────────────────────────────── */

export const MGR = {
  page: "max-w-7xl mx-auto p-4 md:p-6 space-y-6",
  h1: "text-2xl font-bold text-gray-900",
  h2: "text-lg font-semibold text-gray-900",
  muted: "text-sm text-gray-500",
  card: "rounded-xl border border-gray-200 bg-white shadow-sm",
  kpi: "rounded-xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col justify-between min-h-[110px]",
  kpiCritical: "rounded-xl border-2 border-red-400 bg-red-50/50 p-5 shadow-sm flex flex-col justify-between min-h-[110px]",
  table: {
    wrapper: "overflow-x-auto",
    base: "w-full text-sm",
    head: "border-b border-gray-200 bg-gray-50/60",
    th: "px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider",
    thRight: "px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider",
    body: "divide-y divide-gray-100",
    td: "px-4 py-3 text-gray-700",
    tdRight: "px-4 py-3 text-right text-gray-700",
    row: "hover:bg-gray-50/50 transition-colors",
  },
  alert: {
    green: "bg-emerald-50 text-emerald-800",
    yellow: "bg-amber-50 text-amber-800",
    red: "bg-red-50 text-red-800",
  },
  dot: { green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-red-500" },
  input: "border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-gray-300",
  btnPrimary: "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  btnSecondary: "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
  btnDanger: "inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
} as const;

/* ────────────────────────────────────────────────────────
   HELP TOOLTIP — contextual help with mobile support.

   USAGE GUIDELINES (for developers):
   - USE for: financial indicators, calculated metrics,
     validation workflows, derived statuses.
   - DO NOT USE for: trivial labels (Name, Email, Date),
     self-explanatory buttons, standard table headers.
   - Text must be: business language, 1-2 lines max,
     no technical jargon.
   - Mobile: click to toggle. Desktop: hover or click.
   - Accessible: keyboard focus + Escape to close.
   ──────────────────────────────────────────────────────── */
export const HelpTip: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handle);
    document.addEventListener("touchstart", handle);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handle);
      document.removeEventListener("touchstart", handle);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex items-center ml-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 rounded-full"
        aria-label="Aide"
        tabIndex={0}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      <span
        className={cn(
          "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-800 text-white text-xs rounded-lg",
          "px-3 py-2 w-56 shadow-lg z-50 leading-relaxed text-center",
          "transition-all duration-150 origin-bottom",
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none",
        )}
        role="tooltip"
      >
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-gray-800" />
      </span>
    </span>
  );
};

/* ────────────────────────────────────────────────────────
   KPI CARD — with optional tooltip and critical variant
   ──────────────────────────────────────────────────────── */
export const KpiCard: React.FC<{
  label: string;
  value: string | number;
  icon?: LucideIcon;
  accent?: string;
  help?: string;
  critical?: boolean;
}> = ({ label, value, icon: Icon, accent = "text-gray-900", help, critical }) => (
  <div className={critical ? MGR.kpiCritical : MGR.kpi}>
    <div className="flex items-center justify-between">
      <p className={cn(MGR.muted, "flex items-center")}>
        {label}
        {help && <HelpTip text={help} />}
      </p>
      {critical
        ? <AlertTriangle className="w-5 h-5 text-red-500" />
        : Icon && <Icon className="w-5 h-5 text-gray-400" />}
    </div>
    <p className={cn("text-2xl font-bold mt-1", critical ? "text-red-700" : accent)}>{value}</p>
    {critical && <p className="text-xs text-red-600 font-medium mt-0.5">Écart de caisse détecté</p>}
  </div>
);

/* ────────────────────────────────────────────────────────
   SECTION CARD
   ──────────────────────────────────────────────────────── */
export const SectionCard: React.FC<{
  title: string;
  icon?: LucideIcon;
  right?: React.ReactNode;
  children: React.ReactNode;
  noPad?: boolean;
  help?: string;
}> = ({ title, icon: Icon, right, children, noPad, help }) => (
  <section className={MGR.card}>
    <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
      <h2 className={cn(MGR.h2, "flex items-center gap-2")}>
        {Icon && <Icon className="w-5 h-5 text-gray-500" />}
        {title}
        {help && <HelpTip text={help} />}
      </h2>
      {right}
    </div>
    <div className={noPad ? "" : "p-5"}>{children}</div>
  </section>
);

/* ────────────────────────────────────────────────────────
   ALERT ITEM
   ──────────────────────────────────────────────────────── */
export const AlertItem: React.FC<{
  severity: "green" | "yellow" | "red";
  message: string;
}> = ({ severity, message }) => (
  <div className={cn("flex items-start gap-3 px-4 py-3 rounded-lg", MGR.alert[severity])}>
    <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0", MGR.dot[severity])} />
    <p className="text-sm">{message}</p>
  </div>
);

/* ────────────────────────────────────────────────────────
   STATUS BADGE
   ──────────────────────────────────────────────────────── */
const BADGE_COLORS: Record<string, { bg: string; fg: string }> = {
  green:   { bg: "bg-emerald-100", fg: "text-emerald-800" },
  yellow:  { bg: "bg-amber-100",   fg: "text-amber-800" },
  red:     { bg: "bg-red-100",     fg: "text-red-800" },
  gray:    { bg: "bg-gray-100",    fg: "text-gray-700" },
  blue:    { bg: "bg-blue-100",    fg: "text-blue-800" },
  purple:  { bg: "bg-purple-100",  fg: "text-purple-800" },
};

export const StatusBadge: React.FC<{
  color: keyof typeof BADGE_COLORS;
  children: React.ReactNode;
}> = ({ color, children }) => {
  const c = BADGE_COLORS[color] ?? BADGE_COLORS.gray;
  return (
    <span className={cn("inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium", c.bg, c.fg)}>
      {children}
    </span>
  );
};

/* ────────────────────────────────────────────────────────
   EMPTY STATE
   ──────────────────────────────────────────────────────── */
export const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="py-8 text-center text-sm text-gray-500">{message}</div>
);

/* ────────────────────────────────────────────────────────
   CONFIRM MODAL — lightweight confirmation dialog
   ──────────────────────────────────────────────────────── */
export const ConfirmModal: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}> = ({ open, title, message, confirmLabel = "Confirmer", cancelLabel = "Annuler", variant = "primary", onConfirm, onCancel }) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div ref={overlayRef} className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}>
      <div className="fixed inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onCancel} className="p-1 rounded-lg hover:bg-gray-100 transition">
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onCancel} className={MGR.btnSecondary}>{cancelLabel}</button>
          <button onClick={onConfirm}
            className={variant === "danger" ? MGR.btnDanger : MGR.btnPrimary}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   DATE FILTER BAR
   ──────────────────────────────────────────────────────── */
export type DatePreset = "today" | "7d" | "30d" | "month" | "custom";

const PRESET_LABELS: Record<DatePreset, string> = {
  today: "Aujourd'hui",
  "7d": "7 jours",
  "30d": "30 jours",
  month: "Ce mois",
  custom: "Personnalisé",
};

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }

export function computeRange(preset: DatePreset, customStart: string, customEnd: string): { start: Date; end: Date } {
  const now = new Date();
  switch (preset) {
    case "today":
      return { start: startOfDay(now), end: endOfDay(now) };
    case "7d": {
      const s = new Date(); s.setDate(s.getDate() - 7);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case "30d": {
      const s = new Date(); s.setDate(s.getDate() - 30);
      return { start: startOfDay(s), end: endOfDay(now) };
    }
    case "month": {
      const s = new Date(); s.setDate(1);
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
  const range = useMemo(() => computeRange(preset, customStart, customEnd), [preset, customStart, customEnd]);
  return { preset, setPreset, customStart, setCustomStart, customEnd, setCustomEnd, range };
}

export const DateFilterBar: React.FC<{
  preset: DatePreset;
  onPresetChange: (p: DatePreset) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}> = ({ preset, onPresetChange, customStart, customEnd, onCustomStartChange, onCustomEndChange }) => (
  <div className="flex items-center flex-wrap gap-2">
    {(Object.keys(PRESET_LABELS) as DatePreset[]).map((p) => (
      <button
        key={p}
        onClick={() => onPresetChange(p)}
        className={cn(
          "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
          preset === p
            ? "bg-gray-900 text-white"
            : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50",
        )}
      >
        {PRESET_LABELS[p]}
      </button>
    ))}
    {preset === "custom" && (
      <div className="flex items-center gap-2 ml-1">
        <input type="date" value={customStart} onChange={(e) => onCustomStartChange(e.target.value)} className={MGR.input} />
        <span className="text-gray-400">&rarr;</span>
        <input type="date" value={customEnd} onChange={(e) => onCustomEndChange(e.target.value)} className={MGR.input} />
      </div>
    )}
  </div>
);

/* ────────────────────────────────────────────────────────
   NOTIFICATION BELL DROPDOWN
   ──────────────────────────────────────────────────────── */
export const NotificationBell: React.FC<{
  alerts: Array<{ id: string; severity: string; title: string; description: string; link: string }>;
  totalCount: number;
}> = ({ alerts, totalCount }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
        title="Notifications"
      >
        <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {totalCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none min-w-[18px] text-center">
            {totalCount > 99 ? "99+" : totalCount}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto bg-white rounded-xl shadow-xl border border-gray-200 z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Alertes ({totalCount})</p>
          </div>
          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">Aucune alerte</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {alerts.slice(0, 15).map((a) => (
                <a key={a.id} href={a.link}
                  onClick={() => setOpen(false)}
                  className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className={cn("w-2 h-2 rounded-full mt-1.5 shrink-0",
                      a.severity === "critical" ? "bg-red-500" : a.severity === "warning" ? "bg-amber-500" : "bg-blue-500")} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{a.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{a.description}</p>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
