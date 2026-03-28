/**
 * Résolution par jeton public uniquement (mon-billet?r=TOKEN).
 * Aucune résolution par id via collection publicReservations : le chemin imbriqué
 * exige companyId + agencyId (state ou pointeur local).
 */
import { doc, getDoc, type DocumentReference } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type ResolveResult = {
  ref: DocumentReference;
  companyId: string;
  agencyId: string;
  hardId: string;
  snapshot?: Record<string, unknown>;
  publicToken?: string;
};

const ERR_NOT_FOUND = "Réservation introuvable ou expirée.";

export async function resolveReservationByToken(slug: string, token: string): Promise<ResolveResult> {
  const tokenRef = doc(db, "publicReservations", token);
  const tokenSnap = await getDoc(tokenRef);
  if (!tokenSnap.exists()) throw new Error(ERR_NOT_FOUND);

  const data = tokenSnap.data() as Record<string, unknown>;
  const reservationId = data?.reservationId as string | undefined;
  const companyId = data?.companyId as string | undefined;
  const agencyId = data?.agencyId as string | undefined;
  const docSlug = data?.slug as string | undefined;

  if (!companyId || !agencyId || !reservationId) throw new Error(ERR_NOT_FOUND);
  if (docSlug && docSlug !== slug) throw new Error(ERR_NOT_FOUND);

  const ref = doc(db, "companies", companyId, "agences", agencyId, "reservations", reservationId);
  return { ref, companyId, agencyId, hardId: reservationId, snapshot: data, publicToken: token };
}
