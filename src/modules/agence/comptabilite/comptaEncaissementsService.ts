/**
 * Écritures comptables agence : une ligne `encaissement` par validation de session (guichet / courrier).
 * Les tableaux de bord comptables « Entrées espèces » s’appuient sur cette collection (pas sur le ledger seul).
 */

import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Transaction,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export const COMPTA_ENCAISSEMENTS_COLLECTION = "comptaEncaissements";

const PAGE_SIZE = 500;
const MAX_PAGES = 40;

export type ComptaEncaissementSource = "guichet" | "courrier";

export type ComptaEncaissementDoc = {
  type: "encaissement";
  montant: number;
  source: ComptaEncaissementSource;
  sessionId: string;
  agencyId: string;
  companyId: string;
  createdAt: unknown;
};

export function comptaEncaissementsCollectionRef(companyId: string, agencyId: string) {
  return collection(db, "companies", companyId, "agences", agencyId, COMPTA_ENCAISSEMENTS_COLLECTION);
}

function entryDocId(source: ComptaEncaissementSource, sessionId: string): string {
  return source === "guichet" ? `shift_${sessionId}` : `courier_${sessionId}`;
}

/** Référence doc `comptaEncaissements/courier_{sessionId}` (lecture / suppression en transaction). */
export function courierComptaEncaissementDocRef(companyId: string, agencyId: string, sessionId: string) {
  return doc(
    db,
    "companies",
    companyId,
    "agences",
    agencyId,
    COMPTA_ENCAISSEMENTS_COLLECTION,
    entryDocId("courrier", sessionId)
  );
}

/**
 * Idempotent par session : même id de document si la transaction métier est rejouée.
 * À appeler dans la même transaction Firestore que la remise ledger (après les lectures).
 */
export function writeComptaEncaissementInTransaction(
  tx: Transaction,
  companyId: string,
  agencyId: string,
  params: {
    sessionId: string;
    montant: number;
    source: ComptaEncaissementSource;
  }
): void {
  const montant = Number(params.montant);
  if (!Number.isFinite(montant) || montant <= 0) return;

  const id = entryDocId(params.source, params.sessionId);
  const ref = doc(db, "companies", companyId, "agences", agencyId, COMPTA_ENCAISSEMENTS_COLLECTION, id);
  const payload: Record<string, unknown> = {
    type: "encaissement",
    montant,
    source: params.source,
    sessionId: params.sessionId,
    agencyId,
    companyId,
    createdAt: serverTimestamp(),
  };
  tx.set(ref, payload);
}

export async function sumComptaEncaissementsInRange(
  companyId: string,
  agencyId: string,
  rangeFrom: Date,
  rangeToExclusive: Date
): Promise<{ total: number; count: number; capped: boolean }> {
  const ref = comptaEncaissementsCollectionRef(companyId, agencyId);
  const startTs = Timestamp.fromDate(rangeFrom);
  const endTs = Timestamp.fromDate(rangeToExclusive);

  let total = 0;
  let count = 0;
  let capped = false;
  let last: QueryDocumentSnapshot<DocumentData> | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const q = query(
      ref,
      where("createdAt", ">=", startTs),
      where("createdAt", "<", endTs),
      orderBy("createdAt", "asc"),
      limit(PAGE_SIZE),
      ...(last ? [startAfter(last)] : [])
    );
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() as Record<string, unknown>;
      if (String(x.type ?? "") !== "encaissement") continue;
      const m = Number(x.montant ?? 0);
      if (Number.isFinite(m) && m > 0) total += m;
      count += 1;
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) capped = true;
  }

  return { total, count, capped };
}

/** Somme tous les encaissements comptables (pagination). Si vide → total 0. */
export async function sumComptaEncaissementsAllTime(
  companyId: string,
  agencyId: string
): Promise<{ total: number; count: number; capped: boolean }> {
  const ref = comptaEncaissementsCollectionRef(companyId, agencyId);
  let total = 0;
  let count = 0;
  let capped = false;
  let last: QueryDocumentSnapshot<DocumentData> | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const q = query(ref, orderBy("createdAt", "desc"), limit(PAGE_SIZE), ...(last ? [startAfter(last)] : []));
    const snap = await getDocs(q);
    if (snap.empty) break;
    for (const d of snap.docs) {
      const x = d.data() as Record<string, unknown>;
      if (String(x.type ?? "") !== "encaissement") continue;
      const m = Number(x.montant ?? 0);
      if (Number.isFinite(m) && m > 0) total += m;
      count += 1;
    }
    last = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < PAGE_SIZE) break;
    if (page === MAX_PAGES - 1) capped = true;
  }

  return { total, count, capped };
}

export type ComptaEncaissementRow = ComptaEncaissementDoc & { id: string };

export async function listComptaEncaissementsInRange(
  companyId: string,
  agencyId: string,
  rangeFrom: Date,
  rangeToExclusive: Date,
  maxDocs = 500
): Promise<ComptaEncaissementRow[]> {
  const ref = comptaEncaissementsCollectionRef(companyId, agencyId);
  const snap = await getDocs(
    query(
      ref,
      where("createdAt", ">=", Timestamp.fromDate(rangeFrom)),
      where("createdAt", "<", Timestamp.fromDate(rangeToExclusive)),
      orderBy("createdAt", "asc"),
      limit(maxDocs)
    )
  );
  const out: ComptaEncaissementRow[] = [];
  for (const d of snap.docs) {
    const x = d.data() as Record<string, unknown>;
    if (String(x.type ?? "") !== "encaissement") continue;
    out.push({
      id: d.id,
      type: "encaissement",
      montant: Number(x.montant ?? 0),
      source: (x.source === "courrier" ? "courrier" : "guichet") as ComptaEncaissementSource,
      sessionId: String(x.sessionId ?? ""),
      agencyId: String(x.agencyId ?? agencyId),
      companyId: String(x.companyId ?? companyId),
      createdAt: x.createdAt,
    });
  }
  return out;
}
