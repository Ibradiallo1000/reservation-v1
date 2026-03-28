/**
 * Pointeur local uniquement : la validation métier se fait toujours sur Firestore
 * (companies/{companyId}/agences/{agencyId}/reservations/{reservationId}).
 */
import {
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  type Firestore,
} from "firebase/firestore";

const STORAGE_KEY = "pendingReservation";

export const RESERVATION_DURATION_MS = 6 * 60 * 60 * 1000;

export type ReservationLifecycleStatus = "en_attente" | "payé" | "annulé";

function expiresAtToMs(expiresAt: unknown): number | null {
  if (expiresAt == null) return null;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) return expiresAt;
  if (expiresAt instanceof Timestamp) return expiresAt.toMillis();
  if (typeof expiresAt === "object" && typeof (expiresAt as Timestamp).toMillis === "function") {
    return (expiresAt as Timestamp).toMillis();
  }
  return null;
}

/** Parse le pointeur local (sans validation métier). */
export function readPendingReservationPointer(): {
  reservationId: string;
  companyId: string;
  agencyId: string;
} | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const reservationId =
      typeof parsed.reservationId === "string"
        ? parsed.reservationId
        : typeof parsed.id === "string"
          ? parsed.id
          : null;
    const companyId = typeof parsed.companyId === "string" ? parsed.companyId : null;
    const agencyId = typeof parsed.agencyId === "string" ? parsed.agencyId : null;
    if (!reservationId || !companyId || !agencyId) return null;
    return { reservationId, companyId, agencyId };
  } catch {
    return null;
  }
}

export function savePendingReservation(data: { id: string; companyId: string; agencyId: string }): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        reservationId: data.id,
        companyId: data.companyId,
        agencyId: data.agencyId,
      })
    );
  } catch {
    /* quota / private */
  }
}

export function clearPendingReservation(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function reservationNestedRef(
  db: Firestore,
  companyId: string,
  agencyId: string,
  reservationId: string
) {
  return doc(db, "companies", companyId, "agences", agencyId, "reservations", reservationId);
}

export async function getPendingReservation(
  db: Firestore
): Promise<(Record<string, unknown> & { id: string }) | null> {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    if (!raw) return null;

    const { reservationId, companyId, agencyId } = JSON.parse(raw) as {
      reservationId?: string;
      companyId?: string;
      agencyId?: string;
    };

    if (!reservationId || !companyId || !agencyId) {
      clearPendingReservation();
      return null;
    }

    const ref = reservationNestedRef(db, companyId, agencyId, reservationId);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      clearPendingReservation();
      return null;
    }

    const reservation = snap.data() as Record<string, unknown>;

    if (reservation.status !== "en_attente") {
      clearPendingReservation();
      return null;
    }

    const expMs = expiresAtToMs(reservation.expiresAt);
    if (expMs != null && Date.now() > expMs) {
      clearPendingReservation();
      return null;
    }

    return { id: snap.id, ...reservation };
  } catch (e) {
    console.error("Erreur getPendingReservation:", e);
    return null;
  }
}

export async function fetchReservationFromNestedPath(
  db: Firestore,
  companyId: string,
  agencyId: string,
  reservationId: string
): Promise<(Record<string, unknown> & { id: string }) | null> {
  try {
    const ref = reservationNestedRef(db, companyId, agencyId, reservationId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return { ...(snap.data() as Record<string, unknown>), id: snap.id };
  } catch {
    return null;
  }
}

export function reservationExpiresAtMs(data: Record<string, unknown>): number | null {
  return expiresAtToMs(data.expiresAt);
}

export function pendingReservationIdMatches(
  pending: { reservationId?: string; id?: string } | null,
  reservationId: string
): boolean {
  if (!pending) return false;
  return pending.reservationId === reservationId || pending.id === reservationId;
}

/**
 * Reprise multi-appareil : même numéro normalisé (champ `phone` sur le document).
 * Doit être appelé avec un `companyId` pour limiter la requête (SaaS).
 */
export async function findPendingByPhone(
  db: Firestore,
  companyId: string,
  phone: string
): Promise<(Record<string, unknown> & { id: string }) | null> {
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("phone", "==", phone),
    where("status", "==", "en_attente")
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { ...(d.data() as Record<string, unknown>), id: d.id };
}
