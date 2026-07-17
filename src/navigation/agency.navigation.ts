import { Activity, Banknote, Boxes, ClipboardCheck, FileBarChart2, MapPinned, ScanLine, Ticket, Users } from "lucide-react";
import { ENABLE_COURIER } from "@/config/featureFlags";
import type { NavigationItem } from "./navigation.types";

const MANAGER_ROLES = ["chefAgence", "chefagence", "admin_compagnie"] as const;

export const agencyManagerNavigation: readonly NavigationItem[] = [
  { id: "agency-today", label: "Aujourd'hui", icon: Activity, to: "/agence/activite", match: ["/agence/dashboard", "/agence/operations"], end: true, mobilePriority: 1, allowedRoles: MANAGER_ROLES },
  { id: "agency-departures", label: "Départs", icon: ClipboardCheck, to: "/agence/validation-departs", mobilePriority: 2, allowedRoles: MANAGER_ROLES },
  { id: "agency-cash", label: "Caisse", icon: Banknote, to: "/agence/caisse", match: ["/agence/finances", "/agence/treasury"], mobilePriority: 3, allowedRoles: MANAGER_ROLES },
  { id: "agency-ticket-office", label: "Guichets", icon: Ticket, to: "/agence/guichet", mobilePriority: 4, allowedRoles: MANAGER_ROLES },
  { id: "agency-boarding", label: "Embarquement", icon: ScanLine, to: "/agence/boarding", allowedRoles: MANAGER_ROLES },
  { id: "agency-courier", label: "Courrier", icon: Boxes, to: "/agence/courrier", featureFlag: ENABLE_COURIER, allowedRoles: MANAGER_ROLES },
  { id: "agency-team", label: "Équipe", icon: Users, to: "/agence/team", allowedRoles: MANAGER_ROLES },
  { id: "agency-trips", label: "Trajets", icon: MapPinned, to: "/agence/trajets", allowedRoles: MANAGER_ROLES },
  { id: "agency-reports", label: "Rapports", icon: FileBarChart2, to: "/agence/reports", allowedRoles: MANAGER_ROLES },
];
