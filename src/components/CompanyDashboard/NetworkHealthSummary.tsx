// =============================================
// src/components/CompanyDashboard/NetworkHealthSummary.tsx
// =============================================
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, TrendingUp, TrendingDown, Minus } from "lucide-react";

// ✅ Type simplifié qui correspond aux données réelles
type NetworkHealthSummaryProps = {
  totalAgencies: number;
  healthyAgencies: number;
  atRiskAgencies: number;
  trend: "up" | "down" | "stable";
};

export const NetworkHealthSummary: React.FC<NetworkHealthSummaryProps> = ({
  totalAgencies,
  healthyAgencies,
  atRiskAgencies,
  trend,
}) => {
  const trendConfig = {
    up: {
      label: "Tendance positive",
      icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
      color: "text-emerald-700",
    },
    down: {
      label: "Tendance négative",
      icon: <TrendingDown className="h-4 w-4 text-red-600" />,
      color: "text-red-700",
    },
    stable: {
      label: "Tendance stable",
      icon: <Minus className="h-4 w-4 text-gray-500" />,
      color: "text-gray-700",
    },
  }[trend];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Santé du réseau</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex items-center gap-3">
            <Building2 className="h-5 w-5 text-gray-600" />
            <div>
              <div className="text-sm text-gray-500">Agences actives</div>
              <div className="text-lg font-semibold">{totalAgencies}</div>
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">Agences performantes</div>
            <div className="text-lg font-semibold text-emerald-700">
              {healthyAgencies}
            </div>
          </div>

          <div>
            <div className="text-sm text-gray-500">Agences à risque</div>
            <div className="text-lg font-semibold text-red-700">
              {atRiskAgencies}
            </div>
          </div>
        </div>

        <div className={`mt-4 flex items-center gap-2 text-sm ${trendConfig.color}`}>
          {trendConfig.icon}
          <span>{trendConfig.label}</span>
        </div>
      </CardContent>
    </Card>
  );
};