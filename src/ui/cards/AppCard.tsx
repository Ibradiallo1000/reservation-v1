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
      "rounded-2xl bg-white shadow-sm transition-shadow duration-200 hover:shadow-md dark:bg-slate-900",
      "border border-gray-200 dark:border-slate-700 text-gray-900 dark:text-white",
      noPad ? "" : "p-4 sm:p-5",
      className
    )}
    {...props}
  >
    {children}
  </div>
);

AppCard.displayName = "AppCard";
