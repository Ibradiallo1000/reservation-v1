import * as React from "react";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline";
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className = "", variant = "default", ...props }, ref) => {
    const base = "inline-block px-2 py-1 text-xs rounded font-medium";
    const variantClass = {
      default: "bg-gray-100 text-gray-800",
      outline: "border border-gray-300 text-gray-700"
    }[variant];

    return (
      <span
        ref={ref}
        className={`${base} ${variantClass} ${className}`}
        {...props}
      />
    );
  }
);

Badge.displayName = "Badge";
