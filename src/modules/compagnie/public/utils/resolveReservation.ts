/**
 * Reservation resolution via publicReservations collection.
 * No collectionGroup or documentId() — single collection lookup by id or token.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
  type DocumentReference,
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export type ResolveResult = {
  ref: DocumentReference;
  companyId: string;
  agencyId: string;
  hardId?: string;
};

const ERR_NOT_FOUND = 'Réservation introuvable ou expirée.';

/**
 * Resolve by reservation id (document id in publicReservations).
 * 1) Read publicReservations/{reservationId}
 * 2) Build ref: companies/{companyId}/agences/{agencyId}/reservations/{reservationId}
 */
export async function resolveReservationById(slug: string, reservationId: string): Promise<ResolveResult> {
  const pubRef = doc(db, 'publicReservations', reservationId);
  const pubSnap = await getDoc(pubRef);
  if (!pubSnap.exists()) throw new Error(ERR_NOT_FOUND);

  const data = pubSnap.data();
  const companyId = data?.companyId;
  const agencyId = data?.agencyId;
  const docSlug = data?.slug;

  if (!companyId || !agencyId) throw new Error(ERR_NOT_FOUND);
  if (docSlug && docSlug !== slug) throw new Error(ERR_NOT_FOUND);

  const ref = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);
  return { ref, companyId, agencyId };
}

/**
 * Resolve by slug + publicToken (e.g. mon-billet?r=TOKEN).
 * 1) Query publicReservations where slug == slug and publicToken == token
 * 2) Get reservationId, companyId, agencyId from the doc
 * 3) Build ref to the real reservation document
 */
export async function resolveReservationByToken(slug: string, token: string): Promise<ResolveResult & { hardId: string }> {
  const q = query(
    collection(db, 'publicReservations'),
    where('slug', '==', slug),
    where('publicToken', '==', token),
    limit(1)
  );
  const snap = await getDocs(q);
  if (snap.empty) throw new Error(ERR_NOT_FOUND);

  const d = snap.docs[0];
  const data = d.data();
  const reservationId = data?.reservationId ?? d.id;
  const companyId = data?.companyId;
  const agencyId = data?.agencyId;

  if (!companyId || !agencyId) throw new Error(ERR_NOT_FOUND);

  const ref = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);
  return { ref, companyId, agencyId, hardId: reservationId };
}
