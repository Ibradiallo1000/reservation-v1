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
  /** Extra class for wrapper */
  className?: string;
}

export const SectionCard: React.FC<SectionCardProps> = ({
  title,
  icon: Icon,
  right,
  children,
  noPad = false,
  help,
  className,
}) => (
  <section className={cn(cardBase, className)}>
    <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800">
      <h2 className={cn(typography.sectionTitleCard, "flex items-center gap-2")}>
        {Icon && <Icon className="h-5 w-5 text-gray-500 dark:text-gray-400" />}
        {title}
        {help}
      </h2>
      {right}
    </div>
    <div className={noPad ? "" : "p-5"}>{children}</div>
  </section>
);

SectionCard.displayName = "SectionCard";
