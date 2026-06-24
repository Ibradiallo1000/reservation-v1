import React from "react";
import { cn } from "@/lib/utils";

type CompactKpiTone = "critical" | "warning" | "neutral" | "success";

interface CompactKpiCardProps {
  title: string;
  value?: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: CompactKpiTone;
  actionLabel?: string;
  onAction?: () => void;
  badge?: string;
  className?: string;
}

function toneClasses(tone: CompactKpiTone) {
  if (tone === "critical") {
    return {
      card: "border-red-200 bg-red-50/80 dark:border-red-900/50 dark:bg-red-950/20",
      icon: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200",
      badge: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-200",
    };
  }
  if (tone === "warning") {
    return {
      card: "border-amber-200 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/20",
      icon: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-200",
      badge: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200",
    };
  }
  if (tone === "success") {
    return {
      card: "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900/50 dark:bg-emerald-950/20",
      icon: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200",
      badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200",
    };
  }
  return {
    card: "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900",
    icon: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
}

export function CompactKpiCard({
  title,
  value,
  subtitle,
  icon,
  tone = "neutral",
  actionLabel,
  onAction,
  badge,
  className,
}: CompactKpiCardProps) {
  const styles = toneClasses(tone);

  return (
    <div className={cn("rounded-xl border p-3", styles.card, className)}>
      <div className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", styles.icon)}>
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs font-semibold text-slate-900 dark:text-white">{title}</p>
            {badge ? (
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", styles.badge)}>
                {badge}
              </span>
            ) : null}
          </div>
          {value !== undefined && value !== "" ? (
            <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
          ) : null}
          {subtitle ? (
            <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actionLabel && onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-2 text-[11px] font-semibold text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
