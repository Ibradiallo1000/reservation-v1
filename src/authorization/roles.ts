export const CANONICAL_ROLES = [
  "admin_platforme",
  "admin_compagnie",
  "financial_director",
  "company_accountant",
  "operator_digital",
  "responsable_logistique",
  "chefAgence",
  "superviseur",
  "agentCourrier",
  "agency_accountant",
  "guichetier",
  "chefEmbarquement",
  "agency_fleet_controller",
  "escale_agent",
  "escale_manager",
] as const;

export type CanonicalRole = (typeof CANONICAL_ROLES)[number];

const CANONICAL_ROLE_SET = new Set<string>(CANONICAL_ROLES);

/** Aliases prouvés dans les profils, invitations, guards ou historiques du projet. */
export const ROLE_ALIASES: Readonly<Record<string, CanonicalRole>> = {
  admin_company: "admin_compagnie",
  company_ceo: "admin_compagnie",
  chefagence: "chefAgence",
  chef_garage: "responsable_logistique",
  chefgarage: "responsable_logistique",
  agentcourrier: "agentCourrier",
  agent_courrier: "agentCourrier",
  chefembarquement: "chefEmbarquement",
  agency_boarding_officer: "chefEmbarquement",
  embarquement: "chefEmbarquement",
};

export function normalizeRole(rawRole: unknown): CanonicalRole | null {
  if (typeof rawRole !== "string") return null;
  const trimmed = rawRole.trim();
  if (!trimmed) return null;
  if (CANONICAL_ROLE_SET.has(trimmed)) return trimmed as CanonicalRole;
  const lowered = trimmed.toLowerCase();
  if (ROLE_ALIASES[lowered]) return ROLE_ALIASES[lowered];
  const canonicalCaseMatch = CANONICAL_ROLES.find((role) => role.toLowerCase() === lowered);
  return canonicalCaseMatch ?? null;
}

export function normalizeRoles(rawRoles: unknown): CanonicalRole[] {
  const values = Array.isArray(rawRoles) ? rawRoles : rawRoles == null ? [] : [rawRoles];
  return [...new Set(values.map(normalizeRole).filter((role): role is CanonicalRole => role !== null))];
}

export function isCanonicalRole(value: unknown): value is CanonicalRole {
  return typeof value === "string" && CANONICAL_ROLE_SET.has(value);
}
