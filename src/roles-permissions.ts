// src/roles-permissions.ts

/* ===================== ROLES ===================== */
import type { CanonicalRole } from "@/authorization/roles";
export type Role = CanonicalRole | "chef_garage" | "unauthenticated" | "user";


/* ===================== MODULES ===================== */
export type ModuleKey =
  /** commun */
  | 'dashboard'
  | 'reservations'
  | 'statistiques'

  /** finances */
  | 'finances'
  | 'depenses'

  /** structure */
  | 'agences'
  | 'personnel'
  | 'parametres'

  /** agence */
  | 'guichet'
  | 'embarquement'
  | 'boarding'
  | 'fleet'
  | 'trip_planning';


/* ===================== PERMISSIONS ===================== */
export const permissionsByRole: Record<Role, readonly ModuleKey[]> = {

  /** ============ PLATFORME ============ */
  admin_platforme: [
    'dashboard',
    'statistiques',
    'parametres',
  ],

  /** ============ COMPAGNIE ============ */

  // CEO → vision globale + structure (PAS d’opérations comptables)
  admin_compagnie: [
    'dashboard',
    'statistiques',
    'agences',
    'personnel',
    'parametres',
    'trip_planning',
  ],

  // DAF → supervision financière & validation
  financial_director: [
    'dashboard',
    'reservations',
    'finances',
    'depenses',
    'statistiques',
  ],

  // Comptable compagnie → exécution quotidienne
  company_accountant: [
    'dashboard',
    'reservations',
    'finances',
    'depenses',
    'statistiques',
  ],

  // Responsable logistique → flotte, véhicules, maintenance (pas comptabilité / revenus)
  responsable_logistique: [
    'dashboard',
    'fleet',
  ],

  chef_garage: [
    'dashboard',
    'fleet',
  ],

  // Opérateur Digital → validation paiements en ligne uniquement (pas comptabilité globale)
  operator_digital: [
    'dashboard',
    'reservations',
  ],

  /** ============ AGENCE ============ */

  chefAgence: [
    'dashboard',
    'reservations',
    'finances',
    'guichet',
    'trip_planning',
    'personnel',
  ],

  superviseur: [
    'dashboard',
    'reservations',
    'finances',
    'guichet',
    'trip_planning',
    'personnel',
  ],

  agentCourrier: [
    'dashboard',
    'reservations',
  ],

  agency_accountant: [
    'dashboard',
    'finances',
    'depenses',
    'statistiques',
  ],

  guichetier: [
    'guichet',
    'reservations',
  ],

  chefEmbarquement: [
    'boarding',
    'embarquement',
    'reservations',
  ],

  agency_fleet_controller: [
    'fleet',
    'trip_planning',
  ],

  escale_agent: [
    'dashboard',
    'guichet',
    'reservations',
    'boarding',
  ],

  escale_manager: [
    'dashboard',
    'guichet',
    'reservations',
    'boarding',
    'personnel', // peut inviter escale_agent
  ],

  /** ============ SENTINEL ============ */
  unauthenticated: [],

  /** ============ DEFAULT ============ */
  user: [],
} as const;


/* ===================== HELPER ===================== */
export const hasPermission = (
  role: Role,
  module: ModuleKey
): boolean => {
  return permissionsByRole[role]?.includes(module) ?? false;
};
