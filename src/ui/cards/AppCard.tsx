/**
 * Design system — Carte unique pour le dashboard TELIYA.
 * Effet flottant (ombre douce), espacement et style cohérents.
 * Utiliser pour toutes les cartes du dashboard (Poste de pilotage, Réservations réseau, Finances, Flotte, Audit).
 */
import React from "react";
import { cn } from "@/lib/utils";

export interface AppCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  /** Désactive le padding par défaut (p-6) */
  noPad?: boolean;
}

export const AppCard: React.FC<AppCardProps> = ({
  children,
  className,
  noPad = false,
  ...props
}) => (
  <div
    className={cn(
      "rounded-xl bg-white dark:bg-slate-800 shadow-md hover:shadow-lg transition-all duration-200",
      "border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white",
      noPad ? "" : "p-6",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

AppCard.displayName = "AppCard";
