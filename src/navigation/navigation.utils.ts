import type { NavSection } from "@/shared/layout/InternalLayout";
import type {
  NavigationBadges,
  NavigationItem,
  NavigationRole,
  ResolvedNavigationItem,
} from "./navigation.types";
import { normalizeRole, normalizeRoles } from "@/authorization/roles";
import type { CanonicalRole } from "@/authorization/roles";

export function normalizeNavigationRole(role: string): NavigationRole | null {
  return normalizeRole(role);
}

export function normalizeNavigationRoles(
  roles: unknown,
) {
  return normalizeRoles(roles);
}

export function canDisplayNavigationItem(
  item: NavigationItem,
  roles: readonly NavigationRole[],
): boolean {
  if (item.featureFlag === false) return false;
  if (!item.allowedRoles?.length) return true;
  const normalizedAllowed = item.allowedRoles
    .map(normalizeRole)
    .filter((role): role is CanonicalRole => role !== null);
  return roles.some((role) => normalizedAllowed.some((allowedRole) => allowedRole === role));
}

export function resolveNavigation(
  items: readonly NavigationItem[],
  roles: unknown,
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
