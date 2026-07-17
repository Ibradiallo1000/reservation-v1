import React from "react";
import type { EnvironmentSafetyResult } from "@/config/environmentSafety";

export interface EnvironmentIndicatorProps {
  info: EnvironmentSafetyResult;
}

export function EnvironmentIndicator({ info }: EnvironmentIndicatorProps) {
  if (info.environment === "production") return null;

  const label = info.environment === "staging" ? "STAGING" : "DÉVELOPPEMENT";
  const transport = info.transport === "emulators" ? "émulateurs" : "cloud";

  return (
    <aside
      aria-label="Environnement d’exécution"
      className="environment-indicator"
      data-environment={info.environment}
    >
      <strong>{label}</strong>
      <span aria-hidden="true">·</span>
      <span>{info.projectId}</span>
      <span aria-hidden="true">·</span>
      <span>{transport}</span>
    </aside>
  );
}
