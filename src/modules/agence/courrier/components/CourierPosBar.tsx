/**
 * Barre de session courrier — alignée sur le guichet (PosSessionBar) : fond clair, marque en couleur primaire.
 */

import React from "react";
import {
  LogOut,
  Moon,
  Power,
  Sun,
  Timer,
  User2,
  WifiOff,
  XCircle,
} from "lucide-react";
import { useCourierWorkspace } from "../context/CourierWorkspaceContext";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";
import { useAgencyDarkMode } from "@/modules/agence/shared";

const STATUS_MAP: Record<
  "open" | "pending" | "closed",
  { label: string; dot: string; bg: string; text: string }
> = {
  open: {
    label: "Actif",
    dot: "bg-emerald-500",
    bg: "bg-emerald-50",
    text: "text-emerald-800",
  },
  pending: {
    label: "Activation en attente",
    dot: "bg-blue-500",
    bg: "bg-blue-50",
    text: "text-blue-800",
  },
  closed: {
    label: "Comptoir fermé",
    dot: "bg-gray-400",
    bg: "bg-gray-100",
    text: "text-gray-600",
  },
};

type Props = {
  onLogout: () => void;
};

export const CourierPosBar: React.FC<Props> = ({ onLogout }) => {
  const money = useFormatCurrency();
  const [darkMode, toggleDarkMode] = useAgencyDarkMode();
  const w = useCourierWorkspace();
  const {
    session,
    ledgerSessionTotal,
    shipments,
    companyLogoUrl,
    companyName,
    agencyName,
    agentName,
    agentCode,
    counterUiStatus,
    isOnline,
    hubLoading,
    openComptoir,
    requestCloseComptoir,
    isSessionLoading,
  } = w;

  const st = isSessionLoading
    ? {
        label: "Synchronisation session…",
        dot: "bg-sky-400 animate-pulse",
        bg: "bg-sky-50",
        text: "text-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
      }
    : STATUS_MAP[counterUiStatus];
  /** Boutons / avatar : dégradé marque (variables définies sur CourierLayout). */
  const gradient = "linear-gradient(135deg, var(--courier-primary, #ea580c), var(--courier-secondary, #f97316))";
  const openedAt = session?.openedAt as { toDate?: () => Date } | undefined;
  const sessionStartedAt = openedAt?.toDate?.() ?? null;

  const [elapsed, setElapsed] = React.useState("");
  React.useEffect(() => {
    if (!sessionStartedAt || counterUiStatus !== "open" || isSessionLoading) {
      setElapsed("");
      return;
    }
    const tick = () => {
      const ms = Date.now() - sessionStartedAt.getTime();
      const s = Math.floor(ms / 1000);
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = s % 60;
      setElapsed(
        h > 0
          ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
          : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt, counterUiStatus, isSessionLoading]);

  return (
    <div
      className="sticky top-0 z-30 border-b border-gray-200/70 shadow-sm dark:border-gray-600/60"
      style={{ backgroundImage: "var(--agency-gradient-header)" }}
    >
      <div className="mx-auto flex h-16 max-w-[1600px] items-center gap-3 px-4 lg:gap-4 lg:px-6">
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          {companyLogoUrl ? (
            <img
              src={companyLogoUrl}
              alt=""
              className="h-9 w-9 rounded-lg border-2 bg-white object-contain p-0.5 dark:bg-gray-950/80"
              style={{ borderColor: "var(--courier-primary, #ea580c)" }}
            />
          ) : (
            <div
              className="grid h-9 w-9 place-items-center rounded-lg border-2 dark:border-gray-600"
              style={{
                borderColor: "var(--courier-primary, #ea580c)",
                backgroundColor: darkMode
                  ? "color-mix(in srgb, var(--courier-secondary, #f97316) 18%, rgb(3 7 18))"
                  : "color-mix(in srgb, var(--courier-primary, #ea580c) 10%, white)",
              }}
            >
              <User2 className="h-4 w-4" style={{ color: "var(--courier-primary, #ea580c)" }} />
            </div>
          )}
          <div className="min-w-0 hidden sm:block">
            <p className="truncate text-sm font-bold" style={{ color: "var(--courier-primary, #ea580c)" }}>
              {companyName}
            </p>
            <p
              className="truncate text-[11px] font-medium opacity-90 dark:opacity-95"
              style={{ color: "var(--courier-secondary, #f97316)" }}
            >
              {agencyName}
            </p>
          </div>
        </div>

        <div
          className="hidden h-8 w-px shrink-0 sm:block"
          style={{
            background: `linear-gradient(180deg, transparent, var(--courier-primary, #ea580c), var(--courier-secondary, #f97316), transparent)`,
          }}
        />

        <div className="flex flex-wrap items-center gap-2">
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${st.bg} ${st.text}`}
          >
            <span
              className={`h-2 w-2 rounded-full ${st.dot} ${counterUiStatus === "open" && !isSessionLoading ? "animate-pulse" : ""}`}
            />
            {st.label}
          </div>
          {!isOnline && (
            <div className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold text-red-700 dark:bg-red-950/50 dark:text-red-200">
              <WifiOff className="h-3 w-3" />
              Hors-ligne
            </div>
          )}
        </div>

        {!isSessionLoading && counterUiStatus === "open" && (
          <div className="hidden items-center gap-4 text-sm md:flex">
            {elapsed && (
              <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                <Timer className="h-3.5 w-3.5" />
                <span className="font-mono text-xs tabular-nums">{elapsed}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="text-gray-500 dark:text-gray-400">Colis</span>
              <span className="rounded-md bg-gray-100 px-2 py-0.5 font-bold text-gray-900 dark:bg-gray-800 dark:text-gray-100">
                {shipments.length}
              </span>
            </div>
            <div className="flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500 dark:text-gray-400">Encaissé</span>
                <span
                  className="rounded-md px-2 py-0.5 font-bold"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--courier-primary, #ea580c) 16%, transparent)",
                    color: "var(--courier-primary, #ea580c)",
                  }}
                >
                  {ledgerSessionTotal == null ? "—" : money(ledgerSessionTotal)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2">
          {!isSessionLoading && counterUiStatus === "open" && (
            <button
              type="button"
              onClick={() => requestCloseComptoir()}
              disabled={hubLoading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <XCircle className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Clôturer</span>
            </button>
          )}
          {!isSessionLoading && counterUiStatus === "closed" && (
            <button
              type="button"
              onClick={() => void openComptoir()}
              disabled={hubLoading}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-md transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundImage: gradient }}
            >
              <Power className="h-4 w-4" />
              <span className="hidden sm:inline">Ouvrir le comptoir</span>
              <span className="sm:hidden">Ouvrir</span>
            </button>
          )}
          {!isSessionLoading && counterUiStatus === "pending" && (
            <span className="hidden rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 sm:inline">
              En attente comptable
            </span>
          )}

          <div
            className="ml-1 hidden h-8 w-px shrink-0 sm:block"
            style={{
              background: `linear-gradient(180deg, transparent, var(--courier-secondary, #f97316), var(--courier-primary, #ea580c), transparent)`,
            }}
          />

          <div className="flex items-center gap-2 rounded-lg border border-gray-200/80 bg-white/60 px-2.5 py-1.5 backdrop-blur-sm dark:border-gray-600/80 dark:bg-gray-950/40">
            <div
              className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white shadow-sm"
              style={{ backgroundImage: gradient }}
            >
              {agentName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 hidden sm:block">
              <p className="max-w-[120px] truncate text-xs font-medium text-gray-900 dark:text-gray-100">
                {agentName}
              </p>
              <p className="font-mono text-[10px] text-gray-500">{agentCode}</p>
            </div>
            <span
              className="font-mono text-xs font-medium text-gray-600 dark:text-gray-300 sm:hidden"
              title={`Code : ${agentCode}`}
            >
              {agentCode}
            </span>
          </div>

          <button
            type="button"
            onClick={toggleDarkMode}
            className={`rounded-lg border border-gray-200 p-2 transition dark:border-gray-600 ${
              darkMode ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200" : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300"
            }`}
            title={darkMode ? "Mode jour" : "Mode nuit"}
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-500 transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800"
            title="Se déconnecter"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
