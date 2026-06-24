import React from "react";

export interface RevenueMiniChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
}

export function RevenueMiniChart({ data, height = 48 }: RevenueMiniChartProps) {
  const maxValue = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-1" style={{ height }}>
      {data.map((item, index) => {
        const barHeight = (item.value / maxValue) * height;
        return (
          <div key={index} className="flex-1 flex flex-col items-center gap-1">
            <div
              className="w-full rounded-t-sm transition-all duration-500"
              style={{
                height: Math.max(4, barHeight),
                backgroundColor: item.color || "#EA580C",
                opacity: item.value > 0 ? 0.9 : 0.3,
              }}
            />
            <span className="text-[8px] text-gray-400 truncate w-full text-center">
              {item.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** @deprecated Prefer RevenueMiniChart */
export const BarChartMini = RevenueMiniChart;