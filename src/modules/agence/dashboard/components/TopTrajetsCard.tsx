import React, { useMemo } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/shared/ui/card";
import { Skeleton } from "@/shared/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { useFormatCurrency } from "@/shared/currency/CurrencyContext";

interface TopTrajet {
  id: string;     // peut être redondant si la même liaison revient — on ne s'en sert plus pour l'agrégation
  name: string;   // ex: "Bamako → Abidjan"
  count: number;  // nb réservations
  revenue: number;// montant (devise par défaut)
}

export const TopTrajetsCard = ({
  trajets,
  isLoading
}: {
  trajets: TopTrajet[];
  isLoading: boolean;
}) => {
  const { company } = useAuth();
  const theme = useCompanyTheme(company);
  const money = useFormatCurrency();

  const topData = useMemo(() => {
    // 1) Normalisation + dédup (agrégation par nom de trajet)
    const norm = (s: string) =>
      (s || "")
        .toLowerCase()
        .trim()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ");

    const byName = new Map<
      string,
      { name: string; count: number; revenue: number }
    >();

    for (const t of trajets || []) {
      const key = norm(t.name);
      const prev = byName.get(key) ?? { name: t.name, count: 0, revenue: 0 };
      prev.count += Number(t.count) || 0;
      prev.revenue += Number(t.revenue) || 0;
      byName.set(key, prev);
    }

    // 2) tri (count desc, puis revenue desc), 3) top 5
    const rows = [...byName.values()]
      .sort((a, b) => (b.count - a.count) || (b.revenue - a.revenue))
      .slice(0, 5);

    const maxCount = rows[0]?.count ?? 0;
    const totalCount = rows.reduce((s, r) => s + r.count, 0);

    return { rows, maxCount, totalCount };
  }, [trajets]);

  if (isLoading) return <Skeleton className="w-full h-64 rounded-lg" />;

  return (
    <Card className="shadow-md border border-gray-200 bg-white">
      <CardHeader>
        <CardTitle style={{ color: theme.colors.primary }}>Top trajets</CardTitle>
      </CardHeader>
      <CardContent>
        {topData.rows.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun trajet pour cette période.</p>
        ) : (
          <div className="space-y-3">
            {topData.rows.map((t, i) => {
              const share =
                topData.totalCount > 0
                  ? Math.round((t.count / topData.totalCount) * 100)
                  : 0;
              const width =
                topData.maxCount > 0 ? Math.max(6, Math.round((t.count / topData.maxCount) * 100)) : 0;

              return (
                <div
                  key={`${t.name}-${i}`}
                  className="p-3 rounded-lg bg-gray-50 hover:shadow transition"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold"
                        style={{ background: theme.colors.secondary, color: "#fff" }}
                      >
                        {i + 1}
                      </span>
                      <p
                        className="font-semibold truncate"
                        title={t.name}
                        style={{ color: theme.colors.primary }}
                      >
                        {t.name}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm sm:text-base" style={{ color: theme.colors.primary }}>
                        {money(t.revenue)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {t.count} réservation{t.count > 1 ? "s" : ""} • {share}%
                      </p>
                    </div>
                  </div>

                  {/* Barre de progression (comparée au meilleur trajet) */}
                  <div className="mt-2 h-2 w-full rounded-full bg-white border border-gray-200 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${width}%`,
                        background: theme.colors.primary,
                        opacity: 0.2
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
