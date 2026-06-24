import React from "react";
import { cn } from "@/lib/utils";

interface MiniDonutStatProps {
  label: string;
  displayValue: string;
  subLabel?: string;
  percentage: number;
  color: string;
  className?: string;
}

export function MiniDonutStat({
  label,
  displayValue,
  subLabel,
  percentage,
  color,
  className,
}: MiniDonutStatProps) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(Math.max(percentage, 0), 100);
  const strokeDashoffset = circumference - (clamped / 100) * circumference;

  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
      <div className="relative h-14 w-14 shrink-0">
        <svg className="h-14 w-14 -rotate-90" viewBox="0 0 56 56">
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            className="text-slate-100 dark:text-slate-800"
          />
          <circle
            cx="28"
            cy="28"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-700 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
            {Math.round(clamped)}%
          </span>
        </div>
      </div>
      <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-xs font-semibold text-slate-900 dark:text-white">{displayValue}</span>
      {subLabel ? (
        <span className="text-[10px] text-slate-500 dark:text-slate-500">{subLabel}</span>
      ) : null}
    </div>
  );
}
