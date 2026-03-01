/**
 * Teliya Design System — Universal page header (authoritative).
 * Replaces all ad-hoc h1 patterns and CourierPageHeader.
 * Use for Agence, Comptable, CEO, Guichet, Courrier, Compagnie, Admin.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/ui/foundation";
import type { LucideIcon } from "lucide-react";

export interface PageHeaderProps {
  /** Main title (required) */
  title: React.ReactNode;
  /** Optional subtitle or description below title */
  subtitle?: React.ReactNode;
  /** Optional icon shown left of title (uses theme primary for background) */
  icon?: LucideIcon;
  /** Optional right slot (actions, breadcrumb, etc.) */
  right?: React.ReactNode;
  /** CSS variable for primary color (e.g. --teliya-primary, --courier-primary). If not set, title uses default text color. */
  primaryColorVar?: string;
  /** Extra class names for the header container */
  className?: string;
  /** Extra class names for the title */
  titleClassName?: string;
}

const DEFAULT_PRIMARY_VAR = "var(--teliya-primary, #FF6600)";

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon: Icon,
  right,
  primaryColorVar = DEFAULT_PRIMARY_VAR,
  className,
  titleClassName,
}) => (
  <header
    className={cn(
      "mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
      className
    )}
  >
    <div className="flex min-w-0 items-center gap-3">
      {Icon && (
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: primaryColorVar }}
          aria-hidden
        >
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="min-w-0">
        <h1
          className={cn(
            typography.pageTitlePremium,
            primaryColorVar ? "" : "text-gray-900 dark:text-gray-100",
            titleClassName
          )}
          style={primaryColorVar ? { color: primaryColorVar } : undefined}
        >
          {title}
        </h1>
        {subtitle && (
          <p className={cn("mt-2", typography.subtitle)}>{subtitle}</p>
        )}
      </div>
    </div>
    {right && <div className="shrink-0">{right}</div>}
  </header>
);

PageHeader.displayName = "PageHeader";
