// ✅ Si tu préfères centraliser les types, tu peux importer Role depuis 'types.ts'
// import type { Role } from './types';

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
  | 'superviseur'; // ✅ Ajouté

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
  | 'courriers';

  export const permissionsByRole: Record<Role, ModuleKey[]> = {
    admin: ['dashboard', 'parametres'],
  
    admin_platforme: [
      'dashboard', 'compagnies', 'reservations', 'finances',
      'depenses', 'statistiques', 'personnel', 'messages', 'parametres'
    ],
  
    admin_compagnie: [
      'dashboard', 'trajets', 'reservations', 'statistiques',
      'messages', 'parametres', 'parametresVitrine',
      'guichet', 'courriers', 'finances', 'agences', 'personnel'
    ],
  
    compagnie: [ // ✅ Ajout ici
      'dashboard', 'trajets', 'reservations', 'guichet', 'courriers', 'parametres'
    ],
  
    chefAgence: [
      'dashboard', 'trajets', 'reservations', 'guichet',
      'courriers', 'personnel', 'parametres'
    ],
    superviseur: [
  'dashboard', 'reservations', 'guichet',
  'courriers', 'trajets', 'finances', 'statistiques'
],

  
    guichetier: ['guichet', 'reservations'],
    gestionnaire: ['trajets', 'reservations', 'finances', 'depenses', 'statistiques'],
    agentCourrier: ['courriers'],
    support: ['messages'],
  };

export const hasPermission = (role: Role, module: ModuleKey): boolean => {
  const allowed = permissionsByRole[role] || [];
  return allowed.includes(module);
};