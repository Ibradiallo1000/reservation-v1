import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/hooks/useCompanyTheme";

interface DestinationStat {
  name: string;
  count: number;
}

export const DestinationsChart = ({
  destinations,
  isLoading
}: {
  destinations: DestinationStat[];
  isLoading: boolean;
}) => {
  const { company } = useAuth();
  const theme = useCompanyTheme(company);

  if (isLoading) {
    return <Skeleton className="w-full h-48 rounded-lg" />;
  }

  return (
    <Card className="shadow-md border border-gray-200 bg-white">
      <CardHeader>
        <CardTitle style={{ color: theme.colors.primary }}>
          Top villes de départ
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {destinations.map((destination, index) => (
            <div
              key={destination.name}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:shadow transition"
            >
              <div className="flex items-center space-x-3">
                <span
                  className="font-semibold text-sm"
                  style={{ color: theme.colors.primary || "#1f2937" }}
                >
                  {index + 1}. {destination.name}
                </span>
              </div>
              <Badge
                className="px-3 py-1 text-xs font-semibold rounded-md shadow-sm"
                style={{
                  backgroundColor: theme.colors.secondary,
                  color: "#fff"
                }}
              >
                {destination.count} réservation{destination.count > 1 ? "s" : ""}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
