/**
 * Fil d'Ariane pour le contexte de navigation (standard SaaS).
 * Utilisé en haut des pages pour : Poste de pilotage / Réservations réseau / Réservations
 */
import React from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  path?: string;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  /** Séparateur entre les items (défaut : " › ") */
  separator?: string;
  className?: string;
}

export const Breadcrumb: React.FC<BreadcrumbProps> = ({
  items,
  separator = " › ",
  className,
}) => {
  if (!items?.length) return null;
  return (
    <nav
      aria-label="Fil d'Ariane"
      className={cn("flex flex-wrap items-center gap-x-1 text-sm text-gray-500 dark:text-slate-400", className)}
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        const content = (
          <span className={cn(isLast && "font-medium text-gray-700 dark:text-slate-300")}>
            {item.label}
          </span>
        );
        return (
          <React.Fragment key={i}>
            {i > 0 && <span className="shrink-0" aria-hidden>{separator}</span>}
            {item.path && !isLast ? (
              <Link
                to={item.path}
                className="text-gray-600 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:underline"
              >
                {item.label}
              </Link>
            ) : (
              content
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
};

Breadcrumb.displayName = "Breadcrumb";
