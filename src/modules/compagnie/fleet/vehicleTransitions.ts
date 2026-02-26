// Phase 1 — Transitions contrôlées : technicalStatus et operationalStatus.

import type { Timestamp } from "firebase/firestore";

export const TECHNICAL_STATUS = {
  NORMAL: "NORMAL",
  MAINTENANCE: "MAINTENANCE",
  ACCIDENTE: "ACCIDENTE",
  HORS_SERVICE: "HORS_SERVICE",
} as const;

export type TechnicalStatus = (typeof TECHNICAL_STATUS)[keyof typeof TECHNICAL_STATUS];

export const OPERATIONAL_STATUS = {
  GARAGE: "GARAGE",
  AFFECTE: "AFFECTE",
  EN_TRANSIT: "EN_TRANSIT",
} as const;

export type OperationalStatus = (typeof OPERATIONAL_STATUS)[keyof typeof OPERATIONAL_STATUS];

/** Allowed technicalStatus transitions. */
export const TECHNICAL_STATUS_TRANSITIONS: Record<TechnicalStatus, readonly TechnicalStatus[]> = {
  NORMAL: ["MAINTENANCE", "ACCIDENTE"],
  MAINTENANCE: ["NORMAL"],
  ACCIDENTE: ["MAINTENANCE"],
  HORS_SERVICE: ["NORMAL"],
};

/** Allowed operationalStatus transitions. GARAGE → AFFECTE (assignment) or EN_TRANSIT; AFFECTE → EN_TRANSIT (confirm departure); EN_TRANSIT → GARAGE (confirm arrival). */
export const OPERATIONAL_STATUS_TRANSITIONS: Record<OperationalStatus, readonly OperationalStatus[]> = {
  GARAGE: ["AFFECTE", "EN_TRANSIT"],
  AFFECTE: ["EN_TRANSIT"],
  EN_TRANSIT: ["GARAGE"],
};

export function canChangeTechnicalStatus(from: TechnicalStatus, to: TechnicalStatus): boolean {
  return (TECHNICAL_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

export function canChangeOperationalStatus(from: OperationalStatus, to: OperationalStatus): boolean {
  return (OPERATIONAL_STATUS_TRANSITIONS[from] as readonly string[]).includes(to);
}

export interface StatusHistoryEntry {
  field: "technicalStatus" | "operationalStatus" | "archived";
  from: string | boolean;
  to: string | boolean;
  changedBy: string;
  role: string;
  timestamp: Timestamp;
}
