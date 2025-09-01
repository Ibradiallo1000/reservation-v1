// =============================================
// src/components/companyDashboard/UnderperformingAgenciesTable.tsx
// =============================================
import React, { useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgencyPerf } from "@/hooks/useCompanyDashboardData";

type Props = {
  data: AgencyPerf[];
  loading: boolean;
};

function formatFCFA(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "XOF",
    maximumFractionDigits: 0,
  }).format(n);
}

export function UnderperformingAgenciesTable({ data, loading }: Props) {
  // Loader
  if (loading) return <Skeleton className="h-48 w-full rounded-2xl" />;

  // Aucune agence créée
  if (!data || data.length === 0) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-4">
        Aucune agence trouvée.
      </div>
    );
  }

  // Totaux pour calculer la part de CA
  const totalCA = useMemo(
    () => data.reduce((s, a) => s + (a.revenus || 0), 0),
    [data]
  );

  // 5 moins performantes (CA puis réservations)
  const bottom = useMemo(() => {
    const sorted = [...data].sort((a, b) => {
      if ((a.revenus || 0) !== (b.revenus || 0)) {
        return (a.revenus || 0) - (b.revenus || 0); // CA croissant
      }
      return (a.reservations || 0) - (b.reservations || 0); // puis réservations
    });
    return sorted.slice(0, 5);
  }, [data]);

  // Rien à signaler (tout le monde à 0)
  const allZero = bottom.every((a) => (a.revenus || 0) === 0 && (a.reservations || 0) === 0);
  if (allZero) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/30 rounded-xl p-4">
        Aucune agence à signaler sur la période.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th scope="col" className="py-2 pr-2 text-left font-medium">Agence</th>
            <th scope="col" className="py-2 pr-2 text-left font-medium">Ville</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">Réservations</th>
            <th scope="col" className="py-2 pr-2 text-right font-medium">CA</th>
            <th scope="col" className="py-2 pl-2 text-right font-medium">Part</th>
          </tr>
        </thead>
        <tbody>
          {bottom.map((a) => {
            const ca = a.revenus || 0;
            const part = totalCA > 0 ? Math.round((ca / totalCA) * 100) : 0;
            const weak = ca === 0 || a.reservations === 0;

            return (
              <tr
                key={a.id}
                className={`border-b last:border-none hover:bg-muted/30 transition-colors ${
                  weak ? "bg-amber-50/40" : ""
                }`}
              >
                <td className="py-2 pr-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.nom}</span>
                    {weak && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
                        À surveiller
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-2 pr-2">{a.ville || "—"}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{a.reservations}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatFCFA(ca)}</td>
                <td className="py-2 pl-2 text-right">
                  <span className="inline-flex items-center justify-end min-w-[3rem] px-2 py-0.5 rounded bg-muted text-foreground/80">
                    {part}%
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Petite légende */}
      <p className="mt-2 text-xs text-muted-foreground">
        Trié par chiffre d’affaires croissant (puis réservations). “À surveiller” = CA ou réservations nuls.
      </p>
    </div>
  );
}
