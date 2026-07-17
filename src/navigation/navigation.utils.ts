import type { NavSection } from "@/shared/layout/InternalLayout";
import type {
  NavigationBadges,
  NavigationItem,
  NavigationRole,
  ResolvedNavigationItem,
} from "./navigation.types";

const NAVIGATION_ROLE_ALIASES: Readonly<Record<string, string>> = {
  admin_company: "admin_compagnie",
  chefagence: "chefAgence",
};

export function normalizeNavigationRole(role: NavigationRole): NavigationRole {
  return NAVIGATION_ROLE_ALIASES[role] ?? role;
}

export function normalizeNavigationRoles(
  roles: NavigationRole | readonly NavigationRole[] | null | undefined,
): NavigationRole[] {
  const values = Array.isArray(roles) ? roles : roles ? [roles] : [];
  return [...new Set(values.map(normalizeNavigationRole))];
}

export function canDisplayNavigationItem(
  item: NavigationItem,
  roles: readonly NavigationRole[],
): boolean {
  if (item.featureFlag === false) return false;
  if (!item.allowedRoles?.length) return true;
  const normalizedAllowed = item.allowedRoles.map(normalizeNavigationRole);
  return roles.some((role) => normalizedAllowed.includes(normalizeNavigationRole(role)));
}

export function resolveNavigation(
  items: readonly NavigationItem[],
  roles: NavigationRole | readonly NavigationRole[] | null | undefined,
  badges: NavigationBadges = {},
): ResolvedNavigationItem[] {
  const normalizedRoles = normalizeNavigationRoles(roles);
  return items
    .filter((item) => canDisplayNavigationItem(item, normalizedRoles))
    .map((item) => ({
      ...item,
      badge: badges[item.id],
      children: item.children?.filter((child) =>
        canDisplayNavigationItem(child as NavigationItem, normalizedRoles),
      ),
    }));
}

function pathnameOnly(value: string): string {
  return value.split(/[?#]/, 1)[0].replace(/\/$/, "") || "/";
}

export function isNavigationItemActive(
  currentLocation: string,
  item: Pick<NavigationItem, "to" | "match" | "end">,
): boolean {
  const currentPath = pathnameOnly(currentLocation);
  const candidates = [item.to, ...(item.match ?? [])].map(pathnameOnly);
  return candidates.some((candidate) =>
    item.end
      ? currentPath === candidate
      : currentPath === candidate || currentPath.startsWith(`${candidate}/`),
  );
}

export function getMobileNavigation(items: readonly ResolvedNavigationItem[]) {
  const prioritized = items
    .filter((item) => typeof item.mobilePriority === "number")
    .sort((a, b) => (a.mobilePriority ?? 99) - (b.mobilePriority ?? 99));
  const primary = prioritized.slice(0, 4);
  const primaryIds = new Set(primary.map((item) => item.id));
  return { primary, secondary: items.filter((item) => !primaryIds.has(item.id)) };
}

export function toNavSections(items: readonly ResolvedNavigationItem[]): NavSection[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    icon: item.icon,
    path: item.to,
    match: item.match ? [...item.match] : undefined,
    badge: item.badge,
    end: item.end,
    mobilePriority: item.mobilePriority,
    children: item.children?.map((child) => ({
      label: child.label,
      path: child.to,
      end: child.end,
    })),
  }));
}
