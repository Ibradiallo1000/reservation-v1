import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";

interface DailyStat {
  date: string;
  reservations: number;
  revenue: number;
}

export const RevenueChart = ({
  data,
  isLoading
}: {
  data: DailyStat[];
  isLoading: boolean;
}) => {
  const { company } = useAuth();
  const theme = useCompanyTheme(company);

  if (isLoading) {
    return <Skeleton className="w-full h-64 rounded-lg" />;
  }

  return (
    <Card className="shadow-sm border border-gray-200">
      <CardHeader>
        <CardTitle style={{ color: theme.colors.primary }}>
          Réservations par jour
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data}>
              <XAxis
                dataKey="date"
                tick={{ fill: theme.colors.text }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: theme.colors.text }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: `1px solid ${theme.colors.secondary}`,
                  borderRadius: "0.5rem",
                  color: theme.colors.primary,
                  boxShadow:
                    "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
                }}
                formatter={(value) => [`${value} réservations`, "Nombre"]}
              />
              <Bar
                dataKey="reservations"
                fill={theme.colors.secondary}
                radius={[6, 6, 0, 0]}
                animationDuration={1500}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
