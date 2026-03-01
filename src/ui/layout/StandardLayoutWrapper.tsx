/**
 * Teliya Design System — Standard page content wrapper (authoritative).
 * Use inside every shell (Agence, Comptable, CEO, Guichet, Courrier, Compagnie, Admin).
 * Ensures consistent max-width, padding, and vertical spacing.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { pageMaxWidth, pagePadding, pageVerticalGap } from "@/ui/foundation";

export interface StandardLayoutWrapperProps {
  children: React.ReactNode;
  /** Extra class names (e.g. for transition) */
  className?: string;
  /** If true, only horizontal padding (no vertical). Use when parent already provides vertical padding. */
  noVerticalPadding?: boolean;
  /** Override max width (e.g. max-w-6xl). When set, replaces default max-w-7xl. */
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
      maxWidthClass ? `${maxWidthClass} mx-auto` : pageMaxWidth,
      noVerticalPadding ? "px-4 md:px-6" : pagePadding,
      pageVerticalGap,
      className
    )}
  >
    {children}
  </div>
);

StandardLayoutWrapper.displayName = "StandardLayoutWrapper";
