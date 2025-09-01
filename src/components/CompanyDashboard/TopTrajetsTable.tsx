// =============================================
// src/components/companyDashboard/TopTrajetsTable.tsx
// =============================================
import React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function TopTrajetsTable({ rows, loading }: { rows: { trajet: string; reservations: number; revenus: number }[]; loading: boolean }) {
  if (loading) return <Skeleton className="h-64 w-full rounded-2xl" />;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 text-left">Trajet</th>
            <th className="py-2 text-right">Réservations</th>
            <th className="py-2 text-right">CA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-none">
              <td className="py-2">{r.trajet}</td>
              <td className="py-2 text-right">{r.reservations}</td>
              <td className="py-2 text-right">{new Intl.NumberFormat("fr-FR", { style: "currency", currency: "XOF", maximumFractionDigits: 0 }).format(r.revenus)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
