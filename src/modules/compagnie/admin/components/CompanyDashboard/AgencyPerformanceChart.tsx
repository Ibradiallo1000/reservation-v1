// =============================================
// src/components/companyDashboard/AgencyPerformanceChart.tsx
// =============================================
import React from "react";
import { Skeleton } from "@/shared/ui/skeleton";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { AgencyPerf } from "@/modules/compagnie/hooks/useCompanyDashboardData";

export function AgencyPerformanceChart({ data, loading }: { data: AgencyPerf[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-72 w-full rounded-xl" />;
  const top = data.slice(0, 12).map((d) => ({ name: d.nom || d.id, reservations: d.reservations, revenus: d.revenus }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={top}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="name" tickLine={false} axisLine={false} interval={0} angle={-25} textAnchor="end" height={70} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend />
          <Bar dataKey="reservations" name="Réservations" radius={[4,4,0,0]} />
          <Bar dataKey="revenus" name="CA" radius={[4,4,0,0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}