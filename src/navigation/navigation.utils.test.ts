import { describe, expect, it } from "vitest";
import { Home, Settings } from "lucide-react";
import {
  getMobileNavigation,
  isNavigationItemActive,
  normalizeNavigationRoles,
  resolveNavigation,
} from "./navigation.utils";
import type { NavigationItem } from "./navigation.types";

const items: NavigationItem[] = [
  { id: "home", label: "Accueil", icon: Home, to: "/espace", end: true, mobilePriority: 1, allowedRoles: ["admin_compagnie"] },
  { id: "settings", label: "Configuration", icon: Settings, to: "/espace/configuration", match: ["/espace/settings"], allowedRoles: ["admin_compagnie"] },
  { id: "deferred", label: "Flotte", icon: Settings, to: "/espace/flotte", featureFlag: false },
  { id: "accounting", label: "Comptabilité", icon: Settings, to: "/espace/comptabilite", allowedRoles: ["company_accountant"] },
];

describe("navigation par rôle", () => {
  it("reconnaît uniquement les aliases historiques documentés", () => {
    expect(normalizeNavigationRoles(["admin_company", "chefagence", "role_inconnu"]))
      .toEqual(["admin_compagnie", "chefAgence", "role_inconnu"]);
  });

  it("utilise un alias pour l’affichage sans exposer une destination comptable", () => {
    const resolved = resolveNavigation(items, "admin_company");
    expect(resolved.map((item) => item.id)).toEqual(["home", "settings"]);
  });

  it("retire les features désactivées et les destinations non autorisées", () => {
    expect(resolveNavigation(items, "role_inconnu")).toEqual([]);
  });

  it("marque une sous-route et un alias, mais respecte une entrée exacte", () => {
    expect(isNavigationItemActive("/espace/configuration/detail", items[1])).toBe(true);
    expect(isNavigationItemActive("/espace/settings?tab=profil", items[1])).toBe(true);
    expect(isNavigationItemActive("/espace/configuration", items[0])).toBe(false);
  });

  it("sépare les priorités mobiles du menu Plus", () => {
    const resolved = resolveNavigation(items, "admin_compagnie");
    const mobile = getMobileNavigation(resolved);
    expect(mobile.primary.map((item) => item.id)).toEqual(["home"]);
    expect(mobile.secondary.map((item) => item.id)).toEqual(["settings"]);
  });

  it("retourne une navigation vide pour un rôle ou un contexte absent", () => {
    expect(resolveNavigation(items, undefined)).toEqual([]);
    expect(resolveNavigation(items, [])).toEqual([]);
  });
});
