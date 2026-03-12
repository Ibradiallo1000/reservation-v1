/**
 * Teliya Design System — Metric / KPI card (authoritative).
 * Single card for numeric metrics with optional icon, label, help, and critical state.
 * Respects company theme via CSS vars for value color when not critical.
 */
import React from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { radius, shadows, typography } from "@/ui/foundation";
import type { LucideIcon } from "lucide-react";

const cardBase = cn(
  "flex min-h-[110px] flex-col justify-between border border-gray-200 bg-white p-4 sm:p-5 dark:border-gray-700 dark:bg-gray-900",
  radius.lg,
  shadows.sm
);

const cardCritical = cn(
  "flex min-h-[110px] flex-col justify-between border-2 border-red-400 bg-red-50/50 p-4 sm:p-5 dark:border-red-500 dark:bg-red-900/20",
  radius.lg,
  shadows.sm
);

export interface MetricCardProps {
  /** Label above value (e.g. "Réservations du jour") */
  label: string;
  /** Main value (number or string) */
  value: string | number;
  /** Optional icon (right of label or top-right) */
  icon?: LucideIcon;
  /** Optional help tooltip node */
  help?: React.ReactNode;
  /** Optional small in-card hint under label */
  hint?: string;
  /** If true, show critical state (red border, danger styling) */
  critical?: boolean;
  /** Optional critical message (e.g. "Écart de caisse détecté") */
  criticalMessage?: string;
  /** Value color: use CSS variable (e.g. var(--teliya-primary)) or leave default. Ignored when critical. */
  valueColorVar?: string;
  /** Extra class for wrapper */
  className?: string;
  /** Decorative mode (soft gradient + icon badge) */
  decorative?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  help,
  hint,
  critical = false,
  criticalMessage,
  valueColorVar,
  className,
  decorative = false,
}) => (
  <div
    className={cn(
      critical ? cardCritical : cardBase,
      decorative && !critical && "bg-gradient-to-br from-white via-slate-50 to-indigo-50/40",
      className
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 pr-1">
        <p className={cn(typography.kpiLabel, "leading-snug")}>
          {label}
          {help}
        </p>
        {hint && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        )}
      </div>
      {critical ? (
        <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" aria-hidden />
      ) : (
        Icon && (
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full",
              decorative
                ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                : "text-gray-400 dark:text-gray-500"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )
      )}
    </div>
    <p
      className={cn(
        "mt-2 overflow-hidden text-ellipsis whitespace-nowrap text-xl sm:text-2xl",
        typography.valueLarge,
        critical ? "text-red-700 dark:text-red-300" : ""
      )}
      style={
        !critical && valueColorVar ? { color: valueColorVar } : undefined
      }
    >
      {value}
    </p>
    {critical && criticalMessage && (
      <p className={cn("mt-1.5", typography.mutedSm, "font-medium text-red-600 dark:text-red-400")}>
        {criticalMessage}
      </p>
    )}
  </div>
);

MetricCard.displayName = "MetricCard";
