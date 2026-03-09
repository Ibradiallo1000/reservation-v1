// ✅ Liste officielle et unique des rôles
export const ROLES = {
    ADMIN_PLATFORME: 'admin_platforme',
    ADMIN_COMPAGNIE: 'admin_compagnie',
    CHEF_AGENCE: 'chefAgence',
    /** Fleet & vehicle operations (ex chef_garage). */
    RESPONSABLE_LOGISTIQUE: 'responsable_logistique',
    GUICHETIER: 'guichetier',
    GESTIONNAIRE: 'gestionnaire',
    COURRIER: 'agentCourrier',
    SUPPORT: 'support',
    CHEF_EMBARQUEMENT: 'chefEmbarquement',
    AGENCY_FLEET_CONTROLLER: 'agency_fleet_controller',
  } as const;

  export type Role = typeof ROLES[keyof typeof ROLES];
  