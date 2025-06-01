import { Role } from './constants/roles';

export type ModuleKey =
  | 'dashboard'
  | 'trajets'
  | 'reservations'
  | 'courriers'
  | 'guichet'
  | 'finances'
  | 'statistiques'
  | 'agences'
  | 'personnel'
  | 'parametres'
  | 'parametresVitrine';

export const permissionsByRole: Record<Role, ModuleKey[]> = {
  admin_platforme: ['dashboard', 'finances', 'statistiques', 'parametres'],
  admin_compagnie: ['dashboard', 'trajets', 'reservations', 'agences', 'guichet', 'courriers', 'personnel', 'parametres'],
  chefAgence: ['dashboard', 'trajets', 'reservations', 'guichet', 'courriers'],
  guichetier: ['guichet', 'reservations'],
  gestionnaire: ['trajets', 'reservations', 'finances'],
  agentCourrier: ['courriers'],
  support: ['parametres']
};

export const hasPermission = (role: Role, module: ModuleKey): boolean => {
  return permissionsByRole[role]?.includes(module) ?? false;
};
