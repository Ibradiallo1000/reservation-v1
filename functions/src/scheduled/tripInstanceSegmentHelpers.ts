/**
 * Aligné sur src/modules/compagnie/tripInstances/tripInstanceSegments.ts
 * (pas d’import cross-package depuis functions/).
 */
import type { Firestore } from "firebase-admin/firestore";

export type TripInstanceSegment = { from: string; to: string; remaining: number };

export function buildSegmentsFromStops(stops: string[], capacity: number): TripInstanceSegment[] {
  const cap = Math.max(0, Number(capacity) || 0);
  const segs: TripInstanceSegment[] = [];
  for (let i = 0; i < stops.length - 1; i++) {
    segs.push({
      from: String(stops[i] ?? "").trim(),
      to: String(stops[i + 1] ?? "").trim(),
      remaining: cap,
    });
  }
  return segs;
}

/** Villes des arrêts, triées par `order` asc (companies/{cid}/routes/{rid}/stops). */
export async function fetchRouteStopCities(
  db: Firestore,
  companyId: string,
  routeId: string
): Promise<string[]> {
  const col = db.collection("companies").doc(companyId).collection("routes").doc(routeId).collection("stops");
  const snap = await col.orderBy("order", "asc").get();
  return snap.docs
    .map((d) => String((d.data() as { city?: string }).city ?? "").trim())
    .filter(Boolean);
}
