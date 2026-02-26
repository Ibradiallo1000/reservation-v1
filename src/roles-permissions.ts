// src/roles-permissions.ts

/* ===================== ROLES ===================== */
export type Role =
  /** ============ PLATFORME ============ */
  | 'admin_platforme'

  /** ============ COMPAGNIE ============ */
  | 'admin_compagnie'        // CEO (technique / propriétaire)
  | 'financial_director'     // DAF (superviseur comptable)
  | 'company_accountant'     // Comptable compagnie (opérationnel)
  | 'chef_garage'            // Chef garage (flotte compagnie)

  /** ============ AGENCE ============ */
  | 'chefAgence'
  | 'superviseur'            // Superviseur agence (accès shell / validations)
  | 'agentCourrier'         // Courrier (accès shell agence)
  | 'agency_accountant'      // Comptable agence
  | 'guichetier'
  | 'chefEmbarquement'       // Chef embarquement (ex agency_boarding_officer)
  | 'agency_fleet_controller'

  /** ============ SENTINEL (unknown role → redirect to login) ============ */
  | 'unauthenticated'
  /** ============ DEFAULT ============ */
  | 'user';


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
  | 'fleet';


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

  // Chef garage → flotte compagnie
  chef_garage: [
    'dashboard',
    'fleet',
  ],

  /** ============ AGENCE ============ */

  chefAgence: [
    'dashboard',
    'reservations',
    'finances',
    'guichet',
    'embarquement',
    'fleet',
    'personnel',
  ],

  superviseur: [
    'dashboard',
    'reservations',
    'finances',
    'guichet',
    'embarquement',
    'fleet',
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
