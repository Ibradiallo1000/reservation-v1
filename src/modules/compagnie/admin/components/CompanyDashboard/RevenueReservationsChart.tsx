// ======================================================
// src/components/CompanyDashboard/RevenueReservationsChart.tsx
// ======================================================
import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";
import dayjs from "dayjs";
import "dayjs/locale/fr";

dayjs.locale("fr");

export type ChartRangeKey = "day" | "week" | "month" | "custom";

type Point = {
  date: string;
  revenue: number;
  reservations: number;
  label?: string;
  trend?: number;
  agenciesActive?: number;
};

const DEFAULT_PRIMARY = "#ef4444";
const DEFAULT_SECONDARY = "#3b82f6";
const TREND_COLOR = "#6366f1";

/** Moving average used for revenue trend line. */
function calculateTrend(data: Point[], windowSize = 3): Point[] {
  return data.map((item, index, arr) => {
    const start = Math.max(0, index - windowSize + 1);
    const subset = arr.slice(start, index + 1);
    const avg = subset.length ? subset.reduce((sum, d) => sum + (d.revenue || 0), 0) / subset.length : 0;
    return { ...item, trend: Math.round(avg) };
  });
}

/** X-axis label format by range (day => hours, week => short weekday, month => day number). */
function formatXLabel(dateStr: string, range: ChartRangeKey): string {
  const isHourly = dateStr.includes("T");
  if (range === "day" || isHourly) {
    const hour = isHourly ? parseInt(dateStr.split("T")[1]?.slice(0, 2) || "0", 10) : 0;
    return `${String(hour).padStart(2, "0")}h`;
  }
  const d = dayjs(dateStr);
  if (!d.isValid()) return dateStr;
  if (range === "week") return d.format("ddd");
  return d.format("DD");
}

/** Custom tooltip: date + revenue + reservations/places + active agencies when available. */
function CustomTooltip({
  active,
  payload,
  secondaryMetricLabel = "Reservations",
}: {
  active?: boolean;
  payload?: Array<{ payload: Point }>;
  label?: string;
  secondaryMetricLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  const dateLabel = data.date.includes("T")
    ? `${dayjs(data.date.slice(0, 10)).format("dddd D MMMM")} - ${data.date.slice(11, 13)}h`
    : dayjs(data.date).format("dddd D MMMM");

  return (
    <div className="min-w-[180px] rounded-lg border border-gray-200 bg-white p-3 text-sm shadow-md dark:border-slate-600 dark:bg-slate-800">
      <div className="mb-2 border-b border-gray-100 pb-2 font-medium text-gray-900 dark:border-slate-600 dark:text-white">
        {dateLabel}
      </div>
      <div className="flex justify-between gap-4 py-1">
        <span className="text-gray-600 dark:text-slate-400">CA</span>
        <span className="font-medium text-red-600 dark:text-red-400">
          {(data.revenue ?? 0).toLocaleString("fr-FR")} FCFA
        </span>
      </div>
      <div className="flex justify-between gap-4 py-1">
        <span className="text-gray-600 dark:text-slate-400">{secondaryMetricLabel}</span>
        <span className="font-medium text-amber-600 dark:text-amber-400">{data.reservations ?? 0}</span>
      </div>
      {data.agenciesActive !== undefined && (
        <div className="flex justify-between gap-4 py-1">
          <span className="text-gray-600 dark:text-slate-400">Agences actives</span>
          <span className="font-medium text-gray-900 dark:text-white">{data.agenciesActive}</span>
        </div>
      )}
    </div>
  );
}

export function RevenueReservationsChart({
  data: rawData,
  loading,
  primaryColor,
  secondaryColor,
  range = "month",
  secondaryMetricLabel = "Reservations",
  compact = false,
}: {
  data: Point[];
  loading?: boolean;
  primaryColor?: string;
  secondaryColor?: string;
  /** Display range: day = 24h, week = weekday, month = day number. */
  range?: ChartRangeKey;
  /** Label for the reservations series (example: ticket seats). */
  secondaryMetricLabel?: string;
  /** Compact mode for dense mobile-first dashboards. */
  compact?: boolean;
}) {
  const primary = primaryColor || DEFAULT_PRIMARY;
  const secondary = secondaryColor || DEFAULT_SECONDARY;

  const data = useMemo(() => {
    if (!rawData?.length) return [];
    const withLabels = rawData.map((p) => ({
      ...p,
      label: formatXLabel(p.date, range),
    }));
    return calculateTrend(withLabels, 3);
  }, [rawData, range]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        Chargement...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-foreground">
        Aucune donnee sur la periode.
      </div>
    );
  }

  return (
    <div className={compact ? "h-[220px] min-h-[220px] w-full" : "h-[min(280px,42vh)] min-h-[200px] w-full"}>
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
          <XAxis
            dataKey="label"
            tick={{ fontSize: compact ? 10 : 12 }}
            minTickGap={compact ? 20 : 8}
            interval={compact ? "preserveStartEnd" : 0}
          />
          <YAxis yAxisId="left" tick={{ fontSize: compact ? 10 : 12 }} width={compact ? 40 : 48} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} hide={compact} />
          <Tooltip content={<CustomTooltip secondaryMetricLabel={secondaryMetricLabel} />} />
          {!compact && <Legend />}

          <Area
            yAxisId="left"
            type="monotone"
            dataKey="revenue"
            name="Chiffre d'affaires"
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
            name={secondaryMetricLabel}
            stroke={secondary}
            strokeWidth={2}
            fill="url(#fillReservations)"
            dot={false}
            activeDot={{ r: 4, fill: secondary }}
          />

          {!compact && (
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="trend"
              name="Tendance"
              stroke={TREND_COLOR}
              strokeWidth={2}
              dot={false}
              strokeDasharray="5 5"
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
