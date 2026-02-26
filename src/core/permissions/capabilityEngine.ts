// src/core/permissions/capabilityEngine.ts
// Resolves the effective capabilities for a user by intersecting role and plan capabilities.
// Platform admins bypass plan restrictions entirely.

import type { Role } from "@/roles-permissions";
import type { Capability } from "./capabilities";
import { ALL_CAPABILITIES } from "./capabilities";
import { getRoleCapabilities } from "./roleCapabilities";
import type { Plan } from "@/core/subscription/plans";
import { getPlanCapabilities } from "@/core/subscription/plans";

const PLAN_BYPASS_ROLES: ReadonlySet<Role> = new Set([
  "admin_platforme",
]);

export function resolveCapabilities(
  role: Role,
  plan: Plan,
): Set<Capability> {
  if (PLAN_BYPASS_ROLES.has(role)) {
    return new Set(ALL_CAPABILITIES);
  }

  const roleCaps = getRoleCapabilities(role);
  const planCaps = getPlanCapabilities(plan);
  const planSet = new Set<Capability>(planCaps);

  return new Set(roleCaps.filter((c) => planSet.has(c)));
}

export function hasCapabilityInSet(
  capabilities: Set<Capability>,
  cap: Capability,
): boolean {
  return capabilities.has(cap);
}

export function hasAllCapabilities(
  capabilities: Set<Capability>,
  required: Capability[],
): boolean {
  return required.every((c) => capabilities.has(c));
}

export function hasAnyCapability(
  capabilities: Set<Capability>,
  required: Capability[],
): boolean {
  return required.some((c) => capabilities.has(c));
}
