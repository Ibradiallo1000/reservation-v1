// src/core/intelligence/tripCosts.ts
// Data model and Firestore path for companies/{companyId}/tripCosts/{tripCostId}

import type { Timestamp } from "firebase/firestore";

export const TRIP_COSTS_COLLECTION = "tripCosts";

export interface TripCostDoc {
  tripId: string;
  agencyId: string;
  date: string;
  fuelCost: number;
  driverCost: number;
  assistantCost: number;
  tollCost: number;
  maintenanceCost: number;
  otherOperationalCost: number;
  createdAt: Timestamp;
  createdBy: string;
  updatedAt?: Timestamp;
}

export type TripCostDocCreate = Omit<TripCostDoc, "createdAt" | "createdBy"> & {
  createdAt?: Timestamp;
  createdBy?: string;
};

/** Total operational cost from a TripCostDoc (excludes mobile money commission, applied separately). */
export function totalOperationalCost(doc: TripCostDoc): number {
  return (
    (Number(doc.fuelCost) || 0) +
    (Number(doc.driverCost) || 0) +
    (Number(doc.assistantCost) || 0) +
    (Number(doc.tollCost) || 0) +
    (Number(doc.maintenanceCost) || 0) +
    (Number(doc.otherOperationalCost) || 0)
  );
}

/** Map TripCostDoc to TripCostInput shape for profit engine (chauffeur=driver, convoyeur=assistant, operational=toll+maintenance+other). */
export function tripCostDocToInput(
  doc: TripCostDoc,
  mobileMoneyCommission?: number
): {
  fuel: number;
  chauffeur: number;
  convoyeur: number;
  operational: number;
  mobileMoneyCommission?: number;
} {
  const operational =
    (Number(doc.tollCost) || 0) +
    (Number(doc.maintenanceCost) || 0) +
    (Number(doc.otherOperationalCost) || 0);
  return {
    fuel: Number(doc.fuelCost) || 0,
    chauffeur: Number(doc.driverCost) || 0,
    convoyeur: Number(doc.assistantCost) || 0,
    operational,
    ...(mobileMoneyCommission != null && mobileMoneyCommission > 0
      ? { mobileMoneyCommission }
      : {}),
  };
}
