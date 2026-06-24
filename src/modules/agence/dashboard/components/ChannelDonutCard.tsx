// src/modules/agence/dashboard/components/ChannelDonutCard.tsx

import React from "react";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

interface ChannelData {
  label: string;
  value: number;
  color: string;
  icon?: React.ReactNode;
}

interface ChannelDonutCardProps {
  channels: ChannelData[];
  totalLabel?: string;
}

export function ChannelDonutCard({ channels, totalLabel = "Total" }: ChannelDonutCardProps) {
  const money = useFormatCurrency();
  const total = channels.reduce((sum, c) => sum + c.value, 0);

  let startAngle = 0;
  const segments = channels.map((channel) => {
    const percentage = total > 0 ? (channel.value / total) * 100 : 0;
    const angle = (percentage / 100) * 360;
    const endAngle = startAngle + angle;
    const segment = { ...channel, startAngle, endAngle, percentage };
    startAngle = endAngle;
    return segment;
  });

  return (
    <div className="flex items-center gap-4">
      {/* Donut SVG */}
      <div className="relative h-24 w-24 shrink-0">
        <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
          {segments.map((segment, index) => {
            if (segment.percentage === 0) return null;
            const x1 = 50 + 40 * Math.cos((segment.startAngle * Math.PI) / 180);
            const y1 = 50 + 40 * Math.sin((segment.startAngle * Math.PI) / 180);
            const x2 = 50 + 40 * Math.cos((segment.endAngle * Math.PI) / 180);
            const y2 = 50 + 40 * Math.sin((segment.endAngle * Math.PI) / 180);
            const largeArc = segment.percentage > 50 ? 1 : 0;

            return (
              <path
                key={index}
                d={`M 50 50 L ${x1} ${y1} A 40 40 0 ${largeArc} 1 ${x2} ${y2} Z`}
                fill={segment.color}
                className="transition-all duration-500"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-lg font-bold text-gray-900">{money(total)}</div>
          <div className="text-[8px] text-gray-400 uppercase">{totalLabel}</div>
        </div>
      </div>

      {/* Légende */}
      <div className="flex-1 space-y-1.5">
        {channels.map((channel, index) => {
          const percentage = total > 0 ? Math.round((channel.value / total) * 100) : 0;
          return (
            <div key={index} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: channel.color }}
                />
                <span className="text-sm text-gray-600">{channel.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">
                  {money(channel.value)}
                </span>
                <span className="text-xs text-gray-400">({percentage}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}