import React, { useEffect, useState } from "react";
import {
  Power, Pause, Play, RefreshCw, XCircle, LogOut, User2, Timer, WifiOff,
} from "lucide-react";

export type CounterStatus = "active" | "paused" | "closed" | "pending" | "none";

interface Props {
  status: CounterStatus;
  locked: boolean;
  userName: string;
  userCode: string;
  companyLogo: string | null;
  companyName: string;
  agencyName: string;
  sessionTickets: number;
  sessionRevenue: string;
  primaryColor: string;
  secondaryColor: string;
  sessionStartedAt?: Date | null;
  isOnline?: boolean;
  onStart: () => void;
  onPause: () => void;
  onContinue: () => void;
  onClose: () => void;
  onRefresh: () => void;
  onLogout: () => void;
}

const STATUS_MAP: Record<
  CounterStatus,
  { label: string; dot: string; bg: string; text: string }
> = {
  active:  { label: "Actif",                  dot: "bg-emerald-500", bg: "bg-emerald-50",  text: "text-emerald-800" },
  paused:  { label: "En pause",               dot: "bg-amber-500",   bg: "bg-amber-50",    text: "text-amber-800" },
  pending: { label: "Activation en attente",   dot: "bg-blue-500",    bg: "bg-blue-50",     text: "text-blue-800" },
  closed:  { label: "Comptoir fermé",          dot: "bg-gray-400",    bg: "bg-gray-100",    text: "text-gray-600" },
  none:    { label: "Comptoir fermé",          dot: "bg-gray-400",    bg: "bg-gray-100",    text: "text-gray-600" },
};

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export const PosSessionBar: React.FC<Props> = ({
  status, locked, userName, userCode,
  companyLogo, companyName, agencyName,
  sessionTickets, sessionRevenue,
  primaryColor, secondaryColor,
  sessionStartedAt, isOnline = true,
  onStart, onPause, onContinue, onClose, onRefresh, onLogout,
}) => {
  const s = STATUS_MAP[locked ? "none" : status];
  const gradient = `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`;

  // ── Session timer ──
  const [elapsed, setElapsed] = useState("");
  useEffect(() => {
    if (!sessionStartedAt || !(status === "active" || status === "paused")) {
      setElapsed("");
      return;
    }
    const tick = () => setElapsed(fmtElapsed(Date.now() - sessionStartedAt.getTime()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [sessionStartedAt, status]);

  return (
    <div
      className="sticky top-0 z-20 border-b border-gray-200/60 shadow-sm"
      style={{ backgroundImage: "var(--agency-gradient-header)" }}
    >
      <div className="max-w-[1600px] mx-auto min-w-0 px-2 sm:px-4 lg:px-6">
        {/* Mobile : identité + état + métriques, puis actions + poste. */}
        <div className="min-w-0 space-y-2 py-2 md:hidden">
          <div className="flex min-w-0 items-center gap-2">
            {companyLogo ? (
              <img src={companyLogo} alt="" className="h-10 w-10 shrink-0 rounded-lg border bg-white object-contain p-0.5" />
            ) : (
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-gray-100">
                <User2 className="h-4 w-4 text-gray-400" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold leading-tight" style={{ color: primaryColor }}>{companyName}</p>
              <p className="truncate text-[11px] leading-tight" style={{ color: secondaryColor }}>{agencyName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <div className={`flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-semibold ${s.bg} ${s.text}`}>
                <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot} ${status === "active" ? "animate-pulse" : ""}`} />
                <span>{locked ? "Verrouillé" : s.label}</span>
              </div>
              {!isOnline && (
                <div className="grid h-8 w-8 place-items-center rounded-full bg-red-50 text-red-700" title="Hors-ligne">
                  <WifiOff className="h-3.5 w-3.5" />
                </div>
              )}
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-3 gap-1.5">
            <div className="flex min-w-0 items-center gap-1 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 shadow-sm">
              <Timer className="h-3.5 w-3.5 shrink-0 text-slate-300" />
              <div className="min-w-0">
                <p className="text-[9px] uppercase leading-none text-slate-300">Temps</p>
                <p className="truncate font-mono text-[11px] font-bold tabular-nums text-white">{elapsed || "—"}</p>
              </div>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 shadow-sm">
              <p className="text-[9px] uppercase leading-none text-slate-300">Billets</p>
              <p className="truncate text-xs font-bold text-white">{sessionTickets}</p>
            </div>
            <div className="min-w-0 rounded-lg border border-slate-600 bg-slate-800 px-2 py-1.5 shadow-sm">
              <p className="text-[9px] uppercase leading-none text-slate-300">Recette</p>
              <p className="truncate text-xs font-bold text-white" title={sessionRevenue}>{sessionRevenue}</p>
            </div>
          </div>

          <div className="flex min-w-0 items-center gap-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {status === "active" && !locked && (
                <>
                  <button onClick={onPause}
                    className="inline-flex h-10 min-w-10 flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                    <Pause className="h-3.5 w-3.5" /> <span className="hidden min-[390px]:inline">Pause</span>
                  </button>
                  <button onClick={() => { if (window.confirm("Clôturer le comptoir ? Vous ne pourrez plus vendre.")) onClose(); }}
                    className="inline-flex h-10 min-w-10 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium text-white transition hover:opacity-90"
                    style={{ background: gradient }}>
                    <XCircle className="h-3.5 w-3.5" /> <span className="hidden min-[390px]:inline">Clôturer</span>
                  </button>
                </>
              )}
              {status === "paused" && !locked && (
                <>
                  <button onClick={onContinue}
                    className="inline-flex h-10 min-w-10 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-xs font-medium text-white transition hover:opacity-90"
                    style={{ background: gradient }}>
                    <Play className="h-3.5 w-3.5" /> <span className="hidden min-[390px]:inline">Reprendre</span>
                  </button>
                  <button onClick={() => { if (window.confirm("Clôturer le comptoir ?")) onClose(); }}
                    className="inline-flex h-10 min-w-10 flex-1 items-center justify-center gap-1 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                    <XCircle className="h-3.5 w-3.5" /> <span className="hidden min-[390px]:inline">Clôturer</span>
                  </button>
                </>
              )}
              {status === "pending" && (
                <button onClick={onRefresh}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-xs font-medium text-gray-700 transition hover:bg-gray-50">
                  <RefreshCw className="h-3.5 w-3.5" /> Actualiser
                </button>
              )}
              {(status === "none" || status === "closed") && !locked && (
                <button onClick={onStart}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold text-white shadow-md transition hover:opacity-90"
                  style={{ background: gradient }}>
                  <Power className="h-4 w-4" /> Ouvrir le comptoir
                </button>
              )}
            </div>

            <div className="flex max-w-[7.5rem] min-w-0 items-center gap-1.5 rounded-lg border bg-gray-50 px-1.5 py-1.5" title={`${userName} — ${userCode || "GUEST"}`}>
              <div className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="hidden min-w-0 min-[390px]:block">
                <p className="truncate text-[10px] font-medium text-gray-900">{userName}</p>
                <p className="truncate font-mono text-[9px] text-gray-500">{userCode || "GUEST"}</p>
              </div>
            </div>
            <button onClick={onLogout}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-gray-200 bg-white transition hover:bg-gray-50"
              title="Se déconnecter">
              <LogOut className="h-4 w-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Tablette / desktop */}
        <div className="hidden min-h-16 min-w-0 items-center gap-4 md:flex">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            {companyLogo ? (
              <img src={companyLogo} alt="" className="h-9 w-9 rounded-lg object-contain border bg-white p-0.5" />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-gray-100 grid place-items-center">
                <User2 className="w-4 h-4 text-gray-400" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold truncate" style={{ color: primaryColor }}>{companyName}</p>
              <p className="text-[11px] truncate" style={{ color: secondaryColor }}>{agencyName}</p>
            </div>
          </div>

          <div className="h-8 w-px bg-gray-200" />

          {/* Counter state + network */}
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <div className={`flex min-w-0 items-center gap-1.5 rounded-full px-2 py-1.5 text-[11px] font-semibold sm:gap-2 sm:px-3 sm:text-xs ${s.bg} ${s.text}`}>
              <span className={`h-2 w-2 shrink-0 rounded-full ${s.dot} ${status === "active" ? "animate-pulse" : ""}`} />
              <span className="truncate">{locked ? "Verrouillé" : s.label}</span>
            </div>
            {!isOnline && (
              <div className="flex items-center gap-1 rounded-full bg-red-50 p-1.5 text-red-700 text-[10px] font-semibold sm:px-2 sm:py-1">
                <WifiOff className="w-3 h-3" />
                <span className="hidden sm:inline">Hors-ligne</span>
              </div>
            )}
          </div>

          {/* Session metrics + timer */}
          {(status === "active" || status === "paused") && !locked && (
            <div className="hidden md:flex items-center gap-4 text-sm">
              {elapsed && (
                <div className="flex items-center gap-1.5 text-gray-500">
                  <Timer className="w-3.5 h-3.5" />
                  <span className="font-mono text-xs tabular-nums">{elapsed}</span>
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Billets</span>
                <span className="font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-md">{sessionTickets}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-gray-500">Recette</span>
                <span className="font-bold rounded-md px-2 py-0.5" style={{ background: `${primaryColor}15`, color: primaryColor }}>
                  {sessionRevenue}
                </span>
              </div>
            </div>
          )}

          <div className="flex-1" />

          {/* Session actions */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {status === "active" && !locked && (
              <>
                <button onClick={onPause}
                  className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:h-auto sm:w-auto sm:px-3 sm:py-2">
                  <Pause className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Pause</span>
                </button>
                <button onClick={() => { if (window.confirm("Clôturer le comptoir ? Vous ne pourrez plus vendre.")) onClose(); }}
                  className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-white transition hover:opacity-90 sm:h-auto sm:w-auto sm:px-3 sm:py-2"
                  style={{ background: gradient }}>
                  <XCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Clôturer</span>
                </button>
              </>
            )}
            {status === "paused" && !locked && (
              <>
                <button onClick={onContinue}
                  className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-white transition hover:opacity-90 sm:h-auto sm:px-3 sm:py-2"
                  style={{ background: gradient }}>
                  <Play className="w-3.5 h-3.5" /> Reprendre
                </button>
                <button onClick={() => { if (window.confirm("Clôturer le comptoir ?")) onClose(); }}
                  className="inline-flex h-10 w-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:h-auto sm:w-auto sm:px-3 sm:py-2">
                  <XCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Clôturer</span>
                </button>
              </>
            )}
            {status === "pending" && (
              <button onClick={onRefresh}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:h-auto sm:px-3 sm:py-2">
                <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Actualiser</span>
              </button>
            )}
            {(status === "none" || status === "closed") && !locked && (
              <button onClick={onStart}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-bold text-white shadow-md transition hover:opacity-90 sm:h-auto sm:px-4 sm:py-2.5"
                style={{ background: gradient }}>
                <Power className="w-4 h-4" /> <span className="hidden min-[390px]:inline sm:hidden">Ouvrir</span><span className="hidden sm:inline">Ouvrir le comptoir</span>
              </button>
            )}

            <div className="ml-1 h-8 w-px bg-gray-200" />

            {/* User : nom + code guichetier (toujours visible, code affiché même si GUEST) */}
            <div className="flex min-w-0 items-center gap-1.5 rounded-lg border bg-gray-50 px-1.5 py-1.5 sm:gap-2 sm:px-2.5">
              <div className="w-7 h-7 rounded-full bg-gray-200 grid place-items-center text-xs font-bold text-gray-600 shrink-0">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 hidden sm:block">
                <p className="text-xs font-medium text-gray-900 truncate max-w-[120px]">{userName}</p>
                <p className="text-[10px] text-gray-500 font-mono">{userCode || "GUEST"}</p>
              </div>
              <span className="hidden max-w-14 truncate text-[10px] font-mono font-medium text-gray-600 min-[390px]:inline sm:hidden" title={`Code guichetier: ${userCode || "GUEST"}`}>
                {userCode || "GUEST"}
              </span>
            </div>
            <button onClick={onLogout}
              className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 bg-white transition hover:bg-gray-50"
              title="Se déconnecter">
              <LogOut className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
