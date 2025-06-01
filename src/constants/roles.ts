// ✅ Liste officielle et unique des rôles
export const ROLES = {
    ADMIN_PLATFORME: 'admin_platforme',
    ADMIN_COMPAGNIE: 'admin_compagnie',
    CHEF_AGENCE: 'chefAgence',
    GUICHETIER: 'guichetier',
    GESTIONNAIRE: 'gestionnaire',
    COURRIER: 'agentCourrier',
    SUPPORT: 'support',
  } as const;
  
  export type Role = typeof ROLES[keyof typeof ROLES];
  