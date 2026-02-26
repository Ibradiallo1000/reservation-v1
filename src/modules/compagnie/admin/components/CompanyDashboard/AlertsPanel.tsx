// =============================================
// src/components/companyDashboard/AlertsPanel.tsx
// =============================================
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/ui/card";
import { AlertTriangle, Info } from "lucide-react";
import { AlertItem } from "@/modules/compagnie/hooks/useCompanyDashboardData";

export function AlertsPanel({ alerts }: { alerts: AlertItem[] }) {
  if (!alerts || alerts.length === 0) return (
    <Card>
      <CardHeader><CardTitle>Alertes</CardTitle></CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">Aucune alerte pour la période sélectionnée.</div>
      </CardContent>
    </Card>
  );
  return (
    <Card>
      <CardHeader><CardTitle>Alertes</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((a, i) => (
          <div key={i} className="flex items-start gap-2 text-sm">
            {a.level === "error" ? (
              <AlertTriangle className="h-4 w-4 mt-0.5" />
            ) : (
              <Info className="h-4 w-4 mt-0.5" />
            )}
            <span>{a.message}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
