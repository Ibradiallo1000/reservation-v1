/**
 * Teliya Design System — Section card with title bar (authoritative).
 * Replaces duplicated section card patterns across Agence, Compagnie, Admin, etc.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { typography } from "@/ui/foundation";
import type { LucideIcon } from "lucide-react";

const cardBase = cn(
  "border border-gray-200 bg-white text-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100",
  "rounded-xl shadow-md hover:shadow-lg transition-all duration-200"
);

export interface SectionCardProps {
  /** Section title */
  title: string;
  /** Optional icon left of title */
  icon?: LucideIcon;
  /** Optional right slot (actions, filters) */
  right?: React.ReactNode;
  /** Card body content */
  children: React.ReactNode;
  /** If true, body has no padding (e.g. for full-bleed tables) */
  noPad?: boolean;
  /** Optional help tooltip (render your own HelpTip in children or pass string for future use) */
  help?: React.ReactNode;
  /** Subtitle under the title */
  description?: React.ReactNode;
  /** Extra class for wrapper */
  className?: string;
  /** Inline styles on the outer section (e.g. brand-tinted background) */
  style?: React.CSSProperties;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  icon: Icon,
  right,
  children,
  noPad = false,
  help,
  description,
  className,
  style,
}) => (
  <section className={cn(cardBase, className)} style={style}>
    <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
      <div className="flex min-w-0 flex-1 gap-3">
        {Icon ? (
          <Icon
            className="mt-0.5 h-5 w-5 shrink-0 text-gray-500 dark:text-gray-400"
            aria-hidden
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <h2
            className={cn(
              typography.sectionTitleCard,
              "flex flex-wrap items-center gap-x-2 gap-y-0.5"
            )}
          >
            <span>{title}</span>
            {help}
          </h2>
          {description != null && description !== "" ? (
            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
      </div>
      {right ? <div className="shrink-0 pt-0.5">{right}</div> : null}
    </div>
    <div className={noPad ? "" : "p-5"}>{children}</div>
  </section>
);

SectionCard.displayName = "SectionCard";
