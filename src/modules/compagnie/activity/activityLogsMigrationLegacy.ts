/**
 * Fallback migration only : lecture agrégée depuis `reservations` (ancien modèle).
 * Utiliser pour scripts de backfill `activityLogs` hors bundle produit.
 */
import {
  collectionGroup,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type LegacyReservationActivityRow = {
  id: string;
  agencyId: string;
  statut: string;
  montant: number;
  seatsGo: number;
  seatsReturn: number;
  createdAt: Date;
  raw: Record<string, unknown>;
};

const QUERY_LIMIT = 5000;

export async function fetchLegacyReservationRowsForActivity(
  companyId: string,
  start: Date,
  end: Date,
  agencyId?: string
): Promise<LegacyReservationActivityRow[]> {
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);
  const constraints = [
    where("companyId", "==", companyId),
    where("createdAt", ">=", startTs),
    where("createdAt", "<=", endTs),
    orderBy("createdAt", "asc"),
    limit(QUERY_LIMIT),
  ];
  if (agencyId) {
    (constraints as unknown[]).unshift(where("agencyId", "==", agencyId));
  }
  const q = query(collectionGroup(db, "reservations"), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    const createdAt =
      (data.createdAt as { toDate?: () => Date } | undefined)?.toDate?.() ?? new Date(0);
    const seatsGo = Number(data.seatsGo ?? data.seats ?? data.nbPlaces ?? 1) || 1;
    const seatsReturn = Number(data.seatsReturn ?? 0) || 0;
    return {
      id: d.id,
      agencyId: (data.agencyId ?? data.agenceId ?? "").toString(),
      statut: (data.statut ?? data.status ?? "").toString(),
      montant: Number(data.montant ?? data.amount ?? 0) || 0,
      seatsGo,
      seatsReturn,
      createdAt,
      raw: data,
    };
  });
}
