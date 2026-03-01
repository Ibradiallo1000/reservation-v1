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
  "flex min-h-[110px] flex-col justify-between border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900",
  radius.lg,
  shadows.sm
);

const cardCritical = cn(
  "flex min-h-[110px] flex-col justify-between border-2 border-red-400 bg-red-50/50 p-5 dark:border-red-500 dark:bg-red-900/20",
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
  /** If true, show critical state (red border, danger styling) */
  critical?: boolean;
  /** Optional critical message (e.g. "Écart de caisse détecté") */
  criticalMessage?: string;
  /** Value color: use CSS variable (e.g. var(--teliya-primary)) or leave default. Ignored when critical. */
  valueColorVar?: string;
  /** Extra class for wrapper */
  className?: string;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  help,
  critical = false,
  criticalMessage,
  valueColorVar,
  className,
}) => (
  <div className={cn(critical ? cardCritical : cardBase, className)}>
    <div className="flex items-center justify-between">
      <p className={cn(typography.kpiLabel, "flex items-center")}>
        {label}
        {help}
      </p>
      {critical ? (
        <AlertTriangle className="h-5 w-5 text-red-500 dark:text-red-400" aria-hidden />
      ) : (
        Icon && (
          <Icon className="h-5 w-5 text-gray-400 dark:text-gray-500" aria-hidden />
        )
      )}
    </div>
    <p
      className={cn(
        "mt-3",
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
