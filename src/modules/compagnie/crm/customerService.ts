/**
 * CRM Customer service.
 * companies/{companyId}/customers/{customerId}
 * customerId = normalized phone (8 digits) for find-by-phone.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  increment,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { normalizePhone } from "@/utils/phoneUtils";
import type { CustomerDoc, CustomerDocWithId } from "./customerTypes";

const CUSTOMERS_COLLECTION = "customers";

function customersRef(companyId: string) {
  return collection(db, `companies/${companyId}/${CUSTOMERS_COLLECTION}`);
}

function customerRef(companyId: string, customerId: string) {
  return doc(db, `companies/${companyId}/${CUSTOMERS_COLLECTION}/${customerId}`);
}

/**
 * Params to upsert a customer from a reservation (create or update stats).
 */
export interface UpsertCustomerFromReservationParams {
  companyId: string;
  name: string;
  phone: string;
  email?: string | null;
  montant: number;
  departureDate: string; // YYYY-MM-DD (reservation date)
}

/**
 * Find or create customer by phone, then add one trip: totalTrips += 1, totalSpent += montant, lastTripDate = departureDate.
 * Uses normalized phone as document id. If phone normalizes to empty, no-op (no breaking change).
 */
export async function upsertCustomerFromReservation(
  params: UpsertCustomerFromReservationParams
): Promise<string | null> {
  const phoneNorm = normalizePhone(params.phone || "");
  if (!phoneNorm) return null;

  const customerId = phoneNorm;
  const ref = customerRef(params.companyId, customerId);
  const snap = await getDoc(ref);

  const tripDate = params.departureDate || "";

  if (snap.exists()) {
    await updateDoc(ref, {
      name: params.name || snap.data()?.name || "",
      ...(params.email !== undefined && { email: params.email ?? null }),
      totalTrips: increment(1),
      totalSpent: increment(params.montant ?? 0),
      lastTripDate: tripDate || null,
      updatedAt: serverTimestamp(),
    });
    return customerId;
  }

  const now = Timestamp.now();
  const data: CustomerDoc = {
    name: params.name || "",
    phone: params.phone || "",
    email: params.email ?? null,
    createdAt: now,
    totalTrips: 1,
    totalSpent: params.montant ?? 0,
    lastTripDate: tripDate || null,
  };
  await setDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
  return customerId;
}

/**
 * Get customer by id (normalized phone).
 */
export async function getCustomer(
  companyId: string,
  customerId: string
): Promise<CustomerDocWithId | null> {
  const snap = await getDoc(customerRef(companyId, customerId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as CustomerDoc) };
}

/**
 * List customers for a company with optional search (phone or name, case-insensitive).
 */
export async function listCustomers(
  companyId: string,
  options?: { search?: string; limitCount?: number }
): Promise<CustomerDocWithId[]> {
  const col = customersRef(companyId);
  const q = query(
    col,
    orderBy("lastTripDate", "desc"),
    limit(options?.limitCount ?? 500)
  );
  const snap = await getDocs(q);
  let list: CustomerDocWithId[] = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as CustomerDoc),
  }));

  const search = (options?.search || "").trim().toLowerCase();
  if (search) {
    const searchDigits = search.replace(/\D/g, "");
    list = list.filter((c) => {
      const nameMatch = (c.name || "").toLowerCase().includes(search);
      const phoneMatch =
        (c.phone || "").replace(/\D/g, "").includes(searchDigits) ||
        (c.phone || "").toLowerCase().includes(search);
      return nameMatch || phoneMatch;
    });
  }

  return list;
}

/**
 * Search customer by phone (normalized). Returns customer id if found.
 */
export async function findCustomerIdByPhone(
  companyId: string,
  phone: string
): Promise<string | null> {
  const phoneNorm = normalizePhone(phone || "");
  if (!phoneNorm) return null;
  const ref = customerRef(companyId, phoneNorm);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.id : null;
}

/** Minimal reservation row for customer history (from Firestore). */
export interface CustomerReservationRow {
  id: string;
  agencyId: string;
  date?: string;
  heure?: string;
  depart?: string;
  arrivee?: string;
  montant?: number;
  statut?: string;
  canal?: string;
  referenceCode?: string;
  createdAt?: Timestamp;
}

/**
 * List reservations for a customer (by normalized phone).
 * Queries each agency's reservations where telephoneNormalized == customerId (no collection group index needed).
 */
export async function listReservationsForCustomer(
  companyId: string,
  customerId: string,
  agencyIds: string[]
): Promise<CustomerReservationRow[]> {
  const rows: CustomerReservationRow[] = [];
  for (const agencyId of agencyIds) {
    const col = collection(
      db,
      `companies/${companyId}/agences/${agencyId}/reservations`
    );
    const q = query(col, where("telephoneNormalized", "==", customerId));
    const snap = await getDocs(q);
    snap.docs.forEach((d) => {
      const data = d.data() as Record<string, unknown>;
      rows.push({
        id: d.id,
        agencyId,
        date: (data.date as string) ?? undefined,
        heure: (data.heure as string) ?? undefined,
        depart: (data.depart as string) ?? undefined,
        arrivee: (data.arrivee as string) ?? undefined,
        montant: typeof data.montant === "number" ? data.montant : undefined,
        statut: (data.statut as string) ?? undefined,
        canal: (data.canal as string) ?? undefined,
        referenceCode: (data.referenceCode as string) ?? undefined,
        createdAt: data.createdAt as Timestamp | undefined,
      });
    });
  }
  // Sort by createdAt desc (agency order may not be chronological)
  rows.sort((a, b) => {
    const ta = a.createdAt?.toMillis?.() ?? 0;
    const tb = b.createdAt?.toMillis?.() ?? 0;
    return tb - ta;
  });
  return rows;
}
