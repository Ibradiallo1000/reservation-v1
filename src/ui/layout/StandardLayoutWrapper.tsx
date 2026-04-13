/**
 * Teliya Design System — Standard page content wrapper (authoritative).
 * Use inside every shell (Agence, Comptable, CEO, Guichet, Courrier, Compagnie, Admin).
 * Global container: max width + centered + responsive horizontal paddings.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { pageMaxWidth, pageVerticalGap, pagePaddingX } from "@/ui/foundation";

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
      "w-full",
      pagePaddingX,
      pageVerticalGap,
      noVerticalPadding ? "" : "py-4",
      className
    )}
  >
    {children}
  </div>
);

StandardLayoutWrapper.displayName = "StandardLayoutWrapper";
