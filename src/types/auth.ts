// src/types/auth.ts
import type { Role } from "@/roles-permissions";

export interface CustomUser {
  uid: string;
  email: string;
  displayName?: string;

  companyId: string;
  role: Role;
  nom: string;
  ville?: string;

  agencyId?: string;
  agencyName?: string;
  /** Fuseau IANA chargé depuis l'agence (KPI jour agence). */
  agencyTimezone?: string;

  lastLogin?: Date | null;
  permissions?: string[];

  companyLogo?: string;
  companyColor?: string;

  agencyTelephone?: string;
  agencyNom?: string;
  agencyLogoUrl?: string;
}
