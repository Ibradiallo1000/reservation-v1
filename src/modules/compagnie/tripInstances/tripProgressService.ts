/**
 * Progression d'un bus à travers les escales d'une route.
 * Sous-collection: companies/{companyId}/tripInstances/{tripInstanceId}/progress/{stopOrder}
 * Enregistre arrivée et départ par escale.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getTodayBamako } from "@/shared/date/dateUtilsTz";
import { getTripInstance } from "./tripInstanceService";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import { listTripInstancesByDateRange } from "./tripInstanceService";

const PROGRESS_SUBCOLLECTION = "progress";

function progressRef(companyId: string, tripInstanceId: string) {
  return collection(
    db,
    "companies",
    companyId,
    "tripInstances",
    tripInstanceId,
    PROGRESS_SUBCOLLECTION
  );
}

function progressDocRef(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
) {
  return doc(progressRef(companyId, tripInstanceId), String(stopOrder));
}

export type ProgressStopDoc = {
  stopOrder: number;
  city: string;
  arrivalTime: Timestamp | null;
  departureTime: Timestamp | null;
  confirmedBy: string;
  createdAt: Timestamp;
  updatedAt?: Timestamp;
  /** Retard en minutes (heure réelle - heure prévue). Positif = en retard. */
  delayMinutes?: number | null;
  /** manual = action agent ; auto = créé automatiquement (oubli départ/arrivée). */
  source?: "manual" | "auto";
};

export type ProgressStopDocWithId = ProgressStopDoc & { id: string };

/**
 * Calcule le retard en minutes : heure réelle d'arrivée - heure prévue.
 * Heure prévue = departureTime du tripInstance + estimatedArrivalOffsetMinutes du stop.
 */
export async function computeDelay(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number,
  arrivalTime: Timestamp
): Promise<number | null> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) return null;
  const date = (ti as { date?: string }).date;
  const departureTime = (ti as { departureTime?: string }).departureTime;
  if (!date || !departureTime) return null;
  const routeId = (ti as { routeId?: string | null }).routeId ?? null;
  if (!routeId) return null;
  const stops = await getRouteStops(companyId, routeId);
  const stop = stops.find((s) => s.order === stopOrder);
  if (!stop) return null;
  const offsetMin = stop.estimatedArrivalOffsetMinutes ?? 0;
  const [h, m] = departureTime.trim().split(":").map(Number);
  const expectedDate = new Date(date + "T" + String(h).padStart(2, "0") + ":" + String(m || 0).padStart(2, "0") + ":00");
  if (Number.isNaN(expectedDate.getTime())) return null;
  expectedDate.setMinutes(expectedDate.getMinutes() + offsetMin);
  const realDate = arrivalTime.toDate();
  const delayMs = realDate.getTime() - expectedDate.getTime();
  return Math.round(delayMs / (60 * 1000));
}

/**
 * Vérifie que stopOrder existe sur la route du trip instance.
 * Écrit arrivalTime et confirmedBy. Empêche une double arrivée.
 */
export async function markArrival(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number,
  confirmedBy: string
): Promise<void> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) throw new Error("Trajet introuvable.");
  const routeId = (ti as { routeId?: string | null }).routeId ?? null;
  if (!routeId) throw new Error("Ce trajet n'est pas lié à une route.");

  const stops = await getRouteStops(companyId, routeId);
  const stop = stops.find((s) => s.order === stopOrder);
  if (!stop) throw new Error(`Escale ordre ${stopOrder} introuvable sur la route.`);

  const ref = progressDocRef(companyId, tripInstanceId, stopOrder);
  const snap = await getDoc(ref);
  const now = Timestamp.now();
  const city = (stop.city ?? "").trim() || "—";

const delayMinutes = await computeDelay(companyId, tripInstanceId, stopOrder, now);

  if (snap.exists()) {
    const data = snap.data() as { arrivalTime?: unknown };
    if (data.arrivalTime != null)
      throw new Error("Arrivée déjà enregistrée pour cette escale.");
    await updateDoc(ref, {
      arrivalTime: now,
      confirmedBy,
      city,
      source: "manual",
      ...(delayMinutes != null && { delayMinutes }),
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      stopOrder,
      city,
      arrivalTime: now,
      departureTime: null,
      confirmedBy,
      source: "manual",
      ...(delayMinutes != null && { delayMinutes }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Vérifie que arrivalTime existe. Écrit departureTime. Empêche un départ multiple.
 */
export async function markDeparture(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number,
  confirmedBy: string
): Promise<void> {
  const ref = progressDocRef(companyId, tripInstanceId, stopOrder);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Enregistrez d'abord l'arrivée à l'escale.");
  const data = snap.data() as { arrivalTime?: unknown; departureTime?: unknown };
  if (data.arrivalTime == null) throw new Error("Arrivée non enregistrée.");
  if (data.departureTime != null) throw new Error("Départ déjà enregistré pour cette escale.");

  await updateDoc(ref, {
    departureTime: Timestamp.now(),
    confirmedBy,
    source: "manual",
    updatedAt: serverTimestamp(),
  });
}

/**
 * Récupère la progression du trajet (tous les stops enregistrés), triée par stopOrder.
 */
export async function getTripProgress(
  companyId: string,
  tripInstanceId: string
): Promise<ProgressStopDocWithId[]> {
  const ref = progressRef(companyId, tripInstanceId);
  const snap = await getDocs(ref);
  const list = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      stopOrder: Number(data.stopOrder ?? d.id),
      city: (data.city as string) ?? "",
      arrivalTime: (data.arrivalTime as Timestamp) ?? null,
      departureTime: (data.departureTime as Timestamp) ?? null,
      confirmedBy: (data.confirmedBy as string) ?? "",
      createdAt: (data.createdAt as Timestamp) ?? Timestamp.now(),
      updatedAt: data.updatedAt as Timestamp | undefined,
      delayMinutes: data.delayMinutes != null ? Number(data.delayMinutes) : null,
      source: (data.source as "manual" | "auto") ?? undefined,
    } as ProgressStopDocWithId;
  });
  list.sort((a, b) => a.stopOrder - b.stopOrder);
  return list;
}

/**
 * Nombre de bus en retard aujourd'hui (au moins une escale avec delayMinutes > 0). Date en Africa/Bamako.
 */
export async function getDelayedBusesCountToday(companyId: string): Promise<number> {
  const dateStr = getTodayBamako();
  const instances = await listTripInstancesByDateRange(companyId, dateStr, dateStr, { limitCount: 200 });
  let count = 0;
  for (const ti of instances) {
    const progress = await getTripProgress(companyId, ti.id);
    const hasDelay = progress.some((p) => (p.delayMinutes ?? 0) > 0);
    if (hasDelay) count += 1;
  }
  return count;
}

export const ORIGIN_STOP_ORDER = 1;

/**
 * Enregistre le départ du bus depuis l'agence d'origine (stopOrder = 1).
 * Écrit progress/1 avec departureTime, confirmedBy, delayMinutes = 0.
 * Si confirmedBy est null, source = "auto" (automatisation).
 */
export async function markOriginDeparture(
  companyId: string,
  tripInstanceId: string,
  confirmedBy: string | null
): Promise<void> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) throw new Error("Trajet introuvable.");
  const routeId = (ti as { routeId?: string | null }).routeId ?? null;
  if (!routeId) throw new Error("Ce trajet n'est pas lié à une route.");
  const stops = await getRouteStops(companyId, routeId);
  const firstStop = stops.find((s) => s.order === ORIGIN_STOP_ORDER);
  const city = (firstStop?.city ?? "").trim() || "—";
  const ref = progressDocRef(companyId, tripInstanceId, ORIGIN_STOP_ORDER);
  const snap = await getDoc(ref);
  const now = Timestamp.now();
  const source = confirmedBy ? "manual" : "auto";
  const by = confirmedBy ?? "auto";
  if (snap.exists()) {
    const data = snap.data() as { departureTime?: unknown };
    if (data.departureTime != null) throw new Error("Départ origine déjà enregistré.");
    await updateDoc(ref, {
      departureTime: now,
      confirmedBy: by,
      delayMinutes: 0,
      source,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      stopOrder: ORIGIN_STOP_ORDER,
      city,
      arrivalTime: null,
      departureTime: now,
      confirmedBy: by,
      delayMinutes: 0,
      source,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Garantit qu'une arrivée est enregistrée pour ce stop (création auto si absente).
 * Appelé avant dropoff/boarding à une escale pour éviter incohérence "descente sans arrivée".
 */
export async function ensureProgressArrival(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number,
  confirmedBy?: string
): Promise<void> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) return;
  const routeId = (ti as { routeId?: string | null }).routeId ?? null;
  if (!routeId) return;
  const stops = await getRouteStops(companyId, routeId);
  const stop = stops.find((s) => s.order === stopOrder);
  if (!stop) return;
  const ref = progressDocRef(companyId, tripInstanceId, stopOrder);
  const snap = await getDoc(ref);
  const now = Timestamp.now();
  const city = (stop.city ?? "").trim() || "—";
  if (snap.exists()) {
    const data = snap.data() as { arrivalTime?: unknown };
    if (data.arrivalTime != null) return;
    await updateDoc(ref, {
      arrivalTime: now,
      confirmedBy: confirmedBy ?? "auto",
      city,
      source: "auto",
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(ref, {
      stopOrder,
      city,
      arrivalTime: now,
      departureTime: null,
      confirmedBy: confirmedBy ?? "auto",
      source: "auto",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

/**
 * Si boarding fermé depuis 30 min et pas de départ origine enregistré, crée départ auto.
 * À appeler au chargement des pages (agence/escale) pour corriger les oublis.
 */
export async function ensureAutoDepartIfNeeded(
  companyId: string,
  tripInstanceId: string,
  closedAt: Timestamp
): Promise<boolean> {
  const now = Date.now();
  const closedMs = closedAt.toMillis ? closedAt.toMillis() : (closedAt as any).seconds * 1000;
  if (now - closedMs < 30 * 60 * 1000) return false;
  const list = await getTripProgress(companyId, tripInstanceId);
  const origin = list.find((p) => p.stopOrder === ORIGIN_STOP_ORDER);
  if (origin?.departureTime != null) return false;
  await markOriginDeparture(companyId, tripInstanceId, null);
  return true;
}

/**
 * Pour une escale : si arrivée enregistrée depuis 30 min et pas de départ, crée départ auto.
 */
export async function ensureAutoDepartForStopIfNeeded(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<boolean> {
  const ref = progressDocRef(companyId, tripInstanceId, stopOrder);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;
  const data = snap.data() as { arrivalTime?: Timestamp; departureTime?: unknown };
  if (data.arrivalTime == null || data.departureTime != null) return false;
  const arrivalMs = data.arrivalTime.toMillis ? data.arrivalTime.toMillis() : (data.arrivalTime as any).seconds * 1000;
  if (Date.now() - arrivalMs < 30 * 60 * 1000) return false;
  await updateDoc(ref, {
    departureTime: Timestamp.now(),
    confirmedBy: "auto",
    source: "auto",
    updatedAt: serverTimestamp(),
  });
  return true;
}

/**
 * Récupère le statut de progression pour un stop donné (cette escale).
 * "en_route" | "arrived" | "departed"
 */
export async function getProgressStatusAtStop(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<"en_route" | "arrived" | "departed"> {
  const ref = progressDocRef(companyId, tripInstanceId, stopOrder);
  const snap = await getDoc(ref);
  if (!snap.exists()) return "en_route";
  const data = snap.data() as { arrivalTime?: unknown; departureTime?: unknown };
  if (data.departureTime != null) return "departed";
  if (data.arrivalTime != null) return "arrived";
  return "en_route";
}

/**
 * Dernière escale où le bus a été enregistré (arrivée ou départ).
 * Permet aux escales suivantes d'afficher "Bus arrivé à Segou" (visibilité réseau).
 */
export function getLastProgressFromList(
  progressList: ProgressStopDocWithId[]
): { city: string; stopOrder: number; departed: boolean; delayMinutes?: number | null } | null {
  const withArrival = progressList.filter((p) => p.arrivalTime != null);
  if (withArrival.length === 0) return null;
  withArrival.sort((a, b) => b.stopOrder - a.stopOrder);
  const last = withArrival[0];
  return {
    city: last.city || "—",
    stopOrder: last.stopOrder,
    departed: last.departureTime != null,
    delayMinutes: last.delayMinutes ?? null,
  };
}
