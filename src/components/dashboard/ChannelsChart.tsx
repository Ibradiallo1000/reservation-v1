import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, Label } from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/hooks/useCompanyTheme";

interface ChannelStat {
  name: string; // "En ligne" | "Guichet"
  value: number;
}

export const ChannelsChart = ({
  data,
  isLoading
}: {
  data: ChannelStat[];
  isLoading: boolean;
}) => {
  const { company } = useAuth();
  const theme = useCompanyTheme(company);

  // Normalisation des libellés + calcul des pourcentages
  const enriched = useMemo(() => {
    // Harmonise "guiché/guichet/..." → "Guichet", "en ligne" → "En ligne"
    const normalize = (s: string) =>
      (s || "")
        .toLowerCase()
        .trim()
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .replace("guiche", "guichet")
        .replace("en ligne", "En ligne")
        .replace("guichet", "Guichet")
        .replace(/^en ligne$/, "En ligne")
        .replace(/^guichet$/, "Guichet");

    const fixed = data.map(d => ({ ...d, name: normalize(d.name) }));
    const total = fixed.reduce((s, d) => s + (Number(d.value) || 0), 0);
    return {
      total,
      rows: fixed.map(d => ({
        ...d,
        pct: total ? Math.round((Number(d.value) / total) * 100) : 0
      }))
    };
  }, [data]);

  // Palette dynamique
  const COLORS = [
    theme.colors.primary,
    theme.colors.secondary,
    theme.colors.accent,
    theme.colors.tertiary,
    "#9CA3AF" // fallback
  ];

  if (isLoading) {
    return <Skeleton className="w-full h-64 rounded-lg" />;
  }

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader>
        <CardTitle style={{ color: theme.colors.primary }}>
          Répartition par canal
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={enriched.rows}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                labelLine={false}
                // On laisse les labels sur les parts désactivés pour éviter le chevauchement,
                // tout est géré dans la légende et le tooltip
              >
                {enriched.rows.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
                {/* Total au centre */}
                <Label
                  position="center"
                  content={() => (
                    <text textAnchor="middle" dominantBaseline="middle">
                      <tspan fontSize="16" fontWeight={700}>{enriched.total}</tspan>
                      <tspan x="0" dy="1.2em" fontSize="11" fill="#64748B">
                        réservations
                      </tspan>
                    </text>
                  )}
                />
              </Pie>

              <Tooltip
                formatter={(value: number, name: string, props: any) => {
                  const pct = props?.payload?.pct ?? 0;
                  return [`${value} (${pct}%)`, name];
                }}
                contentStyle={{
                  backgroundColor: "#fff",
                  border: `1px solid ${theme.colors.secondary}`,
                  borderRadius: "0.5rem",
                  color: theme.colors.primary,
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)"
                }}
              />

              <Legend
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ paddingTop: 8, color: theme.colors.text }}
                formatter={(value: string, entry: any) => {
                  const v = entry?.payload?.value ?? 0;
                  const p = entry?.payload?.pct ?? 0;
                  return `${value} — ${v} (${p}%)`;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
