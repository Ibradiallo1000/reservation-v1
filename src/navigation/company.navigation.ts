import { Building2, ClipboardList, DollarSign, Gauge, Settings, TrendingUp, Users } from "lucide-react";
import type { NavigationItem } from "./navigation.types";

const COMPANY_ROLES = ["admin_compagnie", "admin_company", "company_ceo", "admin_platforme"] as const;

export function companyNavigation(basePath: string): readonly NavigationItem[] {
  return [
    { id: "company-overview", label: "Vue réseau", icon: Gauge, to: `${basePath}/command-center`, match: [`${basePath}/dashboard`], end: true, mobilePriority: 1, allowedRoles: COMPANY_ROLES },
    { id: "company-activity", label: "Activité réseau", icon: TrendingUp, to: `${basePath}/reservations-reseau`, match: [`${basePath}/operations-reseau`], mobilePriority: 2, allowedRoles: COMPANY_ROLES },
    { id: "company-reservations", label: "Réservations", icon: ClipboardList, to: `${basePath}/reservations`, mobilePriority: 3, allowedRoles: COMPANY_ROLES },
    { id: "company-finance", label: "Finances consolidées", icon: DollarSign, to: `${basePath}/finances`, match: [`${basePath}/treasury`, `${basePath}/caisse`, `${basePath}/revenus-liquidites`], mobilePriority: 4, allowedRoles: COMPANY_ROLES },
    { id: "company-agencies", label: "Agences", icon: Building2, to: `${basePath}/agences`, allowedRoles: COMPANY_ROLES },
    { id: "company-customers", label: "Clients", icon: Users, to: `${basePath}/customers`, allowedRoles: ["admin_compagnie", "admin_company", "admin_platforme"] },
    { id: "company-settings", label: "Configuration", icon: Settings, to: `${basePath}/parametres`, allowedRoles: COMPANY_ROLES },
  ];
}
