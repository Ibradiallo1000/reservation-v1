/**
 * Journal centralisé des actions d'agents (guichet, courrier, embarquement, compta).
 * Collection : companies/{companyId}/agences/{agencyId}/agentHistory
 *
 * Ne jamais faire échouer le flux métier : les erreurs d'écriture sont absorbées.
 */

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type AgentHistoryStatus = "EN_COURS" | "EN_ATTENTE" | "VALIDE" | "REJETE";

export type AgentHistoryMetadata = {
  expectedAmount?: number;
  declaredAmount?: number;
  difference?: number;
  paymentMethod?: string;
  /** Extensions sans casser le schéma */
  [key: string]: unknown;
};

export type CreateAgentHistoryEventInput = {
  companyId: string;
  agencyId: string;
  agentId: string;
  agentName?: string | null;
  role: string;
  type: string;
  referenceId: string;
  amount?: number;
  status: AgentHistoryStatus;
  metadata?: AgentHistoryMetadata;
  createdBy: string;
};

function omitUndefined<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

/**
 * Écrit un événement d'historique agent. Ne lance pas (log console en cas d'échec).
 */
export async function createAgentHistoryEvent(input: CreateAgentHistoryEventInput): Promise<void> {
  try {
    const col = collection(db, `companies/${input.companyId}/agences/${input.agencyId}/agentHistory`);
    const meta =
      input.metadata && Object.keys(input.metadata).length > 0
        ? omitUndefined(input.metadata as Record<string, unknown>)
        : undefined;
    await addDoc(col, {
      agentId: input.agentId,
      agentName: input.agentName ?? "",
      role: input.role,
      type: input.type,
      referenceId: input.referenceId,
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      status: input.status,
      ...(meta && Object.keys(meta).length > 0 ? { metadata: meta } : {}),
      createdAt: serverTimestamp(),
      createdBy: input.createdBy,
      companyId: input.companyId,
      agencyId: input.agencyId,
    });
  } catch (e) {
    console.warn("[agentHistory] createAgentHistoryEvent failed (non-blocking):", e);
  }
}

/** Variante fire-and-forget explicite pour les appels depuis le métier. */
export function logAgentHistoryEvent(input: CreateAgentHistoryEventInput): void {
  void createAgentHistoryEvent(input);
}
