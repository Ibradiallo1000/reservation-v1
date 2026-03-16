/**
 * Quota souple par escale : limite temporaire des ventes depuis les escales,
 * priorité à l'origine, libération automatique avant arrivée.
 */

import { collectionGroup, doc, getDoc, getDocs, query, where, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getTripInstance } from "./tripInstanceService";
import { getRouteStops } from "@/modules/compagnie/routes/routeStopsService";
import { getRemainingSeats } from "./segmentOccupancyService";
import type { TripInstanceInventoryDoc } from "@/types/inventoryQuota";
import { DEFAULT_INVENTORY } from "@/types/inventoryQuota";

const INVENTORY_SUBCOLLECTION = "inventory";
const QUOTA_DOC_ID = "quota";
const CONFIRMED_STATUTS = ["paye", "payé", "confirme", "confirmé", "validé"];

function inventoryQuotaRef(companyId: string, tripInstanceId: string) {
  return doc(
    db,
    "companies",
    companyId,
    "tripInstances",
    tripInstanceId,
    INVENTORY_SUBCOLLECTION,
    QUOTA_DOC_ID
  );
}

/** Écrit les paramètres d'inventaire pour un tripInstance (optionnel, utilisé par la config). */
export async function setInventory(
  companyId: string,
  tripInstanceId: string,
  data: TripInstanceInventoryDoc
): Promise<void> {
  const ref = inventoryQuotaRef(companyId, tripInstanceId);
  await setDoc(ref, {
    originPriority: data.originPriority,
    stopSoftQuotaPercent: data.stopSoftQuotaPercent,
    quotaReleaseHoursBeforeArrival: data.quotaReleaseHoursBeforeArrival,
    updatedAt: serverTimestamp(),
  });
}

/** Charge les paramètres d'inventaire (ou défauts si absents). */
export async function getInventory(
  companyId: string,
  tripInstanceId: string
): Promise<TripInstanceInventoryDoc> {
  const ref = inventoryQuotaRef(companyId, tripInstanceId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ...DEFAULT_INVENTORY };
  const d = snap.data() as Record<string, unknown>;
  return {
    originPriority: typeof d.originPriority === "number" ? d.originPriority : DEFAULT_INVENTORY.originPriority,
    stopSoftQuotaPercent: typeof d.stopSoftQuotaPercent === "number" ? d.stopSoftQuotaPercent : DEFAULT_INVENTORY.stopSoftQuotaPercent,
    quotaReleaseHoursBeforeArrival: typeof d.quotaReleaseHoursBeforeArrival === "number" ? d.quotaReleaseHoursBeforeArrival : DEFAULT_INVENTORY.quotaReleaseHoursBeforeArrival,
    updatedAt: d.updatedAt,
  };
}

/** Heure prévue d'arrivée au stop (date + departureTime + offset en ms). */
function getEstimatedArrivalAtStopMs(
  dateStr: string,
  departureTimeStr: string,
  offsetMinutes: number
): number {
  const [h, m] = (departureTimeStr || "00:00").trim().split(":").map(Number);
  const date = new Date(dateStr + "T" + String(h).padStart(2, "0") + ":" + String(m || 0).padStart(2, "0") + ":00");
  if (Number.isNaN(date.getTime())) return 0;
  date.setMinutes(date.getMinutes() + (offsetMinutes || 0));
  return date.getTime();
}

/**
 * Nombre de places déjà vendues depuis cette escale (originStopOrder == stopOrder).
 * Index Firestore requis : collection group "reservations", companyId (ASC), tripInstanceId (ASC), originStopOrder (ASC).
 */
async function getSoldFromStop(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<number> {
  const qGroup = query(
    collectionGroup(db, "reservations"),
    where("companyId", "==", companyId),
    where("tripInstanceId", "==", tripInstanceId),
    where("originStopOrder", "==", stopOrder)
  );
  const snap = await getDocs(qGroup);
  let total = 0;
  for (const d of snap.docs) {
    const data = d.data() as { statut?: string; seatsGo?: number };
    const statut = (data.statut ?? "").toString().toLowerCase();
    if (!CONFIRMED_STATUTS.includes(statut)) continue;
    total += Number(data.seatsGo ?? 1);
  }
  return total;
}

/**
 * Quota nominal pour une escale (floor(capacity * stopSoftQuotaPercent)).
 * Pour l'origine (stopOrder 1) on retourne la capacité (pas de plafond quota).
 */
export async function getStopQuota(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<number> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) return 0;
  const capacity =
    (ti as { seatCapacity?: number }).seatCapacity ??
    (ti as { capacitySeats?: number }).capacitySeats ??
    0;
  if (capacity <= 0) return 0;
  if (stopOrder === 1) return capacity; // origine = pas de plafond
  const inv = await getInventory(companyId, tripInstanceId);
  const pct = Math.max(0, Math.min(1, inv.stopSoftQuotaPercent));
  return Math.floor(capacity * pct);
}

/**
 * Indique si le quota est libéré (arrivée prévue dans moins de X heures).
 */
export async function releaseStopQuotaIfNeeded(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<boolean> {
  const ti = await getTripInstance(companyId, tripInstanceId);
  if (!ti) return false;
  const routeId = (ti as { routeId?: string | null }).routeId ?? null;
  if (!routeId) return false;
  const inv = await getInventory(companyId, tripInstanceId);
  const hoursBefore = inv.quotaReleaseHoursBeforeArrival ?? 0;
  if (hoursBefore <= 0) return true; // pas de fenêtre = toujours libéré
  const stops = await getRouteStops(companyId, routeId);
  const stop = stops.find((s) => s.order === stopOrder);
  if (!stop) return false;
  const dateStr = (ti as { date?: string }).date ?? "";
  const depTime = (ti as { departureTime?: string }).departureTime ?? "";
  const offsetMin = stop.estimatedArrivalOffsetMinutes ?? 0;
  const arrivalMs = getEstimatedArrivalAtStopMs(dateStr, depTime, offsetMin);
  if (arrivalMs <= 0) return false;
  const nowMs = Date.now();
  const hoursUntilArrival = (arrivalMs - nowMs) / (60 * 60 * 1000);
  return hoursUntilArrival < hoursBefore;
}

/**
 * Nombre de places que l'escale peut encore vendre (min(places restantes réelles, quota escale restant)).
 * Pour l'origine (stopOrder 1) : retourne getRemainingSeats() sans limite quota.
 * Pour une escale : si within quotaReleaseHoursBeforeArrival → getRemainingSeats(); sinon min(remainingSeats, quota - soldFromStop).
 */
export async function getRemainingStopQuota(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<number> {
  const remainingSeats = await getRemainingSeats(companyId, tripInstanceId);
  if (stopOrder === 1) return remainingSeats; // priorité origine = pas de plafond

  const released = await releaseStopQuotaIfNeeded(companyId, tripInstanceId, stopOrder);
  if (released) return remainingSeats;

  const quota = await getStopQuota(companyId, tripInstanceId, stopOrder);
  const soldFromStop = await getSoldFromStop(companyId, tripInstanceId, stopOrder);
  const quotaStopRemaining = Math.max(0, quota - soldFromStop);
  return Math.min(remainingSeats, quotaStopRemaining);
}

/**
 * Retourne les infos utiles pour l'affichage (places restantes globales, quota escale restant, libéré ou non).
 */
export async function getStopQuotaDisplay(
  companyId: string,
  tripInstanceId: string,
  stopOrder: number
): Promise<{
  remainingSeats: number;
  remainingStopQuota: number;
  quotaReleased: boolean;
  stopQuotaNominal: number;
  soldFromStop: number;
}> {
  const remainingSeats = await getRemainingSeats(companyId, tripInstanceId);
  const quotaReleased = await releaseStopQuotaIfNeeded(companyId, tripInstanceId, stopOrder);
  const stopQuotaNominal = await getStopQuota(companyId, tripInstanceId, stopOrder);
  const soldFromStop = stopOrder === 1 ? 0 : await getSoldFromStop(companyId, tripInstanceId, stopOrder);
  const quotaStopRemaining = stopOrder === 1 ? remainingSeats : Math.max(0, stopQuotaNominal - soldFromStop);
  const remainingStopQuota = quotaReleased ? remainingSeats : Math.min(remainingSeats, quotaStopRemaining);
  return {
    remainingSeats,
    remainingStopQuota,
    quotaReleased,
    stopQuotaNominal,
    soldFromStop,
  };
}
