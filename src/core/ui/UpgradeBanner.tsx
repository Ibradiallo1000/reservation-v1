// src/core/ui/UpgradeBanner.tsx
// Shown when a feature is gated by plan (e.g. Enterprise). No Firestore.

import React from "react";
import { Sparkles } from "lucide-react";
import type { Plan } from "@/core/subscription/plans";

interface UpgradeBannerProps {
  planRequired: Plan;
  featureName?: string;
  className?: string;
}

const PLAN_LABELS: Record<Plan, string> = {
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

const UpgradeBanner: React.FC<UpgradeBannerProps> = ({
  planRequired,
  featureName,
  className = "",
}) => {
  const planLabel = PLAN_LABELS[planRequired];
  const message = featureName
    ? `Cette fonctionnalité (${featureName}) est disponible sur le plan ${planLabel}. Passez à ${planLabel} pour y accéder.`
    : `Disponible sur le plan ${planLabel}. Passez à ${planLabel} pour débloquer cette section.`;

  return (
    <div
      className={
        "flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 " +
        className
      }
    >
      <Sparkles className="h-8 w-8 shrink-0 text-amber-600" />
      <div className="min-w-0">
        <p className="text-sm font-medium">Fonctionnalité premium</p>
        <p className="text-sm text-amber-800 mt-0.5">{message}</p>
      </div>
    </div>
  );
};

export default UpgradeBanner;
