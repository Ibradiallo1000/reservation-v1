import { Activity, Building2, CreditCard, DollarSign, Home, Image, Settings } from "lucide-react";
import type { NavigationItem } from "./navigation.types";

const PLATFORM_ROLES = ["admin_platforme"] as const;

export const platformNavigation: readonly NavigationItem[] = [
  { id: "platform-dashboard", label: "Tableau de bord", icon: Home, to: "/admin/dashboard", end: true, mobilePriority: 1, allowedRoles: PLATFORM_ROLES },
  { id: "platform-companies", label: "Compagnies", icon: Building2, to: "/admin/compagnies", mobilePriority: 2, allowedRoles: PLATFORM_ROLES },
  { id: "platform-subscriptions", label: "Abonnements", icon: CreditCard, to: "/admin/subscriptions", mobilePriority: 3, allowedRoles: PLATFORM_ROLES },
  { id: "platform-supervision", label: "Supervision", icon: Activity, to: "/admin/reservations", match: ["/admin/statistiques"], mobilePriority: 4, allowedRoles: PLATFORM_ROLES },
  { id: "platform-revenue", label: "Revenus plateforme", icon: DollarSign, to: "/admin/revenus", allowedRoles: PLATFORM_ROLES },
  { id: "platform-billing", label: "Facturation", icon: DollarSign, to: "/admin/finances", allowedRoles: PLATFORM_ROLES },
  { id: "platform-plans", label: "Plans et tarifs", icon: DollarSign, to: "/admin/plans", allowedRoles: PLATFORM_ROLES },
  { id: "platform-media", label: "Contenu public", icon: Image, to: "/admin/media", allowedRoles: PLATFORM_ROLES },
  { id: "platform-payments", label: "Moyens de paiement", icon: CreditCard, to: "/admin/payment-methods", allowedRoles: PLATFORM_ROLES },
  { id: "platform-settings", label: "Configuration", icon: Settings, to: "/admin/parametres-platforme", allowedRoles: PLATFORM_ROLES },
];
