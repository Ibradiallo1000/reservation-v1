import type { AppCapability } from "@/authorization/capabilities";
import { hasCapability } from "@/authorization/capabilities";
import { normalizeRole, type CanonicalRole } from "@/authorization/roles";
import type { AgencyLiveTripItem } from "@/modules/agence/manager/domains/useAgencyActionCockpit";

export const AGENCY_TODAY_CANONICAL_ROUTE = "/agence/activite";
export const AGENCY_TODAY_ALIASES = ["/agence/dashboard", "/agence/operations"] as const;

export type AgencyTodayAccessState = "allowed" | "unknown_role" | "missing_company" | "missing_agency" | "forbidden";

export function resolveAgencyTodayAccess(rawRole: unknown, companyId?: string | null, agencyId?: string | null): AgencyTodayAccessState {
  const role = normalizeRole(rawRole);
  if (!role) return "unknown_role";
  if (!companyId?.trim()) return "missing_company";
  if (!agencyId?.trim()) return "missing_agency";
  return hasCapability(role, "agency.dashboard.view") ? "allowed" : "forbidden";
}

export function isAgencyTripConfirmed(trip: AgencyLiveTripItem): boolean {
  return Boolean(
    trip.departureConfirmed ||
    trip.departureConfirmedAt ||
    trip.departedAt ||
    trip.confirmedAt,
  );
}

export function selectTodayDepartures(trips: readonly AgencyLiveTripItem[]) {
  return [...trips]
    .sort((a, b) => a.departureTime.localeCompare(b.departureTime))
    .map((trip) => ({
      ...trip,
      confirmed: isAgencyTripConfirmed(trip),
      attention: trip.isLate && !isAgencyTripConfirmed(trip),
    }));
}

export type AgencyQuickAccess = {
  label: string;
  to: string;
  capability: AppCapability;
};

const QUICK_ACCESS: readonly AgencyQuickAccess[] = [
  { label: "Voir les départs", to: "/agence/validation-departs", capability: "agency.departures.manage" },
  { label: "Voir la caisse", to: "/agence/caisse", capability: "agency.cash.read" },
  { label: "Voir l’équipe", to: "/agence/team", capability: "agency.team.manage" },
  { label: "Voir les trajets", to: "/agence/trajets", capability: "agency.trips.manage" },
];

export function getAgencyQuickAccess(role: CanonicalRole): AgencyQuickAccess[] {
  return QUICK_ACCESS.filter((item) => hasCapability(role, item.capability));
}

export function formatAgencyTodayDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone,
  }).format(date);
}
