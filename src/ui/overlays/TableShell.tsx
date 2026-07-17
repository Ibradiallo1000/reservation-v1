import React from "react";
import { cn } from "@/lib/utils";
export interface TableShellProps extends React.HTMLAttributes<HTMLDivElement> { label: string; }
export function TableShell({ label, className, children, ...props }: TableShellProps) {
  return <div role="region" aria-label={label} tabIndex={0} className={cn("table-scroll-region rounded-xl border border-[var(--color-border)] focus-visible:ring-2 focus-visible:ring-[var(--color-focus)]", className)} {...props}>{children}</div>;
}
