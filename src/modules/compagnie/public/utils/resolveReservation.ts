/**
 * Reservation resolution via publicReservations collection.
 * Accès uniquement par get(doc id) : doc id = token (snapshot complet) ou reservationId (redirige vers token).
 * Pas de list pour éviter l'énumération.
 */
import { doc, getDoc, type DocumentReference } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

export type ResolveResult = {
  ref: DocumentReference;
  companyId: string;
  agencyId: string;
  hardId?: string;
  /** Données pour affichage (depuis publicReservations, pas depuis reservations). */
  snapshot?: Record<string, unknown>;
  /** Token pour souscription temps réel et mises à jour publicReservations. */
  publicToken?: string;
};

const ERR_NOT_FOUND = 'Réservation introuvable ou expirée.';

/**
 * Resolve by reservation id (payment/upload flow).
 * 1) getDoc(publicReservations, reservationId) → { token, companyId, agencyId, slug }
 * 2) getDoc(publicReservations, token) → snapshot complet
 * 3) ref = companies/.../reservations/reservationId
 */
export async function resolveReservationById(slug: string, reservationId: string): Promise<ResolveResult> {
  const byIdRef = doc(db, 'publicReservations', reservationId);
  const byIdSnap = await getDoc(byIdRef);
  if (!byIdSnap.exists()) throw new Error(ERR_NOT_FOUND);

  const byId = byIdSnap.data();
  const token = (byId?.token ?? byId?.publicToken) as string | undefined;
  const companyId = byId?.companyId;
  const agencyId = byId?.agencyId;
  const docSlug = byId?.slug;

  if (!companyId || !agencyId) throw new Error(ERR_NOT_FOUND);
  if (docSlug && docSlug !== slug) throw new Error(ERR_NOT_FOUND);

  if (!token) {
    const ref = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);
    return { ref, companyId, agencyId, hardId: reservationId };
  }

  const tokenRef = doc(db, 'publicReservations', token);
  const tokenSnap = await getDoc(tokenRef);
  if (!tokenSnap.exists()) throw new Error(ERR_NOT_FOUND);
  const snapshot = tokenSnap.data() as Record<string, unknown>;
  if (snapshot?.slug && snapshot.slug !== slug) throw new Error(ERR_NOT_FOUND);

  const ref = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);
  return { ref, companyId, agencyId, hardId: reservationId, snapshot, publicToken: token };
}

/**
 * Resolve by publicToken (mon-billet?r=TOKEN). getDoc(publicReservations, token) uniquement (pas de query/list).
 */
export async function resolveReservationByToken(slug: string, token: string): Promise<ResolveResult & { hardId: string }> {
  const tokenRef = doc(db, 'publicReservations', token);
  const tokenSnap = await getDoc(tokenRef);
  if (!tokenSnap.exists()) throw new Error(ERR_NOT_FOUND);

  const data = tokenSnap.data() as Record<string, unknown>;
  const reservationId = data?.reservationId as string | undefined;
  const companyId = data?.companyId as string | undefined;
  const agencyId = data?.agencyId as string | undefined;
  const docSlug = data?.slug as string | undefined;

  if (!companyId || !agencyId || !reservationId) throw new Error(ERR_NOT_FOUND);
  if (docSlug && docSlug !== slug) throw new Error(ERR_NOT_FOUND);

  const ref = doc(db, 'companies', companyId, 'agences', agencyId, 'reservations', reservationId);
  return { ref, companyId, agencyId, hardId: reservationId, snapshot: data, publicToken: token };
}
