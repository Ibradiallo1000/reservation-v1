/**
 * Contrôle d’accès UI pour `/agence/comptabilite` (onglets et actions).
 * Ne modifie pas les services Firestore — règles produit uniquement.
 */
import type { Role } from "@/roles-permissions";

const CANONICAL_ROLES: ReadonlySet<string> = new Set([
  "admin_platforme",
  "admin_compagnie",
  "company_accountant",
  "operator_digital",
  "agency_accountant",
  "responsable_logistique",
  "chef_garage",
  "chefagence",
  "chefembarquement",
  "superviseur",
  "agentcourrier",
  "guichetier",
  "agency_fleet_controller",
  "financial_director",
  "escale_agent",
  "escale_manager",
]);

/** Aligné sur PrivateRoute.normalizeRole */
export function normalizeRoleForAgencyCompta(r?: unknown): Role {
  if (!r) return "unauthenticated";
  const raw = String(r).trim().toLowerCase();
  if (raw === "company_ceo") return "admin_compagnie";
  if (raw === "chef_garage" || raw === "chefgarage") return "responsable_logistique";
  if (raw === "chefagence") return "chefAgence";
  if (raw === "agentcourrier") return "agentCourrier";
  if (raw === "chefembarquement") return "chefEmbarquement";
  if (raw === "agency_boarding_officer" || raw === "embarquement") return "chefEmbarquement";
  if (CANONICAL_ROLES.has(raw)) return raw as Role;
  return "unauthenticated";
}

export function rolesArrayFromUnknown(v: unknown): Role[] {
  const arr = Array.isArray(v) ? v.map(String) : v != null && String(v).trim() !== "" ? [String(v)] : [];
  return arr.map(normalizeRoleForAgencyCompta).filter((r) => r !== "unauthenticated");
}

export const AGENCY_COMPTA_TAB_KEYS = [
  "ventes",
  "versements",
  "caisse",
  "audit",
  "corrections",
] as const;

export type AgencyComptaTabKey = (typeof AGENCY_COMPTA_TAB_KEYS)[number];

/**
 * Onglets visibles selon le rôle (spec produit + matrice implémentée).
 * - Ventes : guichetier (seul) ou chef / superviseur / admin.
 * - Versements, Caisse : comptable agence + chef / superviseur / admin.
 * - Contrôle : comptable agence + chef / superviseur / admin (validation ensuite restreinte via canRunAgencyCashControlAudit).
 */
export function getAllowedAgencyComptaTabs(roles: readonly Role[]): AgencyComptaTabKey[] {
  const r = new Set(roles);
  if (r.has("admin_compagnie") || r.has("admin_platforme")) {
    return [...AGENCY_COMPTA_TAB_KEYS];
  }
  const isManager = r.has("chefAgence") || r.has("superviseur");
  if (isManager) {
    return [...AGENCY_COMPTA_TAB_KEYS];
  }
  /** Inclut `ventes` pour le volet courrier (activation / suivi) — sans blocs billetterie côté page. */
  if (r.has("agency_accountant")) {
    return ["versements", "caisse", "audit", "corrections", "ventes"];
  }
  if (r.has("guichetier")) {
    return ["ventes"];
  }
  return [];
}

export function pickFirstAllowedAgencyComptaTab(allowed: readonly AgencyComptaTabKey[]): AgencyComptaTabKey {
  for (const t of AGENCY_COMPTA_TAB_KEYS) {
    if (allowed.includes(t)) return t;
  }
  return "ventes";
}

/** Premier onglet à l’ouverture sans `?tab=` (comptable → Versements, pas Ventes). */
export function getDefaultAgencyComptaTab(allowed: readonly AgencyComptaTabKey[], roles: readonly Role[]): AgencyComptaTabKey {
  if (allowed.length === 0) return "ventes";
  const r = new Set(roles);
  const accountantOnly =
    r.has("agency_accountant") &&
    !r.has("chefAgence") &&
    !r.has("superviseur") &&
    !r.has("admin_compagnie") &&
    !r.has("admin_platforme");
  if (accountantOnly && allowed.includes("versements")) return "versements";
  return pickFirstAllowedAgencyComptaTab(allowed);
}

/** Dépenses, virement banque, payables depuis l’écran Caisse — comptable agence (et admins). */
export function canManipulateAgencyCaisseTreasury(roles: readonly Role[]): boolean {
  const r = new Set(roles);
  return r.has("agency_accountant") || r.has("admin_compagnie") || r.has("admin_platforme");
}

/** Valider versements guichet / courrier (saisie espèces comptées, etc.). */
export function canValidateAgencyVersements(roles: readonly Role[]): boolean {
  const r = new Set(roles);
  return r.has("agency_accountant") || r.has("admin_compagnie") || r.has("admin_platforme");
}

/** Activation session courrier en attente (compta ou encadrement). */
export function canActivateCourierSessionFromCompta(roles: readonly Role[]): boolean {
  const r = new Set(roles);
  return (
    r.has("agency_accountant") ||
    r.has("admin_compagnie") ||
    r.has("admin_platforme") ||
    r.has("chefAgence") ||
    r.has("superviseur")
  );
}

/** Postes billetterie, KPI jour agence, rapports guichet (pas le comptable seul). */
export function canSeeGuichetSalesSupervisionOnCompta(roles: readonly Role[]): boolean {
  const r = new Set(roles);
  if (r.has("admin_compagnie") || r.has("admin_platforme")) return true;
  if (r.has("chefAgence") || r.has("superviseur")) return true;
  if (r.has("guichetier")) return true;
  return false;
}

/** Bloc courrier dans l’onglet Ventes (supervision agence + comptable). */
export function canSeeCourierSupervisionOnCompta(roles: readonly Role[]): boolean {
  const r = new Set(roles);
  return (
    r.has("agency_accountant") ||
    r.has("chefAgence") ||
    r.has("superviseur") ||
    r.has("admin_compagnie") ||
    r.has("admin_platforme")
  );
}

/** Activer / continuer un poste guichet (autre que soi). */
export function canManageAgencyGuichetShifts(roles: readonly Role[]): boolean {
  const r = new Set(roles);
  return r.has("chefAgence") || r.has("superviseur") || r.has("admin_compagnie") || r.has("admin_platforme");
}

/**
 * Guichetier seul sur la page : ne voit que ses propres postes (filtre UI).
 */
export function isGuichetierOnlyComptaScope(roles: readonly Role[]): boolean {
  const r = new Set(roles);
  if (!r.has("guichetier")) return false;
  if (r.has("chefAgence") || r.has("superviseur") || r.has("agency_accountant")) return false;
  if (r.has("admin_compagnie") || r.has("admin_platforme")) return false;
  return true;
}

export function logAgencyComptaAccessDenied(detail: {
  attemptedTab?: string;
  roles: readonly Role[];
  redirectedTo: string;
}): void {
  console.warn("[AgenceCompta][ACCESS] accès onglet refusé — redirection", detail);
}
