/**
 * Teliya Design System — Standard page content wrapper (authoritative).
 * Use inside every shell (Agence, Comptable, CEO, Guichet, Courrier, Compagnie, Admin).
 * Pleine largeur, px-4, rythme vertical space-y-4 (pas de max-width / mx-auto).
 */
import React from "react";
import { cn } from "@/lib/utils";
import { pageMaxWidth, pageVerticalGap } from "@/ui/foundation";

export interface StandardLayoutWrapperProps {
  children: React.ReactNode;
  /** Extra class names (e.g. for transition) */
  className?: string;
  /** If true, only horizontal padding (no vertical). Use when parent already provides vertical padding. */
  noVerticalPadding?: boolean;
  /** Classes supplémentaires sur le conteneur (ex. w-full). */
  maxWidthClass?: string;
}

export const StandardLayoutWrapper: React.FC<StandardLayoutWrapperProps> = ({
  children,
  className,
  noVerticalPadding = false,
  maxWidthClass,
}) => (
  <div
    className={cn(
      maxWidthClass ?? pageMaxWidth,
      "w-full px-4",
      pageVerticalGap,
      noVerticalPadding ? "" : "py-4",
      className
    )}
  >
    {children}
  </div>
);

StandardLayoutWrapper.displayName = "StandardLayoutWrapper";
