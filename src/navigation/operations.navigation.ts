import { BarChart3, Bus, Camera, ClipboardList, LayoutDashboard, List, UserCheck, Users, Wallet } from "lucide-react";
import type { NavigationItem } from "./navigation.types";

export const boardingNavigation: readonly NavigationItem[] = [
  { id: "boarding-departures", label: "Départs", icon: Bus, to: "/agence/boarding", end: true, mobilePriority: 1 },
  { id: "boarding-scan", label: "Scan", icon: Camera, to: "/agence/boarding/scan?view=scan", mobilePriority: 2 },
  { id: "boarding-list", label: "Liste", icon: List, to: "/agence/boarding/scan?view=liste", mobilePriority: 3 },
  { id: "boarding-reports", label: "Rapports", icon: BarChart3, to: "/agence/boarding/scan?view=rapports", mobilePriority: 4 },
];

export const escaleNavigation: readonly NavigationItem[] = [
  { id: "escale-dashboard", label: "Aujourd'hui", icon: LayoutDashboard, to: "/agence/escale", end: true, mobilePriority: 1 },
  { id: "escale-bus", label: "Bus du jour", icon: Bus, to: "/agence/escale/bus", mobilePriority: 2 },
  { id: "escale-boarding", label: "Embarquement", icon: UserCheck, to: "/agence/escale/embarquement", mobilePriority: 3 },
  { id: "escale-manifest", label: "Manifeste", icon: ClipboardList, to: "/agence/escale/manifeste", mobilePriority: 4 },
  { id: "escale-cash", label: "Caisse", icon: Wallet, to: "/agence/escale/caisse" },
  { id: "escale-team", label: "Équipe", icon: Users, to: "/agence/escale/equipe", match: ["/agence/team"] },
];
