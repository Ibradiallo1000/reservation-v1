import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
  if (isLoading) {
    return <Skeleton className="w-full h-64 rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top trajets</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {trajets.map((t) => (
            <div key={t.id} className="flex items-start justify-between">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-sm text-muted-foreground">
                  {t.count} réservations
                </p>
              </div>
              <p className="font-medium text-emerald-600">
                {t.revenue.toLocaleString()} FCFA
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};