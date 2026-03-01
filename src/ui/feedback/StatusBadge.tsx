/**
 * Teliya Design System — Semantic status badge (authoritative).
 * Use ONLY this component for status pills. No raw emerald/red/yellow classes in page code.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { radius, statusBadgeClasses, type StatusVariant } from "@/ui/foundation";

export interface StatusBadgeProps {
  /** Semantic status (maps to consistent colors) */
  status: StatusVariant;
  children: React.ReactNode;
  /** Extra class names */
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  children,
  className,
}) => {
  const classes = statusBadgeClasses[status];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center gap-1 px-2.5 py-1 text-xs font-medium leading-none",
        radius.lg,
        classes.bg,
        classes.text,
        className
      )}
    >
      {children}
    </span>
  );
};

StatusBadge.displayName = "StatusBadge";
