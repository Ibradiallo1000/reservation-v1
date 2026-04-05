/**
 * Holds « en ligne » : places comptées pour l’affichage sans décrémenter tripInstance
 * tant que seatHoldOnly + expiresAt valide.
 */

import { collectionGroup, getDocs, limit, query, where, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

function normCity(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Clé stable pour agréger les sièges retenus (instance + segment client). */
export function onlineHoldCompositeKey(
  tripInstanceId: string,
  depart: string,
  arrivee: string
): string {
  return `${String(tripInstanceId).trim()}|${normCity(depart)}|${normCity(arrivee)}`;
}

function holdExpiresAtValid(expiresAt: unknown, nowMs: number): boolean {
  if (expiresAt == null) return false;
  if (typeof expiresAt === "number" && Number.isFinite(expiresAt)) return expiresAt > nowMs;
  if (expiresAt instanceof Timestamp) return expiresAt.toMillis() > nowMs;
  if (typeof (expiresAt as { toMillis?: () => number }).toMillis === "function") {
    return (expiresAt as Timestamp).toMillis() > nowMs;
  }
  const sec = (expiresAt as { seconds?: number })?.seconds;
  if (typeof sec === "number") return sec * 1000 > nowMs;
  return false;
}

/**
 * Somme des seatsGo des réservations en ligne en attente de paiement (hold uniquement),
 * par clé tripInstance|départ|arrivée. Ignoré si expiré ou sans seatHoldOnly.
 *
 * Sur la billetterie publique (non connecté), le collectionGroup `reservations` est refusé
 * par les règles Firestore : on renvoie une map vide — l’affichage des places reste correct
 * côté tripInstance ; seuls les holds ne sont pas soustraits (léger écart jusqu’à expiration).
 */
export async function fetchPendingOnlineHoldSeatsMap(companyId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const nowMs = Date.now();
  const q = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("status", "==", "en_attente"),
    limit(500)
  );
  let snap;
  try {
    snap = await getDocs(q);
  } catch (e: unknown) {
    const err = e as { code?: string; message?: string };
    const denied =
      err?.code === "permission-denied" ||
      String(err?.message ?? "").toLowerCase().includes("permission");
    if (denied) {
      if (import.meta.env?.DEV) {
        console.warn(
          "[onlineReservationHolds] Lecture collectionGroup reservations refusée (souvent visiteur anonyme). Holds non appliqués à l’affichage."
        );
      }
      return map;
    }
    throw e;
  }
  snap.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    if (String(data.canal ?? "").toLowerCase() !== "en_ligne") return;
    if (data.seatHoldOnly !== true) return;
    if (!holdExpiresAtValid(data.expiresAt, nowMs)) return;
    const tid = String(data.tripInstanceId ?? "");
    if (!tid) return;
    const dep = String(data.depart ?? "");
    const arr = String(data.arrivee ?? "");
    const seats = Math.max(0, Number(data.seatsGo) || 0);
    if (seats <= 0) return;
    const key = onlineHoldCompositeKey(tid, dep, arr);
    map.set(key, (map.get(key) || 0) + seats);
  });
  return map;
}
