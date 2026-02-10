// =============================================
// src/components/CompanyDashboard/CriticalAlertsPanel.tsx
// =============================================
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle } from "lucide-react";

// ✅ Type plus flexible pour les alertes
export interface CriticalAlert {
  id?: string;
  title: string;
  description?: string;
  type?: string;
  severity?: string;
  level?: "high" | "medium" | "low";
  date?: string;
}

export interface CriticalAlertsPanelProps {
  alerts?: CriticalAlert[];
  loading?: boolean;
}

export const CriticalAlertsPanel: React.FC<CriticalAlertsPanelProps> = ({ 
  alerts = [], 
  loading = false 
}) => {
  // Fonction pour déterminer si une alerte est critique
  const isCriticalAlert = (alert: CriticalAlert): boolean => {
    // Critères pour les alertes critiques
    const criticalKeywords = [
      "ca", "chiffre", "revenu", "financier", "argent", "perte",
      "bloc", "arrêt", "panne", "interruption", "système",
      "critique", "urgence", "important", "grave", "anomalie",
      "sécurité", "violation", "erreur"
    ];

    const title = alert.title?.toLowerCase() || "";
    const description = alert.description?.toLowerCase() || "";
    const type = alert.type?.toLowerCase() || "";
    
    return criticalKeywords.some(keyword => 
      title.includes(keyword) || 
      description.includes(keyword) ||
      type.includes(keyword) ||
      alert.level === "high" ||
      alert.severity === "high"
    );
  };

  const criticalAlerts = alerts.filter(isCriticalAlert);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alertes critiques</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Chargement des alertes...</div>
        </CardContent>
      </Card>
    );
  }

  if (criticalAlerts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Alertes critiques</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">
            ✅ Aucune alerte critique détectée.
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Alertes critiques nécessitant décision</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {criticalAlerts.map((alert, index) => (
          <div
            key={alert.id || `alert-${index}`}
            className="flex items-start gap-3 p-3 rounded-lg border border-red-200 bg-red-50"
          >
            <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <div className="font-medium text-red-700">
                {alert.title}
              </div>
              {alert.description && (
                <div className="text-sm text-red-600 mt-1">
                  {alert.description}
                </div>
              )}
              {alert.date && (
                <div className="text-xs text-red-400 mt-1">
                  {alert.date}
                </div>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};