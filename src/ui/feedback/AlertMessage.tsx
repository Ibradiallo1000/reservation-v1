/**
 * Teliya Design System — Alert / message row (success, warning, error).
 * Use for inline alert messages in sections.
 */
import React from "react";
import { cn } from "@/lib/utils";

const severityClasses = {
  green:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
  yellow:
    "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
  red: "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200",
} as const;

const dotClasses = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
} as const;

export type AlertSeverity = keyof typeof severityClasses;

export interface AlertMessageProps {
  severity: AlertSeverity;
  message: string;
  className?: string;
}

export const AlertMessage: React.FC<AlertMessageProps> = ({
  severity,
  message,
  className,
}) => (
  <div
    className={cn(
      "flex items-start gap-3 px-4 py-3 rounded-lg text-sm",
      severityClasses[severity],
      className
    )}
  >
    <span
      className={cn(
        "w-2 h-2 rounded-full mt-1.5 shrink-0",
        dotClasses[severity]
      )}
    />
    <p>{message}</p>
  </div>
);

AlertMessage.displayName = "AlertMessage";
