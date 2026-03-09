/**
 * CRM Customer — Firestore document type.
 * Path: companies/{companyId}/customers/{customerId}
 * customerId = normalized phone (e.g. 8 digits) for stable find-by-phone.
 */

export interface CustomerDoc {
  name: string;
  phone: string;
  email?: string | null;
  createdAt: import("firebase/firestore").Timestamp;
  totalTrips: number;
  totalSpent: number;
  lastTripDate: string | null; // YYYY-MM-DD
}

export type CustomerDocWithId = CustomerDoc & { id: string };
