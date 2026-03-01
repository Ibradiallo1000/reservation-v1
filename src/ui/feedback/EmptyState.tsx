/**
 * Teliya Design System — Empty state placeholder (authoritative).
 * Use when a list or section has no data to display.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/ui/foundation";

export interface EmptyStateProps {
  /** Message shown (e.g. "Aucune réservation.") */
  message: React.ReactNode;
  /** Optional icon above message */
  icon?: React.ReactNode;
  /** Extra class for container */
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  message,
  icon,
  className,
}) => (
  <div
    className={cn(
      "py-8 text-center",
      typography.muted,
      className
    )}
  >
    {icon && <div className="mb-2 flex justify-center">{icon}</div>}
    {message}
  </div>
);

EmptyState.displayName = "EmptyState";
