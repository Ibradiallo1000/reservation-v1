/**
 * Rôles autorisés par zone / route. Une seule source de vérité pour les accès.
 */
export const routePermissions = {
  compagnieLayout: ["admin_compagnie", "admin_platforme"] as const,
  garageLayout: ["responsable_logistique", "chef_garage", "admin_compagnie", "admin_platforme"] as const,
  logisticsDashboard: ["responsable_logistique", "chef_garage", "admin_compagnie", "admin_platforme"] as const,
  companyAccountantLayout: ["company_accountant", "financial_director", "admin_compagnie", "admin_platforme"] as const,
  agenceShell: ["chefAgence", "superviseur", "agentCourrier", "escale_manager", "escale_agent", "agency_fleet_controller", "admin_compagnie"] as const,
  boarding: ["chefEmbarquement", "escale_agent", "escale_manager", "admin_compagnie"] as const,
  fleet: ["agency_fleet_controller", "admin_compagnie"] as const,
  /** Planification trajet ↔ véhicule (chef / superviseur) + validation logistique (contrôleur flotte / admin). */
  tripPlanning: ["chefAgence", "superviseur", "agency_fleet_controller", "admin_compagnie"] as const,
  companyFleet: ["responsable_logistique", "chef_garage", "admin_compagnie", "admin_platforme"] as const,
  guichet: ["guichetier", "chefAgence", "escale_agent", "escale_manager", "admin_compagnie"] as const,
  escaleDashboard: ["escale_agent", "escale_manager", "chefAgence", "admin_compagnie"] as const,
  /** Page compta agence : guichetier (ses sessions / ventes), comptable, chef, superviseur, admin compagnie. */
  comptabilite: [
    "agency_accountant",
    "guichetier",
    "chefAgence",
    "superviseur",
    "admin_compagnie",
  ] as const,
  /** Sous-écrans trésorerie (dépense, virement, payable) : pas le chef seul — manipulation caisse réservée au comptable agence (+ admins). */
  comptabiliteTreasury: ["agency_accountant", "admin_compagnie", "admin_platforme"] as const,
  validationsAgence: ["chefAgence", "superviseur", "admin_compagnie"] as const,
  receiptGuichet: ["chefAgence", "guichetier", "escale_manager", "admin_compagnie"] as const,
  adminLayout: ["admin_platforme"] as const,
  tripCosts: ["chefAgence", "company_accountant", "financial_director", "admin_compagnie", "admin_platforme"] as const,
  courrier: ["agentCourrier", "chefAgence", "admin_compagnie"] as const,
  cashControl: ["guichetier", "agentCourrier", "agency_accountant", "chefAgence", "escale_manager", "admin_compagnie"] as const,
  /** File d’attente paiements online pending : uniquement opérateur digital (+ admins). Compta = données validées ailleurs. */
  digitalCash: ["operator_digital", "admin_compagnie", "admin_platforme"] as const,
  /** Journal agentHistory : supervision chef / comptable / admin agence. */
  agentHistory: ["chefAgence", "superviseur", "agency_accountant", "admin_compagnie", "admin_platforme"] as const,
} as const;

export type RoutePermissionKey = keyof typeof routePermissions;
