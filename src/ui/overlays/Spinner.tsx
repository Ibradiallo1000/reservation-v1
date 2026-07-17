import React from "react";
import { cn } from "@/lib/utils";
export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> { label?: string; }
export function Spinner({ label = "Chargement", className, ...props }: SpinnerProps) {
  return <span role="status" className={cn("inline-flex items-center gap-2 text-sm text-[var(--color-text-secondary)]", className)} {...props}><span className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-r-transparent" aria-hidden /><span>{label}</span></span>;
}
