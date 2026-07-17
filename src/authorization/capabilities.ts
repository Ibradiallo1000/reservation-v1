import type { CanonicalRole } from "./roles";

export const APP_CAPABILITIES = [
  "platform.view",
  "platform.manage",
  "company.command.view",
  "company.agencies.manage",
  "company.settings.manage",
  "company.accounting.view",
  "company.accounting.operate",
  "company.digital-payments.manage",
  "company.logistics.view",
  "agency.dashboard.view",
  "agency.departures.manage",
  "agency.cash.read",
  "agency.team.manage",
  "agency.trips.manage",
  "agency.accounting.view",
  "agency.accounting.validate",
  "agency.treasury.mutate",
  "counter.sell",
  "boarding.manage",
  "courier.manage",
  "escale.manage",
  "fleet.view",
] as const;

export type AppCapability = (typeof APP_CAPABILITIES)[number];

export const ROLE_CAPABILITIES: Readonly<Record<CanonicalRole, readonly AppCapability[]>> = {
  admin_platforme: ["platform.view", "platform.manage", "company.command.view", "company.agencies.manage", "company.settings.manage", "company.accounting.view"],
  admin_compagnie: ["company.command.view", "company.agencies.manage", "company.settings.manage", "agency.dashboard.view", "agency.cash.read"],
  financial_director: ["company.accounting.view", "company.accounting.operate"],
  company_accountant: ["company.accounting.view", "company.accounting.operate"],
  operator_digital: ["company.digital-payments.manage"],
  responsable_logistique: ["company.logistics.view"],
  chefAgence: ["agency.dashboard.view", "agency.departures.manage", "agency.cash.read", "agency.team.manage", "agency.trips.manage"],
  superviseur: ["agency.dashboard.view", "agency.departures.manage", "agency.cash.read", "agency.team.manage", "agency.trips.manage"],
  agentCourrier: ["courier.manage"],
  agency_accountant: ["agency.accounting.view", "agency.accounting.validate", "agency.treasury.mutate", "agency.cash.read"],
  guichetier: ["counter.sell"],
  chefEmbarquement: ["boarding.manage"],
  agency_fleet_controller: ["fleet.view"],
  escale_agent: ["escale.manage", "counter.sell", "boarding.manage"],
  escale_manager: ["escale.manage", "counter.sell", "boarding.manage", "agency.team.manage", "agency.cash.read"],
};

export function hasCapability(role: CanonicalRole | null, capability: AppCapability): boolean {
  return role !== null && ROLE_CAPABILITIES[role].includes(capability);
}

export function rolesWithCapability(capability: AppCapability): CanonicalRole[] {
  return (Object.keys(ROLE_CAPABILITIES) as CanonicalRole[]).filter((role) =>
    hasCapability(role, capability),
  );
}
