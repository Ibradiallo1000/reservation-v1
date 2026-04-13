import React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  className?: string;
};

export default function InfoTooltip({ label, className }: Props) {
  return (
    <details className={cn("relative inline-block", className)}>
      <summary className="list-none cursor-pointer rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
        <Info className="h-4 w-4" aria-hidden />
        <span className="sr-only">Voir l'aide</span>
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
        {label}
      </div>
    </details>
  );
}

