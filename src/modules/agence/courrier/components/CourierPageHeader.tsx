// CourierPageHeader — Consistent page header with icon + title using company primary color.

import React from "react";
import type { LucideIcon } from "lucide-react";

export interface CourierPageHeaderProps {
  icon: LucideIcon;
  title: string;
  /** Company primary color for title */
  primaryColor?: string;
  /** Optional description below title */
  description?: React.ReactNode;
  /** Optional right slot (e.g. back link, action) */
  right?: React.ReactNode;
}

const DEFAULT_PRIMARY = "#ea580c";

export default function CourierPageHeader({
  icon: Icon,
  title,
  primaryColor = DEFAULT_PRIMARY,
  description,
  right,
}: CourierPageHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white"
          style={{ backgroundColor: "var(--courier-primary, #ea580c)" }}
          aria-hidden
        >
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <h1
            className="text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ color: "var(--courier-primary, #ea580c)" }}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 text-sm text-gray-600">{description}</p>
          )}
        </div>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </header>
  );
}
