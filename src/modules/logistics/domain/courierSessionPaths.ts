/**
 * Firestore paths for courier sessions (agency-scoped).
 * Collection: companies/{companyId}/agences/{agencyId}/courierSessions
 */

import type { Firestore } from "firebase/firestore";
import { collection, doc } from "firebase/firestore";

const COURIER_SESSIONS_COLLECTION = "courierSessions";

export function courierSessionsRef(db: Firestore, companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, COURIER_SESSIONS_COLLECTION);
}

export function courierSessionRef(db: Firestore, companyId: string, agencyId: string, sessionId: string) {
  return doc(db, "companies", companyId, "agences", agencyId, COURIER_SESSIONS_COLLECTION, sessionId);
}

export { COURIER_SESSIONS_COLLECTION };
