import React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

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
  if (isLoading) {
    return <Skeleton className="w-full h-48 rounded-lg" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top villes de départ</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {destinations.map((destination, index) => (
            <div key={destination.name} className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <span className="font-medium text-sm">{index + 1}. {destination.name}</span>
              </div>
              <Badge variant="outline">{destination.count} réservations</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
