import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/hooks/useCompanyTheme";

interface TopTrajet {
  id: string;
  name: string;
  count: number;
  revenue: number;
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

  if (isLoading) {
    return <Skeleton className="w-full h-64 rounded-lg" />;
  }

  return (
    <Card className="shadow-md border border-gray-200 bg-white">
      <CardHeader>
        <CardTitle style={{ color: theme.colors.primary }}>Top trajets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {trajets.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:shadow transition"
            >
              <div>
                <p className="font-semibold" style={{ color: theme.colors.primary }}>
                  {t.name}
                </p>
                <p className="text-sm" style={{ color: theme.colors.secondary }}>
                  {t.count} réservation{t.count > 1 ? "s" : ""}
                </p>
              </div>
              <p className="font-bold text-lg" style={{ color: theme.colors.primary }}>
                {t.revenue.toLocaleString()} FCFA
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
