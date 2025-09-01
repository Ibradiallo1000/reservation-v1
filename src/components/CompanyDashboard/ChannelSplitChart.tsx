// =============================================
// src/components/companyDashboard/ChannelSplitChart.tsx
// =============================================
import React, { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Label,
} from "recharts";

type Slice = { name: string; value: number };

const PALETTE = [
  "#2563eb", // bleu
  "#16a34a", // vert
  "#f59e0b", // amber
  "#ef4444", // rouge
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f97316", // orange
];

// mapping pour des canaux connus (couleurs fixes)
const CHANNEL_COLOR: Record<string, string> = {
  "en ligne": "#2563eb",
  guichet: "#16a34a",
};

function pickColor(name: string, idx: number) {
  const key = name.toLowerCase();
  return CHANNEL_COLOR[key] || PALETTE[idx % PALETTE.length];
}

export function ChannelSplitChart({
  data,
  loading,
}: {
  data: Slice[];
  loading: boolean;
}) {
  if (loading) return <Skeleton className="h-72 w-full rounded-2xl" />;

  // Nettoyage + tri desc.
  const cleaned = useMemo(() => {
    const grouped = new Map<string, number>();
    data.forEach((d) => {
      const key = (d.name || "Inconnu").trim() || "Inconnu";
      grouped.set(key, (grouped.get(key) || 0) + (Number(d.value) || 0));
    });
    const arr = Array.from(grouped, ([name, value]) => ({ name, value }));
    return arr.sort((a, b) => b.value - a.value);
  }, [data]);

  const total = useMemo(
    () => cleaned.reduce((s, d) => s + d.value, 0),
    [cleaned]
  );

  // État vide
  if (!cleaned.length || total === 0) {
    return (
      <div className="h-72 flex items-center justify-center rounded-2xl border bg-muted/20 text-sm text-muted-foreground">
        Aucune donnée de répartition des canaux pour la période.
      </div>
    );
  }

  // Ajout d'un pourcentage pour les labels/tooltip
  const withPct = cleaned.map((d) => ({
    ...d,
    pct: Math.round((d.value / total) * 100),
  }));

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={withPct}
            dataKey="value"
            nameKey="name"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={1}
          >
            {withPct.map((entry, i) => (
              <Cell key={`cell-${entry.name}-${i}`} fill={pickColor(entry.name, i)} />
            ))}

            {/* total au centre */}
            <Label
              value={`${total}`}
              position="center"
              className="fill-current"
              fontSize={14}
            />
            <Label
              value="Total"
              position="centerTop"
              dy={-14}
              className="fill-current"
              fontSize={11}
            />
          </Pie>

          <Tooltip
            formatter={(value: any, _name, { payload }) => {
              const v = Number(value) || 0;
              const pct = payload?.pct ?? Math.round((v / total) * 100);
              return [`${v} (${pct}%)`, "Réservations"];
            }}
            labelFormatter={(label) => `${label}`}
          />

          <Legend
            verticalAlign="bottom"
            align="center"
            iconType="circle"
            formatter={(value, entry, i) => {
              const pct = withPct[i]?.pct ?? 0;
              return (
                <span className="text-xs">
                  {value} — {pct}%
                </span>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
