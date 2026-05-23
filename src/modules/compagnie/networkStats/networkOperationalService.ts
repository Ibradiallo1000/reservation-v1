/**
 * Indicateurs opérationnels réseau uniquement : agences actives, bus en circulation, flotte.
 * Ne contient PAS : CA, billets, remplissage (→ financialConsistencyService / getNetworkSales / getNetworkOccupancy).
 */
import { getFleetKpiSummary, getReservationsInRange, isSoldReservation } from "./networkStatsService";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { getBusesInProgressCountToday } from "@/modules/compagnie/tripInstances/tripInstanceService";

export interface NetworkOperationalStats {
  activeAgencies: number;
  busesInTransit: number;
  vehiclesAvailable: number;
  vehiclesTotal: number;
}

/**
 * Stats opérationnelles pour une période : agences actives (réservations vendues), bus en transit (aujourd'hui), état flotte.
 * À utiliser à la place de getNetworkStats pour tout ce qui n'est pas ventes/billets/remplissage.
 */
export async function getNetworkOperationalStats(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<NetworkOperationalStats> {
  const periodStart = getStartOfDayInBamako(dateFrom);
  const periodEnd = getEndOfDayInBamako(dateTo);

  const [reservations, busesInTransit, fleetSummary] = await Promise.all([
    getReservationsInRange(companyId, periodStart, periodEnd),
    getBusesInProgressCountToday(companyId),
    getFleetKpiSummary(companyId),
  ]);

  const sold = reservations.filter((r) => isSoldReservation(r.statut));
  const activeAgenciesSet = new Set(sold.map((r) => r.agencyId).filter(Boolean));

  return {
    activeAgencies: activeAgenciesSet.size,
    busesInTransit,
    vehiclesAvailable: fleetSummary.vehiclesAvailable,
    vehiclesTotal: fleetSummary.vehiclesTotal,
  };
}
