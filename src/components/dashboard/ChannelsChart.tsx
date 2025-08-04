import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/hooks/useCompanyTheme";

interface ChannelStat {
  name: string;
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

  // Palette dynamique
  const COLORS = [
    theme.colors.primary,
    theme.colors.secondary,
    theme.colors.accent,
    theme.colors.tertiary,
    "#9CA3AF", // gris fallback
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
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${(percent * 100).toFixed(0)}%`
                }
                animationDuration={1500}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`${value}`, "réservations"]}
                contentStyle={{
                  backgroundColor: "#fff",
                  border: `1px solid ${theme.colors.secondary}`,
                  borderRadius: "0.5rem",
                  color: theme.colors.primary,
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
                }}
              />
              <Legend
                wrapperStyle={{
                  color: theme.colors.text,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
