var _a, _b, _c, _d, _e, _f, _g, _h;
import { jsx, jsxs } from "@emotion/react/jsx-runtime";
import * as React from "react";
import React__default, { useState, useRef, useEffect, useMemo, useCallback, createContext, useContext } from "react";
import { Link, useParams } from "react-router-dom";
import { initializeFirestore, memoryLocalCache, setLogLevel, Timestamp, where, orderBy, limit, query, getDocs, collection, getDoc, doc } from "firebase/firestore";
import { getApps, getApp, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { AlertTriangle, Calendar, Info, TrendingUp, Ticket, Package, Building2 } from "lucide-react";
import DatePicker, { registerLocale } from "react-datepicker";
import { fr } from "date-fns/locale";
/* empty css                          */
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc.js";
import timezone from "dayjs/plugin/timezone.js";
import { format } from "date-fns";
import { ResponsiveContainer, AreaChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Area, Line } from "recharts";
import "dayjs/locale/fr.js";
const firebaseConfig = {
  apiKey: "AIzaSyB9sGzgvdzhxxhIshtPprPix7oBfCB2OuM",
  authDomain: "monbillet-95b77.firebaseapp.com",
  projectId: "monbillet-95b77",
  storageBucket: "monbillet-95b77.appspot.com",
  messagingSenderId: "337289733382",
  appId: "1:337289733382:web:bb99ee8f48861b47226a87",
  measurementId: "G-G96GYRYS76"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const RECAPTCHA_SITE_KEY = (_b = (_a = import.meta) == null ? void 0 : _a.env) == null ? void 0 : _b.VITE_RECAPTCHA_V3_KEY;
if (typeof window !== "undefined") {
  const debug = ((_d = (_c = import.meta) == null ? void 0 : _c.env) == null ? void 0 : _d.VITE_APPCHECK_DEBUG) === "true" && ["localhost", "127.0.0.1"].includes(window.location.hostname);
  if (debug) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    try {
      localStorage.setItem("FIREBASE_APPCHECK_DEBUG_TOKEN", "true");
    } catch {
    }
  }
  if (RECAPTCHA_SITE_KEY) {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(RECAPTCHA_SITE_KEY),
      isTokenAutoRefreshEnabled: true
    });
  }
}
const FORCE_LONG_POLLING = ((_f = (_e = import.meta) == null ? void 0 : _e.env) == null ? void 0 : _f.VITE_FIRESTORE_FORCE_LONG_POLLING) === "true";
const db = initializeFirestore(app, {
  localCache: memoryLocalCache(),
  ignoreUndefinedProperties: true,
  experimentalAutoDetectLongPolling: !FORCE_LONG_POLLING,
  experimentalForceLongPolling: FORCE_LONG_POLLING
});
setLogLevel("error");
getAuth(app);
getStorage(app);
getFunctions(app, "europe-west1");
((_h = (_g = import.meta) == null ? void 0 : _g.env) == null ? void 0 : _h.VITE_USE_EMULATORS) === "true";
(async () => {
  return;
})();
function cn(...inputs) {
  return twMerge(clsx(inputs));
}
const Card = React.forwardRef(({
  className,
  ...props
}, ref) => /* @__PURE__ */ jsx("div", { ref, className: cn("rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-gray-900 dark:text-white shadow-md hover:shadow-lg transition-all duration-200", className), ...props }));
Card.displayName = "Card";
const CardHeader = React.forwardRef(({
  className,
  ...props
}, ref) => /* @__PURE__ */ jsx("div", { ref, className: cn("flex flex-col space-y-1.5 p-6", className), ...props }));
CardHeader.displayName = "CardHeader";
const CardTitle = React.forwardRef(({
  className,
  ...props
}, ref) => /* @__PURE__ */ jsx("h3", { ref, className: cn("text-lg font-semibold leading-none tracking-tight", className), ...props }));
CardTitle.displayName = "CardTitle";
const CardContent = React.forwardRef(({
  className,
  ...props
}, ref) => /* @__PURE__ */ jsx("div", { ref, className: cn("p-6 pt-0", className), ...props }));
CardContent.displayName = "CardContent";
const CardFooter = React.forwardRef(({
  className,
  ...props
}, ref) => /* @__PURE__ */ jsx("div", { ref, className: cn("flex items-center p-6 pt-0", className), ...props }));
CardFooter.displayName = "CardFooter";
const pagePaddingX = "px-4 md:px-6 lg:px-8";
const pageVerticalGap = "space-y-4";
const pageMaxWidth = "max-w-[1200px] mx-auto w-full min-w-0";
const pageMaxWidthFluid = "max-w-none w-full min-w-0";
const dashboardKpiGrid = "grid grid-cols-2 gap-3 md:grid-cols-3";
const dashboardKpiMinWidth = "min-w-[170px]";
const typography = {
  /** Page title — premium: slightly larger, stronger presence */
  pageTitlePremium: "text-3xl font-bold tracking-tight",
  /** Section card title — clear hierarchy below page, slightly lighter for elegance */
  sectionTitleCard: "text-lg font-medium text-gray-900 dark:text-gray-100",
  /** Form labels, table headers */
  label: "text-sm font-medium text-gray-700 dark:text-gray-300",
  /** Large numeric/KPI value — dominant in MetricCard */
  valueLarge: "text-2xl font-bold tabular-nums leading-tight",
  /** Page header subtitle — more muted, refined */
  subtitle: "text-sm text-gray-400 dark:text-gray-500",
  /** Small muted (captions) */
  mutedSm: "text-xs text-gray-500 dark:text-gray-400",
  /** KPI label (uppercase, small) — clearly secondary to value */
  kpiLabel: "text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400"
};
const radius = {
  /** 8px — buttons, inputs */
  md: "rounded-lg"
};
const transitions = {
  /** Default for color/background changes (200ms) */
  colors: "transition-colors duration-200 ease-out"
};
const StandardLayoutWrapper = ({
  children,
  className,
  noVerticalPadding = false,
  maxWidthClass
}) => /* @__PURE__ */ jsx("div", { className: cn(maxWidthClass ?? pageMaxWidth, "w-full", pagePaddingX, pageVerticalGap, noVerticalPadding ? "" : "py-4", className), children });
StandardLayoutWrapper.displayName = "StandardLayoutWrapper";
const Breadcrumb = ({
  items,
  separator = " › ",
  className
}) => {
  if (!(items == null ? void 0 : items.length)) return null;
  return /* @__PURE__ */ jsx("nav", { "aria-label": "Fil d'Ariane", className: cn("flex flex-wrap items-center gap-x-1 text-sm text-gray-500 dark:text-slate-400", className), children: items.map((item, i) => {
    const isLast = i === items.length - 1;
    const content = /* @__PURE__ */ jsx("span", { className: cn(isLast && "font-medium text-gray-700 dark:text-slate-300"), children: item.label });
    return /* @__PURE__ */ jsxs(React__default.Fragment, { children: [
      i > 0 && /* @__PURE__ */ jsx("span", { className: "shrink-0", "aria-hidden": true, children: separator }),
      item.path && !isLast ? /* @__PURE__ */ jsx(Link, { to: item.path, className: "text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:underline", children: item.label }) : content
    ] }, i);
  }) });
};
Breadcrumb.displayName = "Breadcrumb";
const DEFAULT_PRIMARY_VAR = "var(--teliya-primary, #FF6600)";
const PageHeader = ({
  title,
  subtitle,
  breadcrumb,
  icon: Icon,
  right,
  primaryColorVar = DEFAULT_PRIMARY_VAR,
  className,
  titleClassName
}) => /* @__PURE__ */ jsxs("header", { className: cn("mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between", className), children: [
  /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-1 flex-col gap-1.5", children: [
    breadcrumb && breadcrumb.length > 0 && /* @__PURE__ */ jsx(Breadcrumb, { items: breadcrumb, className: "mb-0.5" }),
    /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 items-center gap-3", children: [
      Icon && /* @__PURE__ */ jsx("div", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white", style: {
        backgroundColor: primaryColorVar
      }, "aria-hidden": true, children: /* @__PURE__ */ jsx(Icon, { className: "h-5 w-5" }) }),
      /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
        /* @__PURE__ */ jsx("h1", { className: cn(typography.pageTitlePremium, primaryColorVar ? "" : "text-gray-900 dark:text-gray-100", titleClassName), style: primaryColorVar ? {
          color: primaryColorVar
        } : void 0, children: title }),
        subtitle && /* @__PURE__ */ jsx("p", { className: cn("mt-1", typography.subtitle), children: subtitle })
      ] })
    ] })
  ] }),
  right && /* @__PURE__ */ jsx("div", { className: "shrink-0", children: right })
] });
PageHeader.displayName = "PageHeader";
const cardBase$1 = cn("border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100", "rounded-2xl shadow-sm transition-shadow duration-200 hover:shadow-md");
const SectionCard = ({
  title,
  icon: Icon,
  right,
  children,
  noPad = false,
  help,
  description,
  className,
  style
}) => /* @__PURE__ */ jsxs("section", { className: cn(cardBase$1, className), style, children: [
  /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3.5 dark:border-gray-800 sm:px-5", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex min-w-0 flex-1 gap-3", children: [
      Icon ? /* @__PURE__ */ jsx(Icon, { className: "mt-0.5 h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400", "aria-hidden": true }) : null,
      /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
        /* @__PURE__ */ jsxs("h2", { className: cn(typography.sectionTitleCard, "flex items-start gap-2"), children: [
          /* @__PURE__ */ jsx("span", { className: "min-w-0 flex-1", children: title }),
          help ? /* @__PURE__ */ jsx("span", { className: "ml-auto inline-flex shrink-0", children: help }) : null
        ] }),
        description != null && description !== "" ? /* @__PURE__ */ jsx("p", { className: "mt-1.5 text-sm text-gray-600 dark:text-gray-400", children: description }) : null
      ] })
    ] }),
    right ? /* @__PURE__ */ jsx("div", { className: "shrink-0 pt-0.5", children: right }) : null
  ] }),
  /* @__PURE__ */ jsx("div", { className: noPad ? "" : "p-4 sm:p-5", children })
] });
SectionCard.displayName = "SectionCard";
const cardBase = cn("flex min-h-[110px] flex-col justify-between border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-900", "rounded-2xl shadow-sm transition-shadow duration-200 hover:shadow-md");
const cardCritical = cn("flex min-h-[110px] flex-col justify-between border-2 border-red-400 bg-red-50/50 p-4 sm:p-5 dark:border-red-500 dark:bg-red-900/20", "rounded-2xl shadow-sm transition-shadow duration-200 hover:shadow-md");
const MetricCard = ({
  label,
  value,
  icon: Icon,
  help,
  hint,
  critical = false,
  criticalMessage,
  valueColorVar,
  className,
  style,
  valueClassName,
  iconWrapperClassName,
  decorative = false,
  variation,
  variationLabel
}) => /* @__PURE__ */ jsxs("div", { className: cn(critical ? cardCritical : cardBase, decorative && !critical && "bg-gradient-to-br from-white via-slate-50 to-indigo-50/40", className), style, children: [
  /* @__PURE__ */ jsxs("div", { className: "flex items-start justify-between gap-2", children: [
    /* @__PURE__ */ jsxs("div", { className: "min-w-0 pr-1", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-2", children: [
        /* @__PURE__ */ jsx("p", { className: cn(typography.kpiLabel, "min-w-0 flex-1 leading-snug"), children: label }),
        help ? /* @__PURE__ */ jsx("span", { className: "inline-flex shrink-0", children: help }) : null
      ] }),
      hint && /* @__PURE__ */ jsx("p", { className: "mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400", children: hint })
    ] }),
    critical ? /* @__PURE__ */ jsx(AlertTriangle, { className: "h-5 w-5 text-red-500 dark:text-red-400", "aria-hidden": true }) : Icon && /* @__PURE__ */ jsx("span", { className: cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full", decorative ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" : "text-gray-400 dark:text-gray-500", iconWrapperClassName), children: /* @__PURE__ */ jsx(Icon, { className: "h-4 w-4", "aria-hidden": true }) })
  ] }),
  /* @__PURE__ */ jsx("p", { className: cn("mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-xl sm:text-2xl", typography.valueLarge, critical ? "text-red-700 dark:text-red-300" : "", valueClassName), style: !critical && valueColorVar ? {
    color: valueColorVar
  } : void 0, children: value }),
  critical && criticalMessage && /* @__PURE__ */ jsx("p", { className: cn("mt-1.5", typography.mutedSm, "font-medium text-red-600 dark:text-red-400"), children: criticalMessage }),
  variation != null && variation !== "" && /* @__PURE__ */ jsxs("p", { className: cn("mt-1.5 flex flex-wrap items-baseline gap-1", typography.mutedSm), children: [
    /* @__PURE__ */ jsxs("span", { className: cn("font-medium", variation.startsWith("+") && "text-emerald-600 dark:text-emerald-400", variation.startsWith("-") && "text-red-600 dark:text-red-400", !variation.startsWith("+") && !variation.startsWith("-") && "text-gray-500 dark:text-slate-400"), children: [
      variation.startsWith("+") && "▲ ",
      variation.startsWith("-") && "▼ ",
      variation
    ] }),
    variationLabel && /* @__PURE__ */ jsx("span", { className: "text-gray-500 dark:text-slate-400", children: variationLabel })
  ] })
] });
MetricCard.displayName = "MetricCard";
const base = "inline-flex items-center justify-center gap-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 disabled:pointer-events-none disabled:opacity-50";
const variants = {
  primary: "min-h-[44px] bg-[var(--teliya-primary,var(--btn-primary,#FF6600))] text-white hover:brightness-95 active:brightness-90 focus-visible:ring-[var(--teliya-primary)]",
  secondary: "min-h-[44px] border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500",
  danger: "min-h-[44px] bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500",
  ghost: "text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500"
};
const sizes = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10"
};
const ActionButton = React__default.forwardRef(({
  className,
  variant = "primary",
  size = "default",
  disabled,
  ...props
}, ref) => /* @__PURE__ */ jsx("button", { ref, disabled, className: cn(base, radius.md, transitions.colors, typography.label, variants[variant], sizes[size], className), ...props }));
ActionButton.displayName = "ActionButton";
const inputBase = cn("w-full border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500", "focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-0 dark:focus:border-gray-500 dark:focus:ring-gray-700", "disabled:cursor-not-allowed disabled:opacity-50", radius.md, transitions.colors, "transition-shadow duration-200 focus:shadow-sm");
const Input = React.forwardRef(({
  className,
  ...props
}, ref) => /* @__PURE__ */ jsx("input", { ref, className: cn(inputBase, className), ...props }));
Input.displayName = "Input";
dayjs.extend(utc);
dayjs.extend(timezone);
const TZ_BAMAKO = "Africa/Bamako";
function normalizeDateToYYYYMMDD(value) {
  const s = (value ?? "").trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  const parsed = dayjs(s, ["YYYY-MM-DD", "DD/MM/YYYY", "YYYY/MM/DD"], true);
  if (parsed.isValid()) return parsed.format("YYYY-MM-DD");
  return s.slice(0, 10);
}
function getTodayForTimezone(ianaTimezone) {
  return dayjs().tz(ianaTimezone).format("YYYY-MM-DD");
}
function getStartOfDayForDate(dateStr, ianaTimezone) {
  const d = normalizeDateToYYYYMMDD(dateStr);
  return dayjs.tz(`${d}T00:00:00`, ianaTimezone).toDate();
}
function getEndOfDayForDate(dateStr, ianaTimezone) {
  const d = normalizeDateToYYYYMMDD(dateStr);
  return dayjs.tz(`${d}T23:59:59.999`, ianaTimezone).toDate();
}
function getDateKeyInTimezone(d, ianaTimezone) {
  return dayjs(d).tz(ianaTimezone).format("YYYY-MM-DD");
}
function getHourInTimezone(d, ianaTimezone) {
  return dayjs(d).tz(ianaTimezone).hour();
}
function getTodayBamako() {
  return getTodayForTimezone(TZ_BAMAKO);
}
function getStartOfDayInBamako(dateStr) {
  return getStartOfDayForDate(dateStr, TZ_BAMAKO);
}
function getEndOfDayInBamako(dateStr) {
  return getEndOfDayForDate(dateStr, TZ_BAMAKO);
}
function parseYmdLocal(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function formatActivityPeriodLabelFr(startYmd, endYmd, todayYmd) {
  if (startYmd === endYmd) {
    if (startYmd === todayYmd) return "Aujourd'hui";
    const d = parseYmdLocal(startYmd);
    return format(d, "d MMMM yyyy", {
      locale: fr
    });
  }
  const a = parseYmdLocal(startYmd);
  const b = parseYmdLocal(endYmd);
  const sameYear = a.getFullYear() === b.getFullYear();
  if (sameYear) {
    return `du ${format(a, "d MMMM", {
      locale: fr
    })} au ${format(b, "d MMMM yyyy", {
      locale: fr
    })}`;
  }
  return `du ${format(a, "d MMMM yyyy", {
    locale: fr
  })} au ${format(b, "d MMMM yyyy", {
    locale: fr
  })}`;
}
registerLocale("fr", fr);
function parseYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function fmtYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function isInsideDatePickerUi(target) {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest(".react-datepicker")) return true;
  if (target.closest(".react-datepicker-popper")) return true;
  return false;
}
const btnSecondary = "inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-gray-300 hover:bg-gray-50 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-800 dark:hover:text-white";
const btnSecondaryActive = "border-gray-300 bg-gray-100 text-gray-900 dark:border-gray-500 dark:bg-gray-800 dark:text-white";
const NetworkActivityPeriodBar = ({
  preset,
  startDate,
  endDate,
  setPreset,
  setCustomRange
}) => {
  const todayKey = getTodayBamako();
  const isToday = preset === "day" && startDate === todayKey && endDate === todayKey;
  const isThisMonth = preset === "month";
  const calendarIsPrimarySelection = !isToday && !isThisMonth;
  const appliedLabel = formatActivityPeriodLabelFr(startDate, endDate, todayKey);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef(null);
  const [pickerMode, setPickerMode] = useState("range");
  const [draftSingle, setDraftSingle] = useState(() => parseYmd(startDate));
  const [draftRange, setDraftRange] = useState([parseYmd(startDate), parseYmd(endDate)]);
  useEffect(() => {
    setDraftSingle(parseYmd(startDate));
    setDraftRange([parseYmd(startDate), parseYmd(endDate)]);
  }, [startDate, endDate]);
  useEffect(() => {
    function onDocMouseDown(e) {
      var _a2;
      const t = e.target;
      if (isInsideDatePickerUi(t)) return;
      if ((_a2 = calendarRef.current) == null ? void 0 : _a2.contains(t)) return;
      setCalendarOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);
  const maxDate = useMemo(() => {
    const d = /* @__PURE__ */ new Date();
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
  return /* @__PURE__ */ jsxs("div", { className: "flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-2", children: [
      /* @__PURE__ */ jsx("button", { type: "button", className: cn(btnSecondary, isToday && btnSecondaryActive), onClick: () => {
        setPreset("day");
        setCalendarOpen(false);
      }, children: "Aujourd'hui" }),
      /* @__PURE__ */ jsx("button", { type: "button", className: cn(btnSecondary, isThisMonth && btnSecondaryActive), onClick: () => {
        setPreset("month");
        setCalendarOpen(false);
      }, children: "Ce mois" })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "relative w-full sm:ml-auto sm:max-w-md sm:flex-1", ref: calendarRef, children: [
      /* @__PURE__ */ jsxs("button", { type: "button", className: cn("flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-shadow", calendarIsPrimarySelection || calendarOpen ? "border-gray-900 bg-white shadow-md dark:border-gray-100 dark:bg-gray-900" : "border-gray-200 bg-white shadow-sm hover:border-gray-300 hover:shadow-md dark:border-gray-600 dark:bg-gray-900 dark:hover:border-gray-500"), onClick: () => setCalendarOpen((o) => !o), "aria-expanded": calendarOpen, "aria-haspopup": "dialog", children: [
        /* @__PURE__ */ jsx("span", { className: "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200", children: /* @__PURE__ */ jsx(Calendar, { className: "h-5 w-5", "aria-hidden": true }) }),
        /* @__PURE__ */ jsxs("span", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx("span", { className: "block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400", children: "Période" }),
          /* @__PURE__ */ jsx("span", { className: "mt-0.5 block text-sm font-semibold text-gray-900 dark:text-white", children: appliedLabel })
        ] })
      ] }),
      calendarOpen && /* @__PURE__ */ jsxs("div", { className: "absolute right-0 z-[100] mt-2 w-[min(100vw-1.5rem,22rem)] rounded-xl border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-600 dark:bg-gray-900 sm:w-auto sm:min-w-[300px]", role: "dialog", "aria-label": "Choisir une période", onMouseDown: (e) => e.stopPropagation(), children: [
        /* @__PURE__ */ jsxs("div", { className: "mb-3 flex gap-2 rounded-lg bg-gray-100 p-1 dark:bg-gray-800", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: cn("flex-1 rounded-md py-2 text-xs font-semibold transition-colors", pickerMode === "single" ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"), onClick: () => setPickerMode("single"), children: "Un jour" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: cn("flex-1 rounded-md py-2 text-xs font-semibold transition-colors", pickerMode === "range" ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"), onClick: () => setPickerMode("range"), children: "Plage" })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "network-activity-datepicker text-gray-900 dark:text-gray-100", children: pickerMode === "single" ? /* @__PURE__ */ jsx(DatePicker, { selected: draftSingle, onChange: (d) => setDraftSingle(d), locale: "fr", maxDate, inline: true, showMonthDropdown: true, showYearDropdown: true, dropdownMode: "select", calendarClassName: "!border-0 !bg-transparent" }) : /* @__PURE__ */ jsx(DatePicker, { selectsRange: true, startDate: draftRange[0], endDate: draftRange[1], onChange: (update) => {
          const u = update;
          setDraftRange(u);
        }, locale: "fr", maxDate, inline: true, monthsShown: 1, showMonthDropdown: true, showYearDropdown: true, dropdownMode: "select", calendarClassName: "!border-0 !bg-transparent" }) }),
        /* @__PURE__ */ jsxs("div", { className: "mt-4 flex justify-end gap-2 border-t border-gray-100 pt-4 dark:border-gray-800", children: [
          /* @__PURE__ */ jsx("button", { type: "button", className: "rounded-lg px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800", onClick: () => setCalendarOpen(false), children: "Annuler" }),
          /* @__PURE__ */ jsx("button", { type: "button", className: "rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-white", onClick: (e) => {
            e.preventDefault();
            e.stopPropagation();
            applyCalendar();
          }, children: "Appliquer" })
        ] })
      ] })
    ] })
  ] });
};
NetworkActivityPeriodBar.displayName = "NetworkActivityPeriodBar";
dayjs.locale("fr");
const DEFAULT_PRIMARY = "#ef4444";
const DEFAULT_SECONDARY = "#3b82f6";
const TREND_COLOR = "#6366f1";
function calculateTrend(data, windowSize = 3) {
  return data.map((item, index, arr) => {
    const start = Math.max(0, index - windowSize + 1);
    const subset = arr.slice(start, index + 1);
    const avg = subset.length ? subset.reduce((sum, d) => sum + (d.revenue || 0), 0) / subset.length : 0;
    return {
      ...item,
      trend: Math.round(avg)
    };
  });
}
function formatXLabel(dateStr, range) {
  var _a2;
  const isHourly = dateStr.includes("T");
  if (range === "day" || isHourly) {
    const hour = isHourly ? parseInt(((_a2 = dateStr.split("T")[1]) == null ? void 0 : _a2.slice(0, 2)) || "0", 10) : 0;
    return `${String(hour).padStart(2, "0")}h`;
  }
  const d = dayjs(dateStr);
  if (!d.isValid()) return dateStr;
  if (range === "week") return d.format("ddd");
  return d.format("DD");
}
function CustomTooltip({
  active,
  payload,
  secondaryMetricLabel = "Reservations"
}) {
  if (!active || !(payload == null ? void 0 : payload.length)) return null;
  const data = payload[0].payload;
  const dateLabel = data.date.includes("T") ? `${dayjs(data.date.slice(0, 10)).format("dddd D MMMM")} - ${data.date.slice(11, 13)}h` : dayjs(data.date).format("dddd D MMMM");
  return /* @__PURE__ */ jsxs("div", { className: "min-w-[180px] rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-md dark:border-slate-600 dark:bg-slate-800", children: [
    /* @__PURE__ */ jsx("div", { className: "mb-2 border-b border-gray-100 pb-2 font-medium text-gray-900 dark:border-slate-600 dark:text-white", children: dateLabel }),
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-4 py-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-gray-600 dark:text-slate-400", children: "CA" }),
      /* @__PURE__ */ jsxs("span", { className: "font-medium text-red-600 dark:text-red-400", children: [
        (data.revenue ?? 0).toLocaleString("fr-FR"),
        " FCFA"
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-4 py-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-gray-600 dark:text-slate-400", children: secondaryMetricLabel }),
      /* @__PURE__ */ jsx("span", { className: "font-medium text-amber-600 dark:text-amber-400", children: data.reservations ?? 0 })
    ] }),
    data.agenciesActive !== void 0 && /* @__PURE__ */ jsxs("div", { className: "flex justify-between gap-4 py-1", children: [
      /* @__PURE__ */ jsx("span", { className: "text-gray-600 dark:text-slate-400", children: "Agences actives" }),
      /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-900 dark:text-white", children: data.agenciesActive })
    ] })
  ] });
}
function RevenueReservationsChart({
  data: rawData,
  loading,
  primaryColor,
  secondaryColor,
  range = "month",
  secondaryMetricLabel = "Reservations",
  compact = false
}) {
  const primary = primaryColor || DEFAULT_PRIMARY;
  const secondary = secondaryColor || DEFAULT_SECONDARY;
  const data = useMemo(() => {
    if (!(rawData == null ? void 0 : rawData.length)) return [];
    const withLabels = rawData.map((p) => ({
      ...p,
      label: formatXLabel(p.date, range)
    }));
    return calculateTrend(withLabels, 3);
  }, [rawData, range]);
  if (loading) {
    return /* @__PURE__ */ jsx("div", { className: "flex min-h-[200px] items-center justify-center text-sm text-muted-foreground", children: "Chargement..." });
  }
  if (!data || data.length === 0) {
    return /* @__PURE__ */ jsx("div", { className: "flex min-h-[200px] items-center justify-center text-sm text-muted-foreground", children: "Aucune donnee sur la periode." });
  }
  return /* @__PURE__ */ jsx("div", { className: compact ? "h-[220px] min-h-[220px] w-full" : "h-[min(280px,42vh)] min-h-[200px] w-full", children: /* @__PURE__ */ jsx(ResponsiveContainer, { width: "100%", height: "100%", children: /* @__PURE__ */ jsxs(AreaChart, { data, margin: {
    top: 10,
    right: 18,
    bottom: 0,
    left: 0
  }, children: [
    /* @__PURE__ */ jsxs("defs", { children: [
      /* @__PURE__ */ jsxs("linearGradient", { id: "fillRevenue", x1: "0", y1: "0", x2: "0", y2: "1", children: [
        /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: primary, stopOpacity: 0.2 }),
        /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: primary, stopOpacity: 0 })
      ] }),
      /* @__PURE__ */ jsxs("linearGradient", { id: "fillReservations", x1: "0", y1: "0", x2: "0", y2: "1", children: [
        /* @__PURE__ */ jsx("stop", { offset: "0%", stopColor: secondary, stopOpacity: 0.2 }),
        /* @__PURE__ */ jsx("stop", { offset: "100%", stopColor: secondary, stopOpacity: 0 })
      ] })
    ] }),
    /* @__PURE__ */ jsx(CartesianGrid, { strokeDasharray: "3 3", stroke: "#e5e7eb" }),
    /* @__PURE__ */ jsx(XAxis, { dataKey: "label", tick: {
      fontSize: compact ? 10 : 12
    }, minTickGap: compact ? 20 : 8, interval: compact ? "preserveStartEnd" : 0 }),
    /* @__PURE__ */ jsx(YAxis, { yAxisId: "left", tick: {
      fontSize: compact ? 10 : 12
    }, width: compact ? 40 : 48 }),
    /* @__PURE__ */ jsx(YAxis, { yAxisId: "right", orientation: "right", tick: {
      fontSize: 12
    }, hide: compact }),
    /* @__PURE__ */ jsx(Tooltip, { content: /* @__PURE__ */ jsx(CustomTooltip, { secondaryMetricLabel }) }),
    !compact && /* @__PURE__ */ jsx(Legend, {}),
    /* @__PURE__ */ jsx(Area, { yAxisId: "left", type: "monotone", dataKey: "revenue", name: "Chiffre d'affaires", stroke: primary, strokeWidth: 2, fill: "url(#fillRevenue)", dot: false, activeDot: {
      r: 4,
      fill: primary
    } }),
    /* @__PURE__ */ jsx(Area, { yAxisId: "right", type: "monotone", dataKey: "reservations", name: secondaryMetricLabel, stroke: secondary, strokeWidth: 2, fill: "url(#fillReservations)", dot: false, activeDot: {
      r: 4,
      fill: secondary
    } }),
    !compact && /* @__PURE__ */ jsx(Line, { yAxisId: "left", type: "monotone", dataKey: "trend", name: "Tendance", stroke: TREND_COLOR, strokeWidth: 2, dot: false, strokeDasharray: "5 5" })
  ] }) }) });
}
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);
const GlobalPeriodContext = React__default.createContext(null);
function useGlobalPeriodContext() {
  const ctx = React__default.useContext(GlobalPeriodContext);
  if (!ctx) throw new Error("useGlobalPeriodContext must be used within GlobalPeriodProvider");
  return ctx;
}
const CURRENCY_SYMBOLS = {
  XOF: "FCFA",
  XAF: "FCFA",
  GHS: "GH₵",
  NGN: "₦",
  GNF: "GNF",
  CVE: "CVE",
  GMD: "GMD",
  MRU: "MRU",
  LRD: "LRD",
  SLE: "SLE",
  EUR: "€",
  USD: "$"
};
const nf = new Intl.NumberFormat("fr-FR");
function formatCurrency(amount, currency) {
  const value = Number(amount) || 0;
  const code = (currency || "XOF").toUpperCase();
  const symbol = CURRENCY_SYMBOLS[code] ?? code;
  return `${nf.format(value)} ${symbol}`;
}
function getCurrencySymbol(currency) {
  const code = (currency || "XOF").toUpperCase();
  return CURRENCY_SYMBOLS[code] ?? code;
}
const DEFAULT_CURRENCY = "XOF";
const CurrencyCtx = createContext({
  currency: DEFAULT_CURRENCY,
  symbol: getCurrencySymbol(DEFAULT_CURRENCY)
});
function useFormatCurrency() {
  const {
    currency
  } = useContext(CurrencyCtx);
  return useCallback((amount) => formatCurrency(amount, currency), [currency]);
}
function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  return online;
}
const PageOfflineState = ({
  message = "Connexion instable: certaines données peuvent être incomplètes."
}) => /* @__PURE__ */ jsx("div", { className: "p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-sm text-amber-800 dark:text-amber-200", children: message });
const ACTIVITY_LOG_COLLECTION = "activityLogs";
function activityLogsCol(companyId) {
  return collection(db, "companies", companyId, ACTIVITY_LOG_COLLECTION);
}
const QUERY_LIMIT = 1e4;
async function queryActivityLogsInRange(companyId, start, end, agencyId) {
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);
  const col = activityLogsCol(companyId);
  const constraints = [where("createdAt", ">=", startTs), where("createdAt", "<=", endTs), orderBy("createdAt", "asc"), limit(QUERY_LIMIT)];
  const q = query(col, ...constraints);
  try {
    const snap = await getDocs(q);
    return snap.docs;
  } catch {
    return [];
  }
}
dayjs.extend(utc);
dayjs.extend(timezone);
function parseCommercialActivityLog(data) {
  if (String(data.status ?? "") !== "confirmed") return null;
  const agencyId = String(data.agencyId ?? "").trim();
  const amount = Number(data.amount ?? 0);
  const seats = Number(data.seats ?? 0);
  const type = String(data.type ?? "");
  const source = String(data.source ?? "");
  if (type === "courier") return {
    kind: "courier",
    amount,
    agencyId
  };
  if (type === "ticket" && source === "guichet") return {
    kind: "guichet_ticket",
    amount,
    seats,
    agencyId
  };
  if (type === "online" && source === "online") return {
    kind: "online_ticket",
    amount,
    seats,
    agencyId
  };
  return null;
}
function emptySlice() {
  return {
    reservationCount: 0,
    tickets: 0,
    amount: 0
  };
}
function aggregateActivityLogDocs(docs) {
  const guichet = emptySlice();
  const online = emptySlice();
  let courierParcels = 0;
  let courierAmount = 0;
  for (const d of docs) {
    const parsed = parseCommercialActivityLog(d.data());
    if (!parsed) continue;
    if (parsed.kind === "courier") {
      courierParcels += 1;
      courierAmount += parsed.amount;
      continue;
    }
    if (parsed.kind === "guichet_ticket") {
      guichet.reservationCount += 1;
      guichet.tickets += parsed.seats;
      guichet.amount += parsed.amount;
    } else {
      online.reservationCount += 1;
      online.tickets += parsed.seats;
      online.amount += parsed.amount;
    }
  }
  const billets = {
    reservationCount: guichet.reservationCount + online.reservationCount,
    tickets: guichet.tickets + online.tickets,
    amount: guichet.amount + online.amount,
    guichet,
    online
  };
  return {
    billets,
    courier: {
      parcels: courierParcels,
      amount: courierAmount
    },
    totalAmount: billets.amount + courierAmount
  };
}
function logDocCreatedAt(d) {
  var _a2;
  const x = d.data().createdAt;
  return ((_a2 = x == null ? void 0 : x.toDate) == null ? void 0 : _a2.call(x)) ?? /* @__PURE__ */ new Date(0);
}
function buildActivityChartBucketsFromLogs(docs, dateFrom, dateTo, timeZone) {
  const isSingleDay = dateFrom === dateTo;
  const map = /* @__PURE__ */ new Map();
  if (isSingleDay) {
    for (let h = 0; h < 24; h++) {
      map.set(`${dateFrom}T${String(h).padStart(2, "0")}`, {
        revenue: 0,
        reservations: 0
      });
    }
  } else {
    const fromNorm = normalizeDateToYYYYMMDD(dateFrom);
    const toNorm = normalizeDateToYYYYMMDD(dateTo);
    let cur = dayjs.tz(`${fromNorm}T12:00:00`, timeZone);
    for (; ; ) {
      const key = cur.format("YYYY-MM-DD");
      map.set(key, {
        revenue: 0,
        reservations: 0
      });
      if (key >= toNorm) break;
      cur = cur.add(1, "day");
    }
  }
  for (const d of docs) {
    const x = d.data();
    const parsed = parseCommercialActivityLog(x);
    if (!parsed) continue;
    const created = logDocCreatedAt(d);
    const amount = parsed.amount;
    const seatContribution = parsed.kind === "guichet_ticket" || parsed.kind === "online_ticket" ? parsed.seats : 0;
    if (isSingleDay) {
      const hour = getHourInTimezone(created, timeZone);
      const key = `${dateFrom}T${String(hour).padStart(2, "0")}`;
      const curr = map.get(key) ?? {
        revenue: 0,
        reservations: 0
      };
      curr.revenue += amount;
      curr.reservations += seatContribution;
      map.set(key, curr);
    } else {
      const key = getDateKeyInTimezone(created, timeZone);
      const curr = map.get(key) ?? {
        revenue: 0,
        reservations: 0
      };
      curr.revenue += amount;
      curr.reservations += seatContribution;
      map.set(key, curr);
    }
  }
  return map;
}
const VEHICLE_STATUS = {
  GARAGE: "GARAGE",
  EN_SERVICE: "EN_SERVICE",
  EN_TRANSIT: "EN_TRANSIT",
  EN_MAINTENANCE: "EN_MAINTENANCE",
  ACCIDENTE: "ACCIDENTE",
  HORS_SERVICE: "HORS_SERVICE"
};
new Set(Object.values(VEHICLE_STATUS));
dayjs.extend(utc);
dayjs.extend(timezone);
function buildNetworkChartDataFromActivityLogDocs(docs, dateFrom, dateTo, timeZone = TZ_BAMAKO) {
  const map = buildActivityChartBucketsFromLogs(docs, dateFrom, dateTo, timeZone);
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({
    date,
    revenue: v.revenue,
    reservations: v.reservations
  }));
}
function logCreatedAt(data) {
  var _a2;
  const c = data.createdAt;
  return ((_a2 = c == null ? void 0 : c.toDate) == null ? void 0 : _a2.call(c)) ?? /* @__PURE__ */ new Date(0);
}
function emptyAgencyTotals() {
  return {
    ventes: 0,
    billets: 0,
    colis: 0,
    placesGuichet: 0,
    placesOnline: 0
  };
}
function aggregateNetworkActivityByAgencyFromDocs(docs, agencyMeta) {
  const byAgency = /* @__PURE__ */ new Map();
  for (const a of agencyMeta) {
    byAgency.set(a.id, emptyAgencyTotals());
  }
  for (const d of docs) {
    const parsed = parseCommercialActivityLog(d.data());
    if (!parsed) continue;
    const aid = parsed.agencyId;
    const cur = byAgency.get(aid) ?? emptyAgencyTotals();
    if (parsed.kind === "courier") {
      cur.colis += 1;
      cur.ventes += parsed.amount;
    } else if (parsed.kind === "guichet_ticket") {
      cur.billets += parsed.seats;
      cur.placesGuichet += parsed.seats;
      cur.ventes += parsed.amount;
    } else {
      cur.billets += parsed.seats;
      cur.placesOnline += parsed.seats;
      cur.ventes += parsed.amount;
    }
    byAgency.set(aid, cur);
  }
  return agencyMeta.map((a) => {
    const row = byAgency.get(a.id) ?? emptyAgencyTotals();
    return {
      agencyId: a.id,
      ventes: row.ventes,
      billets: row.billets,
      placesGuichet: row.placesGuichet,
      placesOnline: row.placesOnline,
      colis: row.colis
    };
  });
}
function aggregateRouteActivityRowsFromDocs(docs) {
  const byRoute = /* @__PURE__ */ new Map();
  const routeColis = /* @__PURE__ */ new Map();
  for (const d of docs) {
    const data = d.data();
    const parsed = parseCommercialActivityLog(data);
    if (!parsed) continue;
    void logCreatedAt(data);
    const dep = String(data.depart ?? "").trim();
    const arr = String(data.arrivee ?? "").trim();
    const key = dep && arr ? `${dep} → ${arr}` : "Autres";
    if (parsed.kind === "courier") {
      routeColis.set(key, (routeColis.get(key) ?? 0) + 1);
      const cur = byRoute.get(key) ?? {
        billets: 0,
        ca: 0
      };
      cur.ca += parsed.amount;
      byRoute.set(key, cur);
    } else {
      const cur = byRoute.get(key) ?? {
        billets: 0,
        ca: 0
      };
      cur.billets += parsed.seats;
      cur.ca += parsed.amount;
      byRoute.set(key, cur);
    }
  }
  const keys = /* @__PURE__ */ new Set([...byRoute.keys(), ...routeColis.keys()]);
  const rows = [];
  for (const trajet of keys) {
    const r = byRoute.get(trajet) ?? {
      billets: 0,
      ca: 0
    };
    rows.push({
      trajet,
      billets: r.billets,
      colis: routeColis.get(trajet) ?? 0,
      caActivite: r.ca
    });
  }
  rows.sort((a, b) => b.caActivite - a.caActivite);
  return rows;
}
function InfoTooltip({
  label,
  className
}) {
  return /* @__PURE__ */ jsxs("details", { className: cn("relative inline-block", className), children: [
    /* @__PURE__ */ jsxs("summary", { className: "list-none cursor-pointer rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800", children: [
      /* @__PURE__ */ jsx(Info, { className: "h-4 w-4", "aria-hidden": true }),
      /* @__PURE__ */ jsx("span", { className: "sr-only", children: "Voir le détail" })
    ] }),
    /* @__PURE__ */ jsx("div", { className: "absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200", children: label })
  ] });
}
dayjs.extend(utc);
dayjs.extend(timezone);
function getDateKey(d) {
  return dayjs(d).tz("Africa/Bamako").format("YYYY-MM-DD");
}
function ReservationsReseauPage() {
  const {
    user
  } = useAuth();
  const {
    companyId: companyIdFromUrl
  } = useParams();
  const isOnline = useOnlineStatus();
  const companyId = companyIdFromUrl ?? (user == null ? void 0 : user.companyId) ?? "";
  const money = useFormatCurrency();
  const globalPeriod = useGlobalPeriodContext();
  const {
    dateFrom,
    dateTo,
    periodLabel
  } = useMemo(() => {
    const start = /* @__PURE__ */ new Date(`${globalPeriod.startDate}T00:00:00.000`);
    const end = /* @__PURE__ */ new Date(`${globalPeriod.endDate}T23:59:59.999`);
    const label = formatActivityPeriodLabelFr(globalPeriod.startDate, globalPeriod.endDate, getTodayBamako());
    return {
      dateFrom: start,
      dateTo: end,
      periodLabel: label
    };
  }, [globalPeriod.startDate, globalPeriod.endDate]);
  const [logActivity, setLogActivity] = useState(null);
  const [chartSeries, setChartSeries] = useState([]);
  const [company, setCompany] = useState(null);
  const [agencies, setAgencies] = useState([]);
  const [agencyActivity, setAgencyActivity] = useState([]);
  const [routeRows, setRouteRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const lastActivityLogDocsRef = useRef(null);
  const agenciesRef = useRef(agencies);
  agenciesRef.current = agencies;
  const startStr = globalPeriod.startDate;
  const endStr = globalPeriod.endDate;
  const periodStart = getStartOfDayInBamako(startStr);
  const periodEnd = getEndOfDayInBamako(endStr);
  useEffect(() => {
    if (!companyId) return;
    Promise.all([getDoc(doc(db, "companies", companyId)), getDocs(collection(db, "companies", companyId, "agences"))]).then(([companySnap, agencesSnap]) => {
      if (companySnap.exists()) {
        setCompany({
          id: companyId,
          ...companySnap.data()
        });
      }
      setAgencies(agencesSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          nom: data.nom ?? data.nomAgence ?? d.id
        };
      }));
    }).catch(() => {
    });
  }, [companyId]);
  useEffect(() => {
    if (!companyId) {
      lastActivityLogDocsRef.current = null;
      setLogActivity(null);
      setChartSeries([]);
      setAgencyActivity([]);
      setRouteRows([]);
      setActivityLoading(false);
      return;
    }
    setActivityLoading(true);
    queryActivityLogsInRange(companyId, periodStart, periodEnd).then((docs) => {
      lastActivityLogDocsRef.current = docs;
      setLogActivity(aggregateActivityLogDocs(docs));
      setChartSeries(buildNetworkChartDataFromActivityLogDocs(docs, startStr, endStr, TZ_BAMAKO));
      setAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(docs, agenciesRef.current));
      setRouteRows(aggregateRouteActivityRowsFromDocs(docs));
    }).catch(() => {
      lastActivityLogDocsRef.current = null;
      setLogActivity(null);
      setChartSeries([]);
      setAgencyActivity([]);
      setRouteRows([]);
    }).finally(() => setActivityLoading(false));
  }, [companyId, periodStart.getTime(), periodEnd.getTime(), startStr, endStr]);
  useEffect(() => {
    const docs = lastActivityLogDocsRef.current;
    if (!docs || !companyId) return;
    setAgencyActivity(aggregateNetworkActivityByAgencyFromDocs(docs, agencies));
  }, [agencies, companyId]);
  const caTotal = (logActivity == null ? void 0 : logActivity.totalAmount) ?? 0;
  const billetsPlaces = (logActivity == null ? void 0 : logActivity.billets.tickets) ?? 0;
  const colisCount = (logActivity == null ? void 0 : logActivity.courier.parcels) ?? 0;
  const activeAgenciesCount = useMemo(() => agencyActivity.filter((a) => a.ventes > 0 || a.colis > 0).length, [agencyActivity]);
  const agencyRowsWithNames = useMemo(() => {
    const name = (id) => {
      var _a2;
      return ((_a2 = agencies.find((a) => a.id === id)) == null ? void 0 : _a2.nom) ?? id;
    };
    return agencyActivity.map((row) => ({
      ...row,
      name: name(row.agencyId)
    }));
  }, [agencyActivity, agencies]);
  if (!companyId) {
    return /* @__PURE__ */ jsxs(StandardLayoutWrapper, { maxWidthClass: pageMaxWidthFluid, className: "bg-gray-50 dark:bg-gray-950", children: [
      /* @__PURE__ */ jsx(PageHeader, { title: "Activite reseau" }),
      /* @__PURE__ */ jsx("p", { className: "text-sm text-muted-foreground", children: "Identifiant de compagnie introuvable." })
    ] });
  }
  const basePath = `/compagnie/${companyId}`;
  const isSingleDayChart = startStr === endStr;
  const kpiCardClass = cn("!shadow-sm hover:!shadow-md !transition-shadow !border-gray-200 dark:!border-gray-700", "border-l-[4px] bg-white dark:bg-gray-900", "[background-image:linear-gradient(105deg,color-mix(in_srgb,var(--teliya-primary)_7%,white)_0%,white_42%)]", "dark:[background-image:linear-gradient(105deg,color-mix(in_srgb,var(--teliya-primary)_12%,rgb(17_24_39))_0%,rgb(17_24_39)_45%)]");
  const kpiIconWrap = cn("!h-10 !w-10 !rounded-xl", "[color:var(--teliya-primary)] [background-color:color-mix(in_srgb,var(--teliya-primary)_12%,rgb(249_250_251))]", "dark:[background-color:color-mix(in_srgb,var(--teliya-primary)_18%,rgb(31_41_55))]");
  const kpiValueClass = "!text-2xl !font-bold sm:!text-3xl";
  return /* @__PURE__ */ jsx(StandardLayoutWrapper, { maxWidthClass: pageMaxWidthFluid, className: "bg-gray-50 dark:bg-gray-950", children: /* @__PURE__ */ jsxs("div", { className: "space-y-4 pb-6", children: [
    /* @__PURE__ */ jsx(PageHeader, { title: "Activite reseau", breadcrumb: [{
      label: "Dashboard",
      path: `${basePath}/command-center`
    }, {
      label: "Activite reseau"
    }], subtitle: /* @__PURE__ */ jsxs("span", { className: "text-gray-600 dark:text-gray-400", children: [
      /* @__PURE__ */ jsx("span", { className: "font-medium text-gray-900 dark:text-gray-100", children: periodLabel }),
      /* @__PURE__ */ jsx("span", { className: "mx-2 text-gray-300 dark:text-gray-600", "aria-hidden": true, children: "." }),
      "Journal d'activite (billets + colis)"
    ] }), right: /* @__PURE__ */ jsx(NetworkActivityPeriodBar, { preset: globalPeriod.preset, startDate: globalPeriod.startDate, endDate: globalPeriod.endDate, setPreset: globalPeriod.setPreset, setCustomRange: globalPeriod.setCustomRange }) }),
    !isOnline && /* @__PURE__ */ jsx(PageOfflineState, { message: "Connexion instable: les donnees peuvent etre incompletes." }),
    /* @__PURE__ */ jsxs("section", { className: dashboardKpiGrid, children: [
      /* @__PURE__ */ jsx(MetricCard, { label: "Montant encaisse", value: activityLoading ? "..." : money(caTotal), icon: TrendingUp, help: /* @__PURE__ */ jsx(InfoTooltip, { label: "Total issu du journal d'activite sur la periode selectionnee." }), className: `${kpiCardClass} ${dashboardKpiMinWidth}`, iconWrapperClassName: kpiIconWrap, valueClassName: kpiValueClass }),
      /* @__PURE__ */ jsx(MetricCard, { label: "Billets", value: activityLoading ? "..." : String(billetsPlaces), icon: Ticket, help: /* @__PURE__ */ jsx(InfoTooltip, { label: "Nombre total de billets sur la periode (source activityLogs)." }), className: `${kpiCardClass} ${dashboardKpiMinWidth}`, iconWrapperClassName: kpiIconWrap, valueClassName: kpiValueClass }),
      /* @__PURE__ */ jsx(MetricCard, { label: "Colis", value: activityLoading ? "..." : String(colisCount), icon: Package, help: /* @__PURE__ */ jsx(InfoTooltip, { label: "Nombre total de colis sur la periode (source activityLogs)." }), className: `${kpiCardClass} ${dashboardKpiMinWidth}`, iconWrapperClassName: kpiIconWrap, valueClassName: kpiValueClass }),
      /* @__PURE__ */ jsx(MetricCard, { label: "Agences actives", value: activityLoading ? "..." : `${activeAgenciesCount} / ${agencies.length || 0}`, icon: Building2, help: /* @__PURE__ */ jsx(InfoTooltip, { label: "Agences avec ventes ou colis sur la periode." }), className: `${kpiCardClass} ${dashboardKpiMinWidth}`, iconWrapperClassName: kpiIconWrap, valueClassName: kpiValueClass })
    ] }),
    /* @__PURE__ */ jsx(SectionCard, { title: "Par agence", icon: Building2, className: "overflow-x-hidden rounded-xl border-0 bg-white shadow-sm dark:bg-gray-900", description: null, help: /* @__PURE__ */ jsx(InfoTooltip, { label: "Classement des agences par montant encaisse sur la periode." }), children: activityLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-gray-500 dark:text-gray-400", children: "Chargement..." }) : /* @__PURE__ */ jsx("ul", { className: "w-full space-y-2", children: agencyRowsWithNames.map((a) => {
      const ventesFormatted = money(a.ventes);
      return /* @__PURE__ */ jsxs("li", { className: "flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/60", children: [
        /* @__PURE__ */ jsxs("div", { className: "min-w-0", children: [
          /* @__PURE__ */ jsx("p", { className: "truncate text-sm font-medium text-slate-900 dark:text-white", children: a.name }),
          /* @__PURE__ */ jsxs("p", { className: "text-xs text-slate-500 dark:text-slate-400", children: [
            "Transactions: ",
            a.placesGuichet + a.placesOnline + a.colis
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-white", title: ventesFormatted, children: ventesFormatted })
      ] }, a.agencyId);
    }) }) }),
    /* @__PURE__ */ jsxs(Card, { className: "mb-0 rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900", children: [
      /* @__PURE__ */ jsx(CardHeader, { className: "px-5 pb-2 pt-5 md:px-6", children: /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
        /* @__PURE__ */ jsx(CardTitle, { className: "text-lg", children: "Detail par trajet" }),
        /* @__PURE__ */ jsx(InfoTooltip, { label: "Synthese billets, colis et montant par trajet sur la periode." })
      ] }) }),
      /* @__PURE__ */ jsx(CardContent, { className: "px-5 pb-5 md:px-6 md:pb-6", children: activityLoading ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Chargement..." }) : routeRows.length === 0 ? /* @__PURE__ */ jsx("p", { className: "text-sm text-slate-500", children: "Aucune donnee pour cette periode." }) : /* @__PURE__ */ jsx("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs("table", { className: "min-w-[720px] w-full text-sm", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { className: "border-b border-slate-200 text-left dark:border-slate-600", children: [
          /* @__PURE__ */ jsx("th", { className: "whitespace-nowrap py-2 pr-3", children: "Trajet" }),
          /* @__PURE__ */ jsx("th", { className: "whitespace-nowrap py-2 pr-3 text-right", children: "Billets" }),
          /* @__PURE__ */ jsx("th", { className: "whitespace-nowrap py-2 pr-3 text-right", children: "Colis" }),
          /* @__PURE__ */ jsx("th", { className: "whitespace-nowrap py-2 text-right", children: "CA activite" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: routeRows.map((row) => /* @__PURE__ */ jsxs("tr", { className: "border-b border-slate-100 dark:border-slate-800", children: [
          /* @__PURE__ */ jsx("td", { className: "whitespace-nowrap py-2 pr-3 font-medium", children: row.trajet }),
          /* @__PURE__ */ jsx("td", { className: "whitespace-nowrap py-2 pr-3 text-right", children: row.billets }),
          /* @__PURE__ */ jsx("td", { className: "whitespace-nowrap py-2 pr-3 text-right", children: row.colis }),
          /* @__PURE__ */ jsx("td", { className: "whitespace-nowrap py-2 text-right", children: money(row.caActivite) })
        ] }, row.trajet)) })
      ] }) }) })
    ] }),
    /* @__PURE__ */ jsxs(Card, { className: "rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-900", children: [
      /* @__PURE__ */ jsxs(CardHeader, { className: "px-5 pb-2 pt-5 md:px-6", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between gap-2", children: [
          /* @__PURE__ */ jsx(CardTitle, { className: "text-lg", children: "Evolution" }),
          /* @__PURE__ */ jsx(InfoTooltip, { label: "Courbe synthese du montant et des billets sur la periode." })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "text-sm font-normal text-slate-500 dark:text-slate-400", children: "Vue simplifiee pour lecture rapide, sans duplication de blocs." })
      ] }),
      /* @__PURE__ */ jsx(CardContent, { className: "px-5 pb-5 md:px-6 md:pb-6", children: /* @__PURE__ */ jsx(RevenueReservationsChart, { data: chartSeries.length > 0 ? chartSeries : startStr === endStr ? Array.from({
        length: 24
      }, (_, h) => ({
        date: `${startStr}T${String(h).padStart(2, "0")}`,
        revenue: 0,
        reservations: 0
      })) : (() => {
        const empty = [];
        for (let t = dateFrom.getTime(); t <= dateTo.getTime(); t += 864e5) {
          empty.push({
            date: getDateKey(new Date(t)),
            revenue: 0,
            reservations: 0
          });
        }
        return empty;
      })(), loading: activityLoading, primaryColor: company == null ? void 0 : company.couleurPrimaire, secondaryColor: company == null ? void 0 : company.couleurSecondaire, range: isSingleDayChart ? "day" : chartSeries.length <= 7 ? "week" : "month", secondaryMetricLabel: "Billets" }) })
    ] })
  ] }) });
}
export {
  ReservationsReseauPage as default
};
