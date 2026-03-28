import { db } from "@/firebaseConfig";
import { doc, runTransaction, serverTimestamp } from "firebase/firestore";

export type ChefExceptionalValidationParams = {
  companyId: string;
  agencyId: string;
  shiftId: string;
  userId: string;
  userName: string;
  reason: string;
};

/**
 * Supervision only: trace an exceptional chef validation request when the
 * normal accounting flow is blocked. Does not replace accountant final validation.
 */
export async function chefExceptionalValidation(p: ChefExceptionalValidationParams): Promise<void> {
  const reason = p.reason.trim();
  if (reason.length < 8) {
    throw new Error("Motif trop court (8 caractères minimum).");
  }

  const ref = doc(db, "companies", p.companyId, "agences", p.agencyId, "shifts", p.shiftId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Session introuvable.");
    const s = snap.data() as Record<string, unknown>;
    if (s.lockedChef) throw new Error("Session déjà validée chef.");

    tx.update(ref, {
      exceptionalValidation: {
        requested: true,
        at: serverTimestamp(),
        by: { id: p.userId, name: p.userName },
        reason,
      },
      updatedAt: serverTimestamp(),
    });
  });
}
