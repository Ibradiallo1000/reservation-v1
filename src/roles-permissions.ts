// ✅ src/roles-permissions.ts

export type Role =
  | 'admin'
  | 'admin_platforme'
  | 'admin_compagnie'
  | 'compagnie'
  | 'chefAgence'
  | 'guichetier'
  | 'gestionnaire'
  | 'agentCourrier'
  | 'support'
  | 'superviseur'
  | 'embarquement';

export type ModuleKey =
  | 'compagnies'
  | 'dashboard'
  | 'trajets'
  | 'reservations'
  | 'finances'
  | 'agences'
  | 'depenses'
  | 'statistiques'
  | 'personnel'
  | 'messages'
  | 'parametres'
  | 'parametresVitrine'
  | 'guichet'
  | 'courriers'
  | 'embarquement';

export const permissionsByRole: Record<Role, ModuleKey[]> = {
  admin: ['dashboard', 'parametres'],

  admin_platforme: [
    'dashboard', 'compagnies', 'reservations', 'finances',
    'depenses', 'statistiques', 'personnel', 'messages', 'parametres'
  ],

  admin_compagnie: [
    'dashboard', 'trajets', 'reservations', 'statistiques',
    'messages', 'parametres', 'parametresVitrine',
    'guichet', 'courriers', 'finances', 'agences',
    'personnel', 'embarquement'
  ],

  compagnie: [
    'dashboard', 'trajets', 'reservations', 'guichet',
    'courriers', 'parametres', 'embarquement'
  ],

  // ✅ Donne TOUS les accès au chef d’agence
  chefAgence: [
    'dashboard', 'trajets', 'reservations', 'guichet',
    'courriers', 'personnel', 'parametres', 'embarquement',
    'finances', 'statistiques', 'agences', 'messages', 'parametresVitrine'
  ],

  superviseur: [
    'dashboard', 'reservations', 'guichet', 'courriers',
    'trajets', 'finances', 'statistiques', 'embarquement'
  ],

  guichetier: ['guichet', 'reservations', 'embarquement'],

  gestionnaire: ['trajets', 'reservations', 'finances', 'depenses', 'statistiques'],

  agentCourrier: ['courriers'],

  support: ['messages'],

  embarquement: ['embarquement', 'reservations'],
};

export const hasPermission = (role: Role, module: ModuleKey): boolean => {
  const normalizedRole = (role || '').trim() as Role;
  const allowed = permissionsByRole[normalizedRole] || [];
  console.log("hasPermission Debug =>", { role: normalizedRole, module, allowed });
  return allowed.includes(module);
};
