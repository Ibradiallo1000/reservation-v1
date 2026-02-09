// src/roles-permissions.ts

/* ===================== ROLES ===================== */
export type Role =
  /** ============ PLATFORME ============ */
  | 'admin_platforme'

  /** ============ COMPAGNIE ============ */
  | 'admin_compagnie'        // CEO (technique / propriétaire)
  | 'financial_director'     // DAF (superviseur comptable)
  | 'company_accountant'     // Comptable compagnie (opérationnel)

  /** ============ AGENCE ============ */
  | 'chefAgence'
  | 'agency_accountant'      // Comptable agence
  | 'guichetier'
  | 'embarquement'

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
  | 'embarquement';


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

  /** ============ AGENCE ============ */

  chefAgence: [
    'dashboard',
    'reservations',
    'finances',
    'guichet',
    'embarquement',
    'personnel',
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

  embarquement: [
    'embarquement',
    'reservations',
  ],

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
