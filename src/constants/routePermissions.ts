/**
 * Rôles autorisés par zone / route. Une seule source de vérité pour les accès.
 */
export const routePermissions = {
  compagnieLayout: ["admin_compagnie", "admin_platforme"] as const,
  garageLayout: ["chef_garage", "admin_compagnie", "admin_platforme"] as const,
  companyAccountantLayout: ["company_accountant", "financial_director", "admin_platforme"] as const,
  agenceShell: ["chefAgence", "superviseur", "agentCourrier", "admin_compagnie"] as const,
  boarding: ["chefEmbarquement", "chefAgence", "admin_compagnie"] as const,
  fleet: ["agency_fleet_controller", "chefAgence", "admin_compagnie"] as const,
  companyFleet: ["chef_garage", "admin_compagnie", "admin_platforme"] as const,
  guichet: ["guichetier", "chefAgence", "admin_compagnie"] as const,
  comptabilite: ["agency_accountant", "admin_compagnie"] as const,
  validationsCompta: ["company_accountant", "financial_director", "admin_platforme"] as const,
  validationsAgence: ["chefAgence", "superviseur", "admin_compagnie"] as const,
  receiptGuichet: ["chefAgence", "guichetier", "admin_compagnie"] as const,
  adminLayout: ["admin_platforme"] as const,
  chefComptableCompagnie: ["company_accountant", "financial_director", "admin_platforme"] as const,
  tripCosts: ["chefAgence", "company_accountant", "financial_director", "admin_compagnie", "admin_platforme"] as const,
  courrier: ["agentCourrier", "chefAgence", "admin_compagnie"] as const,
} as const;

export type RoutePermissionKey = keyof typeof routePermissions;
