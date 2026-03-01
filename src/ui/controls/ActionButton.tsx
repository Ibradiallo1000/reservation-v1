/**
 * Teliya Design System — Primary action button (authoritative).
 * Uses theme primary (CSS var). Replaces ad-hoc primary/secondary/danger buttons.
 */
import React from "react";
import { cn } from "@/lib/utils";
import { radius, transitions, typography } from "@/ui/foundation";

const base =
  "inline-flex items-center justify-center gap-2 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-900 disabled:pointer-events-none disabled:opacity-50";

const variants = {
  primary:
  "min-h-[44px] bg-[var(--teliya-primary,var(--btn-primary,#FF6600))] text-white hover:brightness-95 active:brightness-90 focus-visible:ring-[var(--teliya-primary)]",
  secondary:
  "min-h-[44px] border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500",
  danger:
  "min-h-[44px] bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:ring-red-500",
  ghost:
  "text-gray-700 hover:bg-gray-100 active:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-800 dark:active:bg-gray-700 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500",
} as const;

const sizes = {
  default: "h-10 px-4 text-sm",
  sm: "h-8 px-3 text-sm",
  lg: "h-12 px-6 text-base",
  icon: "h-10 w-10",
} as const;

export type ActionButtonVariant = keyof typeof variants;
export type ActionButtonSize = keyof typeof sizes;

export interface ActionButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ActionButtonVariant;
  size?: ActionButtonSize;
}

export const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "default",
      disabled,
      ...props
    },
    ref
  ) => (
    <button
      ref={ref}
      disabled={disabled}
      className={cn(
        base,
        radius.md,
        transitions.colors,
        typography.label,
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
);

ActionButton.displayName = "ActionButton";
