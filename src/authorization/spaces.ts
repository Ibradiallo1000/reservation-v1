import type { AppCapability } from "./capabilities";

export const APP_SPACES = [
  "PUBLIC",
  "PLATFORM",
  "COMPANY_COMMAND",
  "COMPANY_ACCOUNTING",
  "AGENCY",
  "AGENCY_ACCOUNTING",
  "COUNTER",
  "BOARDING",
  "COURIER",
  "ESCALE",
] as const;

export type AppSpace = (typeof APP_SPACES)[number];
export type RequiredContext = "none" | "company" | "agency";

export interface SpaceDefinition {
  home: string;
  capability?: AppCapability;
  context: RequiredContext;
  shell: string;
}

export const SPACE_DEFINITIONS: Readonly<Record<AppSpace, SpaceDefinition>> = {
  PUBLIC: { home: "/", context: "none", shell: "Public" },
  PLATFORM: { home: "/admin/dashboard", capability: "platform.view", context: "none", shell: "AdminSidebarLayout" },
  COMPANY_COMMAND: { home: "/compagnie/:companyId/command-center", capability: "company.command.view", context: "company", shell: "CompagnieLayout" },
  COMPANY_ACCOUNTING: { home: "/compagnie/:companyId/accounting", capability: "company.accounting.view", context: "company", shell: "CompanyAccountantLayout" },
  AGENCY: { home: "/agence/activite", capability: "agency.dashboard.view", context: "agency", shell: "ManagerShellPage" },
  AGENCY_ACCOUNTING: { home: "/agence/comptabilite", capability: "agency.accounting.view", context: "agency", shell: "AgenceComptabilitePage" },
  COUNTER: { home: "/agence/guichet", capability: "counter.sell", context: "agency", shell: "AgenceGuichetPage" },
  BOARDING: { home: "/agence/boarding", capability: "boarding.manage", context: "agency", shell: "BoardingLayout" },
  COURIER: { home: "/agence/courrier", capability: "courier.manage", context: "agency", shell: "CourierLayout" },
  ESCALE: { home: "/agence/escale", capability: "escale.manage", context: "agency", shell: "EscaleLayout" },
};
