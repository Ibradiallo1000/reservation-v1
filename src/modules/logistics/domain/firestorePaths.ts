/**
 * Teliya Logistics Engine — Firestore structure (definition only).
 * All collections under: companies/{companyId}/logistics/data/
 * (Firestore: collection paths need odd segments; doc paths need even. So we use a placeholder doc "data" under logistics.)
 *
 * - logistics/data/shipments
 * - logistics/data/batches
 * - logistics/data/events
 * - logistics/data/sessions
 * - logistics/data/ledger
 * - logistics/openSessions/byAgent/{agentId}
 */

import { collection, doc } from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

const LOGISTICS_SEGMENT = "logistics";
const LOGISTICS_DATA_DOC = "data";

export function logisticsRootRef(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, LOGISTICS_SEGMENT);
}

export function shipmentsRef(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "shipments");
}

export function shipmentRef(db: Firestore, companyId: string, shipmentId: string) {
  return doc(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "shipments", shipmentId);
}

export function batchesRef(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "batches");
}

export function batchRef(db: Firestore, companyId: string, batchId: string) {
  return doc(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "batches", batchId);
}

export function eventsRef(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "events");
}

export function sessionsRef(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "sessions");
}

export function ledgerRef(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "ledger");
}

/** Session document ref for logistics financial sessions */
export function getLogisticsSessionRef(db: Firestore, companyId: string, sessionId: string) {
  return doc(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "sessions", sessionId);
}

/** Ledger collection ref for logistics financial ledger entries */
export function getLogisticsLedgerCollection(db: Firestore, companyId: string) {
  return collection(db, "companies", companyId, LOGISTICS_SEGMENT, LOGISTICS_DATA_DOC, "ledger");
}

/** Internal: one open session per agent (guard for openLogisticsSession). Path must have even segments: .../logistics/openSessions/byAgent/agentId */
export function agentOpenSessionRef(db: Firestore, companyId: string, agentId: string) {
  return doc(db, "companies", companyId, LOGISTICS_SEGMENT, "openSessions", "byAgent", agentId);
}

/** Phase 3: Courier batches per origin agency. companies/{companyId}/agences/{agencyId}/batches */
export function agencyBatchesRef(db: Firestore, companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, "batches");
}

export function agencyBatchRef(db: Firestore, companyId: string, agencyId: string, batchId: string) {
  return doc(db, "companies", companyId, "agences", agencyId, "batches", batchId);
}
