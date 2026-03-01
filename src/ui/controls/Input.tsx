/**
 * Teliya Design System — Text input (authoritative).
 * Smooth focus transition, consistent radius, subtle focus shadow.
 */
import * as React from "react";
import { cn } from "@/lib/utils";
import { radius, transitions } from "@/ui/foundation";

const inputBase = cn(
  "w-full border border-gray-300 bg-white px-3 py-2 text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500",
  "focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-200 focus:ring-offset-0 dark:focus:border-gray-500 dark:focus:ring-gray-700",
  "disabled:cursor-not-allowed disabled:opacity-50",
  radius.md,
  transitions.colors,
  "transition-shadow duration-200 focus:shadow-sm"
);

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(inputBase, className)} {...props} />
  )
);

Input.displayName = "Input";
