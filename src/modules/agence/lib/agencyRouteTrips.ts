import {
  listTripInstancesByRouteAndDateRange,
} from "@/modules/compagnie/tripInstances/tripInstanceService";
import type { TripInstanceDocWithId } from "@/modules/compagnie/tripInstances/tripInstanceTypes";

/** Trajet prévu au départ de cette agence (agencyId ou agenciesInvolved). */
export function tripInstanceDeparturesFromAgency(ti: TripInstanceDocWithId, originAgencyId: string): boolean {
  if (!originAgencyId) return false;
  const row = ti as unknown as Record<string, unknown>;
  if (String(row.agencyId ?? "") === originAgencyId) return true;
  const inv = row.agenciesInvolved;
  if (Array.isArray(inv) && inv.some((x) => String(x) === originAgencyId)) return true;
  return false;
}

/**
 * Même source que le guichet (`listTripInstancesByRouteAndDateRange`), filtrée par agence de départ.
 */
export async function listTripInstancesForAgencyRoute(
  companyId: string,
  originAgencyId: string,
  departureCity: string,
  arrivalCity: string,
  dateFrom: string,
  dateTo: string,
  options?: { limitCount?: number }
): Promise<TripInstanceDocWithId[]> {
  const dep = (departureCity || "").trim();
  const arr = (arrivalCity || "").trim();
  if (!dep || !arr || !dateFrom || !dateTo) return [];
  const all = await listTripInstancesByRouteAndDateRange(companyId, dep, arr, dateFrom, dateTo, options);
  return all.filter((ti) => tripInstanceDeparturesFromAgency(ti, originAgencyId));
}
