/**
 * RBAC produit : onglets de la page comptabilité agence (UI + URL).
 * Ne modifie pas les services métier ; complète les routes `ProtectedRoute`.
 */

import type { Role } from "@/roles-permissions";

const CANONICAL = new Set([
  "admin_platforme",
  "admin_compagnie",
  "agency_accountant",
  "chefAgence",
  "superviseur",
  "guichetier",
  "agentCourrier",
]);

function normalizeOne(raw: unknown): Role {
  if (raw == null || raw === "") return "unauthenticated";
  const s = String(raw).trim().toLowerCase();
  if (s === "chefagence") return "chefAgence";
  if (s === "agentcourrier") return "agentCourrier";
  if (s === "company_ceo") return "admin_compagnie";
  return (CANONICAL.has(s) ? s : "unauthenticated") as Role;
}

/** Rôles issus du profil utilisateur (tableau ou valeur unique). */
export function normalizeUserRoles(userRole: unknown): Role[] {
  const arr = Array.isArray(userRole) ? userRole : userRole != null ? [userRole] : [];
  const out = arr.map(normalizeOne).filter((r) => r !== "unauthenticated");
  return out.length ? out : ["unauthenticated"];
}

export const COMPTA_TAB_ORDER = [
  "ventes",
  "versements",
  "caisse",
  "audit",
  "corrections",
] as const;

export type ComptaTabKey = (typeof COMPTA_TAB_ORDER)[number];

function hasRole(roles: Role[], r: Role): boolean {
  return roles.some((x) => String(x) === String(r));
}

/**
 * Onglets visibles selon les rôles (union si plusieurs rôles).
 *
 * Règles :
 * - Ventes : guichetier, chef d'agence, superviseur (+ admins).
 * - Versements, Caisse : comptable agence, chef, superviseur (+ admins).
 * - Contrôle : comptable agence + chef d'agence + superviseur (+ admins) (validation ensuite restreinte via `canRunAgencyCashControlAudit`).
 * - Corrections : comptable agence, chef, superviseur (+ admins).
 */
export function getAllowedComptaTabs(roles: Role[]): ComptaTabKey[] {
  if (hasRole(roles, "admin_platforme") || hasRole(roles, "admin_compagnie")) {
    return [...COMPTA_TAB_ORDER];
  }

  const chef = hasRole(roles, "chefAgence") || hasRole(roles, "superviseur");
  const accountant = hasRole(roles, "agency_accountant");
  const guichet = hasRole(roles, "guichetier");

  const set = new Set<ComptaTabKey>();

  if (guichet) set.add("ventes");
  if (chef) {
    COMPTA_TAB_ORDER.forEach((t) => set.add(t));
  }
  if (accountant) {
    set.add("ventes");
    set.add("versements");
    set.add("caisse");
    set.add("audit");
    set.add("corrections");
  }

  return COMPTA_TAB_ORDER.filter((t) => set.has(t));
}

export function getDefaultComptaTab(allowed: ComptaTabKey[]): ComptaTabKey {
  for (const t of COMPTA_TAB_ORDER) {
    if (allowed.includes(t)) return t;
  }
  return "ventes";
}

/** Dépenses / virements / payables depuis l’onglet Caisse : comptable agence ou admin. */
export function canManipulateAgencyCashInComptabilite(roles: Role[]): boolean {
  if (hasRole(roles, "admin_platforme") || hasRole(roles, "admin_compagnie")) return true;
  return hasRole(roles, "agency_accountant");
}

/** Validation contrôle caisse (saisie réel vs attendu + enregistrement) : chef / superviseur / admin. */
export function canRunAgencyCashControlAudit(roles: Role[]): boolean {
  if (hasRole(roles, "admin_platforme") || hasRole(roles, "admin_compagnie")) return true;
  return hasRole(roles, "chefAgence") || hasRole(roles, "superviseur");
}

export function logComptabiliteTabDenied(tab: ComptaTabKey, roles: Role[]): void {
  console.warn("[AgenceCompta][RBAC] onglet non autorisé — redirection", {
    tabDemandé: tab,
    rôles: roles,
    ts: new Date().toISOString(),
  });
}
