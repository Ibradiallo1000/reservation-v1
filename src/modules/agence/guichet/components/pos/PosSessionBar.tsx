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
  active:  { label: "Comptoir ouvert",        dot: "bg-emerald-500", bg: "bg-emerald-50",  text: "text-emerald-800" },
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
    <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-[1600px] mx-auto px-4 lg:px-6">
        <div className="h-16 flex items-center gap-4">
          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0 shrink-0">
            {companyLogo ? (
              <img src={companyLogo} alt="" className="h-9 w-9 rounded-lg object-contain border bg-white p-0.5" />
            ) : (
              <div className="h-9 w-9 rounded-lg bg-gray-100 grid place-items-center">
                <User2 className="w-4 h-4 text-gray-400" />
              </div>
            )}
            <div className="min-w-0 hidden sm:block">
              <p className="text-sm font-bold truncate" style={{ color: primaryColor }}>{companyName}</p>
              <p className="text-[11px] text-gray-500 truncate">{agencyName}</p>
            </div>
          </div>

          <div className="h-8 w-px bg-gray-200 hidden sm:block" />

          {/* Counter state + network */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold ${s.bg} ${s.text}`}>
              <span className={`w-2 h-2 rounded-full ${s.dot} ${status === "active" ? "animate-pulse" : ""}`} />
              {locked ? "Verrouillé (autre appareil)" : s.label}
            </div>
            {!isOnline && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-semibold">
                <WifiOff className="w-3 h-3" />
                Hors-ligne
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
          <div className="flex items-center gap-2">
            {status === "active" && !locked && (
              <>
                <button onClick={onPause}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition">
                  <Pause className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Pause</span>
                </button>
                <button onClick={() => { if (window.confirm("Clôturer le comptoir ? Vous ne pourrez plus vendre.")) onClose(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition hover:opacity-90"
                  style={{ background: gradient }}>
                  <XCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Clôturer</span>
                </button>
              </>
            )}
            {status === "paused" && !locked && (
              <>
                <button onClick={onContinue}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-white transition hover:opacity-90"
                  style={{ background: gradient }}>
                  <Play className="w-3.5 h-3.5" /> Reprendre
                </button>
                <button onClick={() => { if (window.confirm("Clôturer le comptoir ?")) onClose(); }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition">
                  <XCircle className="w-3.5 h-3.5" /> Clôturer
                </button>
              </>
            )}
            {status === "pending" && (
              <button onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition">
                <RefreshCw className="w-3.5 h-3.5" /> Actualiser
              </button>
            )}
            {(status === "none" || status === "closed") && !locked && (
              <button onClick={onStart}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold text-white transition hover:opacity-90 shadow-md"
                style={{ background: gradient }}>
                <Power className="w-4 h-4" /> Ouvrir le comptoir
              </button>
            )}

            <div className="h-8 w-px bg-gray-200 ml-1" />

            {/* User */}
            <div className="hidden lg:flex items-center gap-2 bg-gray-50 border rounded-lg px-2.5 py-1.5">
              <div className="w-7 h-7 rounded-full bg-gray-200 grid place-items-center text-xs font-bold text-gray-600">
                {userName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 truncate max-w-[120px]">{userName}</p>
                <p className="text-[10px] text-gray-500">{userCode}</p>
              </div>
            </div>
            <button onClick={onLogout}
              className="p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
              title="Se déconnecter">
              <LogOut className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
