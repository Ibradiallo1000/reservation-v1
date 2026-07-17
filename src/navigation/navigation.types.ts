import type { LucideIcon } from "lucide-react";

export type NavigationRole = string;

export interface NavigationItem {
  id: string;
  label: string;
  to: string;
  icon: LucideIcon;
  allowedRoles?: readonly NavigationRole[];
  match?: readonly string[];
  end?: boolean;
  mobilePriority?: number;
  featureFlag?: boolean;
  children?: readonly Omit<NavigationItem, "icon" | "children">[];
}

export interface ResolvedNavigationItem extends NavigationItem {
  badge?: number;
}

export type NavigationBadges = Readonly<Record<string, number | undefined>>;
