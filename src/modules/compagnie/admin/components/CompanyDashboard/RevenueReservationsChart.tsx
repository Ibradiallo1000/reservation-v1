// ======================================================
// src/components/CompanyDashboard/RevenueReservationsChart.tsx
// ======================================================
import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

type Point = { date: string; revenue: number; reservations: number };

const DEFAULT_PRIMARY = "#ef4444";
const DEFAULT_SECONDARY = "#3b82f6";

export function RevenueReservationsChart({
  data,
  loading,
  primaryColor,
  secondaryColor,
}: {
  data: Point[];
  loading?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
}) {
  const primary = primaryColor || DEFAULT_PRIMARY;
  const secondary = secondaryColor || DEFAULT_SECONDARY;
  if (loading) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <div className="h-72 flex items-center justify-center text-sm text-muted-foreground">
        Aucune donnée sur la période.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 18, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={primary} stopOpacity={0.2} />
              <stop offset="100%" stopColor={primary} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fillReservations" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={secondary} stopOpacity={0.2} />
              <stop offset="100%" stopColor={secondary} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            name="Chiffre d’affaires"
            stroke={primary}
            strokeWidth={2}
            fill="url(#fillRevenue)"
            dot={false}
            activeDot={{ r: 4, fill: primary }}
          />
          <Area
            yAxisId="right"
            type="monotone"
            dataKey="reservations"
            name="Réservations"
            stroke={secondary}
            strokeWidth={2}
            fill="url(#fillReservations)"
            dot={false}
            activeDot={{ r: 4, fill: secondary }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
