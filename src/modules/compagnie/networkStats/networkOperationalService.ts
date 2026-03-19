/**
 * Indicateurs opérationnels réseau uniquement : agences actives, bus en circulation, flotte.
 * Ne contient PAS : CA, billets, remplissage (→ financialConsistencyService / getNetworkSales / getNetworkOccupancy).
 */
import { getReservationsInRange, isSoldReservation } from "./networkStatsService";
import { getStartOfDayInBamako, getEndOfDayInBamako } from "@/shared/date/dateUtilsTz";
import { getBusesInProgressCountToday } from "@/modules/compagnie/tripInstances/tripInstanceService";
import { listVehicles } from "@/modules/compagnie/fleet/vehiclesService";
import { OPERATIONAL_STATUS, TECHNICAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";

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

  const [reservations, busesInTransit, vehicles] = await Promise.all([
    getReservationsInRange(companyId, periodStart, periodEnd),
    getBusesInProgressCountToday(companyId),
    listVehicles(companyId, 500),
  ]);

  const sold = reservations.filter((r) => isSoldReservation(r.statut));
  const activeAgenciesSet = new Set(sold.map((r) => r.agencyId).filter(Boolean));
  const vehiclesAvailable = vehicles.filter(
    (v) =>
      (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.GARAGE &&
      (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) === TECHNICAL_STATUS.NORMAL
  ).length;

  return {
    activeAgencies: activeAgenciesSet.size,
    busesInTransit,
    vehiclesAvailable,
    vehiclesTotal: vehicles.length,
  };
}
