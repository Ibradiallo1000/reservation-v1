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
  | 'embarquement'
  | 'comptable'   // ✅ ajouté
  | 'user'; // rôle par défaut si rien dans Firestore

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
  // Admin “app” basique
  admin: ['dashboard', 'parametres'],

  // Admin plateforme
  admin_platforme: [
    'dashboard', 'compagnies', 'reservations', 'finances',
    'depenses', 'statistiques', 'personnel', 'messages', 'parametres'
  ],

  // Admin d’une compagnie
  admin_compagnie: [
    'dashboard', 'trajets', 'reservations', 'statistiques',
    'messages', 'parametres', 'parametresVitrine',
    'guichet', 'courriers', 'finances', 'agences',
    'personnel', 'embarquement'
  ],

  // Compagnie (compte global)
  compagnie: [
    'dashboard', 'trajets', 'reservations', 'guichet',
    'courriers', 'parametres', 'embarquement'
  ],

  // ✅ Chef d’agence : accès quasi total
  chefAgence: [
    'dashboard', 'trajets', 'reservations', 'guichet',
    'courriers', 'personnel', 'parametres', 'embarquement',
    'finances', 'statistiques', 'agences', 'messages', 'parametresVitrine'
  ],

  // Superviseur
  superviseur: [
    'dashboard', 'reservations', 'guichet', 'courriers',
    'trajets', 'finances', 'statistiques', 'embarquement'
  ],

  // ✅ Guichetier : ce dont il a besoin
  guichetier: ['guichet', 'reservations', 'embarquement'],

  // Gestionnaire (compta / opérations)
  gestionnaire: ['trajets', 'reservations', 'finances', 'depenses', 'statistiques'],

  // Agent courrier
  agentCourrier: ['courriers'],

  // Support
  support: ['messages'],

  // Agent embarquement (contrôle à la gare)
  embarquement: ['embarquement', 'reservations'],

  // ✅ Comptable : validation des postes, encaissements, rapports
  comptable: ['dashboard', 'finances', 'reservations', 'depenses', 'statistiques'], // ✅ ajouté

  // Rôle par défaut (aucun accès sensible)
  user: [],
};

/** Vérifie l’accès d’un rôle à un module. */
export const hasPermission = (role: Role, module: ModuleKey): boolean => {
  const list = permissionsByRole[role] ?? permissionsByRole.user;
  return list.includes(module);
};
