// src/modules/agence/dashboard/components/ActivityMetricCard.tsx

import React from "react";
import { cn } from "@/lib/utils";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

interface ActivityMetricCardProps {
  label: string;
  value: number;
  icon?: React.ReactNode;
  color?: string;
  progress?: number;
  subtitle?: string;
  onClick?: () => void;
}

export function ActivityMetricCard({
  label,
  value,
  icon,
  color = "#EA580C",
  progress = 0,
  subtitle,
  onClick,
}: ActivityMetricCardProps) {
  const money = useFormatCurrency();
  const circumference = 2 * Math.PI * 40;
  const strokeDashoffset = circumference - (Math.min(Math.max(progress, 0), 100) / 100) * circumference;

  return (
    <div
      onClick={onClick}
      className={cn(
        "relative rounded-xl border border-gray-200 bg-white p-4 transition-all hover:shadow-md cursor-pointer",
        "flex items-center gap-4"
      )}
      style={{ borderColor: color + "30" }}
    >
      {/* Icône */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
        style={{ backgroundColor: color + "20" }}
      >
        <span style={{ color }}>{icon}</span>
      </div>

      {/* Contenu */}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {label}
        </div>
        <div className="text-xl font-bold text-gray-900">
          {money(value)}
        </div>
        {subtitle && (
          <div className="text-xs text-gray-400 mt-0.5">{subtitle}</div>
        )}
      </div>

      {/* Cercle de progression */}
      <div className="relative h-16 w-16 shrink-0">
        <svg className="h-16 w-16 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#E5E7EB"
            strokeWidth="8"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
}