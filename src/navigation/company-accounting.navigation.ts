import { AlertTriangle, ArrowRightLeft, CreditCard, FileText, Landmark, LayoutDashboard } from "lucide-react";
import type { NavigationItem } from "./navigation.types";

const ACCOUNTING_ROLES = ["company_accountant", "financial_director", "admin_compagnie", "admin_company", "admin_platforme"] as const;

export function companyAccountingNavigation(basePath: string): readonly NavigationItem[] {
  return [
    { id: "accounting-dashboard", label: "Tableau financier", icon: LayoutDashboard, to: basePath, end: true, mobilePriority: 1, allowedRoles: ACCOUNTING_ROLES },
    { id: "accounting-network", label: "Réseau financier", icon: CreditCard, to: `${basePath}/reservations-reseau`, mobilePriority: 2, allowedRoles: ACCOUNTING_ROLES },
    { id: "accounting-treasury", label: "Trésorerie", icon: Landmark, to: `${basePath}/treasury`, mobilePriority: 3, allowedRoles: ACCOUNTING_ROLES },
    { id: "accounting-flows", label: "Flux financiers", icon: ArrowRightLeft, to: `${basePath}/finances`, mobilePriority: 4, allowedRoles: ACCOUNTING_ROLES },
    { id: "accounting-reports", label: "Rapports", icon: FileText, to: `${basePath}/rapports`, allowedRoles: ACCOUNTING_ROLES },
    { id: "accounting-anomalies", label: "Anomalies", icon: AlertTriangle, to: `${basePath}/consistency-diagnostics`, allowedRoles: ACCOUNTING_ROLES },
  ];
}
