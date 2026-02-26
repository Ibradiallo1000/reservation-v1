/**
 * Teliya Revenue — Firestore paths (minimal).
 * companies/{companyId}/revenue/events/{eventId}
 */

import { collection } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

export function getRevenueEventsCollection(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, "revenue", "events");
}
