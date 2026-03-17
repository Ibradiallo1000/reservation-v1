/**
 * Agent code system: unique code per agent per agency.
 * Stored in: companies/{companyId}/agences/{agencyId}/users/{agentId}.agentCode
 *
 * Rules:
 * - Guichetier → G01, G02, G03...
 * - Comptable (agency_accountant) → C01, C02...
 * - Embarquement (chefEmbarquement) → E01, E02...
 *
 * Counters: companies/{companyId}/agences/{agencyId}/counters/agentCode_{role}
 */

import { doc, getDoc, setDoc, getDocs, collection, updateDoc, Timestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const ROLES_WITH_AGENT_CODE = ["guichetier", "agency_accountant", "chefEmbarquement"] as const;
export type AgentCodeRole = (typeof ROLES_WITH_AGENT_CODE)[number];

const PREFIX_BY_ROLE: Record<AgentCodeRole, string> = {
  guichetier: "G",
  agency_accountant: "C",
  chefEmbarquement: "E",
};

/** Returns the prefix for a role, or null if the role does not get an agent code. */
export function getAgentCodePrefix(role: string): string | null {
  if (ROLES_WITH_AGENT_CODE.includes(role as AgentCodeRole)) {
    return PREFIX_BY_ROLE[role as AgentCodeRole];
  }
  return null;
}

/** Whether the role receives an auto-generated agentCode (G01, C01, E01...). */
export function roleHasAgentCode(role: string): role is AgentCodeRole {
  return ROLES_WITH_AGENT_CODE.includes(role as AgentCodeRole);
}

/**
 * Allocates the next agent code for the given role in the agency.
 * Format: G01, G02, C01, E01 (prefix + 2 digits).
 */
export async function allocateAgentCode(
  companyId: string,
  agencyId: string,
  role: string
): Promise<string | null> {
  const prefix = getAgentCodePrefix(role);
  if (!prefix) return null;

  const counterKey = `agentCode_${role}`;
  const counterRef = doc(db, "companies", companyId, "agences", agencyId, "counters", counterKey);

  try {
    const snap = await getDoc(counterRef);
    let seq = 1;
    if (snap.exists() && typeof snap.data()?.lastSeq === "number") {
      seq = snap.data()!.lastSeq + 1;
    }
    await setDoc(counterRef, { lastSeq: seq, updatedAt: Timestamp.now() }, { merge: true });
    return prefix + String(seq).padStart(2, "0");
  } catch (err) {
    console.error("[agentCodeService] allocateAgentCode:", err);
    return null;
  }
}

/**
 * Migration: for all users in the agency subcollection without agentCode,
 * generate one by role (guichetier, agency_accountant, chefEmbarquement) and save.
 * Does not remove or overwrite existing agents.
 */
export async function migrateAgentsAgentCode(
  companyId: string,
  agencyId: string
): Promise<{ updated: number; errors: number }> {
  const usersRef = collection(db, "companies", companyId, "agences", agencyId, "users");
  const snap = await getDocs(usersRef);
  let updated = 0;
  let errors = 0;

  for (const d of snap.docs) {
    const data = d.data();
    if (data.agentCode) continue;
    const role = data.role || "";
    if (!roleHasAgentCode(role)) continue;

    const code = await allocateAgentCode(companyId, agencyId, role);
    if (!code) {
      errors++;
      continue;
    }
    try {
      await updateDoc(d.ref, { agentCode: code });
      updated++;
    } catch (e) {
      console.error("[agentCodeService] migrate update failed:", d.id, e);
      errors++;
    }
  }

  if (updated > 0 || errors > 0) {
    console.log(`[agentCodeService] Migration ${companyId}/${agencyId}: ${updated} mis à jour, ${errors} erreurs.`);
  }
  return { updated, errors };
}
