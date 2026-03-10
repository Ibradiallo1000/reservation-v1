/**
 * Manager UI — non-deprecated components only.
 * All cards, KPIs, badges, empty states, date filter: use @/ui.
 * This file keeps only: HelpTip, ConfirmModal, NotificationBell.
 */
import React, { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { Info, X } from "lucide-react";
import { ActionButton } from "@/ui";

/* ────────────────────────────────────────────────────────
   HELP TOOLTIP — contextual help with mobile support.
   ──────────────────────────────────────────────────────── */
export const HelpTip: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
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
          open ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
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
}> = ({
  open,
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  variant = "primary",
  onConfirm,
  onCancel,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel();
      }}
    >
      <div className="fixed inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-gray-100 transition"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="flex items-center justify-end gap-2 pt-2">
          <ActionButton onClick={onCancel} variant="secondary">
            {cancelLabel}
          </ActionButton>
          <ActionButton
            onClick={onConfirm}
            variant={variant === "danger" ? "danger" : "primary"}
          >
            {confirmLabel}
          </ActionButton>
        </div>
      </div>
    </div>
  );
};

/* ────────────────────────────────────────────────────────
   NOTIFICATION BELL DROPDOWN
   ──────────────────────────────────────────────────────── */
export const NotificationBell: React.FC<{
  alerts: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    link: string;
  }>;
  totalCount: number;
  onAlertRead?: (alertId: string) => void;
  onMarkAllRead?: () => void;
}> = ({ alerts, totalCount, onAlertRead, onMarkAllRead }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() =>
          setOpen((v) => {
            const next = !v;
            if (next) onMarkAllRead?.();
            return next;
          })
        }
        className="relative p-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition"
        title="Notifications"
      >
        <svg
          className="w-4 h-4 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
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
            <p className="text-sm font-semibold text-gray-900">
              Alertes ({totalCount})
            </p>
          </div>
          {alerts.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">
              Aucune alerte
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {alerts.slice(0, 15).map((a) => (
                <a
                  key={a.id}
                  href={a.link}
                  onClick={() => {
                    onAlertRead?.(a.id);
                    setOpen(false);
                  }}
                  className="block px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full mt-1.5 shrink-0",
                        a.severity === "critical"
                          ? "bg-red-500"
                          : a.severity === "warning"
                            ? "bg-amber-500"
                            : "bg-blue-500"
                      )}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {a.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {a.description}
                      </p>
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
