// =============================================
// src/components/companyDashboard/StatusBreakdownChart.tsx
// =============================================
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";

export function StatusBreakdownChart({ data, loading }: { data: { name: string; value: number }[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-60 w-full rounded-2xl" />;
  return (
    <div className="h-60">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip />
          <Bar dataKey="value" name="Nombre" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}