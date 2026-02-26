import * as React from "react";
import { cn } from "@/lib/utils";
import { DESIGN } from "@/app/design-system";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "sm" | "lg" | "icon";
}

const variantStyles: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-[var(--btn-primary,#FF6600)] text-white hover:brightness-90 active:brightness-85",
  secondary:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 active:bg-gray-100",
  ghost:
    "bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
};

const sizeStyles: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: `${DESIGN.button.height} px-4 py-2 ${DESIGN.button.fontSize}`,
  sm: `${DESIGN.button.heightSm} px-3 text-sm`,
  lg: `${DESIGN.button.heightLg} px-6 text-base`,
  icon: `${DESIGN.button.height} w-10 justify-center`,
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "default", disabled, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center gap-2",
          DESIGN.button.radius,
          DESIGN.button.fontWeight,
          DESIGN.button.transition,
          DESIGN.button.focusRing,
          "disabled:pointer-events-none disabled:opacity-50",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
