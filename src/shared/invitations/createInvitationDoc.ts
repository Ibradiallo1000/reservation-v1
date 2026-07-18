/**
 * Teliya SaaS – Client-side invitation creation (Spark-compatible).
 *
 * Replaces the httpsCallable("createInvitation") Cloud Function with a
 * direct Firestore write. Works identically on Spark and Blaze plans.
 *
 * Each invitation gets a cryptographically random `token` that serves
 * as the activation URL parameter.
 */

import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

/* ------------------------------------------------------------------ */
/*  Token generation                                                   */
/* ------------------------------------------------------------------ */

function generateToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface CreateInvitationInput {
  email: string;
  role: string;
  companyId?: string;
  agencyId?: string;
  fullName?: string;
  phone?: string;
  createdBy?: string;
}

export interface CreateInvitationResult {
  inviteId: string;
  token: string;
  activationUrl: string;
}

/**
 * Creates a pending invitation in Firestore and returns the activation URL.
 *
 * @throws Error if a pending invitation already exists for the same email + scope.
 */
export async function createInvitationDoc(
  input: CreateInvitationInput,
): Promise<CreateInvitationResult> {
  const email = input.email.trim().toLowerCase();
  if (!email) throw new Error("Email est requis.");
  if (!input.role) throw new Error("Rôle est requis.");

  const normCompany = input.companyId?.trim() || "";
  const normAgency = input.agencyId?.trim() || "";

  // Check for duplicate pending invitation (same email + same company scope)
  const duplicateConstraints = [
    where("email", "==", email),
    where("status", "==", "pending"),
  ];
  if (normCompany) duplicateConstraints.push(where("companyId", "==", normCompany));
  if (normAgency) duplicateConstraints.push(where("agencyId", "==", normAgency));

  const pendingSnap = await getDocs(
    query(
      collection(db, "invitations"),
      ...duplicateConstraints,
    ),
  );

  const duplicate = pendingSnap.docs.find((d) => {
    const data = d.data();
    return (
      (data.companyId ?? "") === normCompany &&
      (data.agencyId ?? "") === normAgency
    );
  });

  if (duplicate) {
    throw Object.assign(
      new Error("Une invitation en attente existe déjà pour cet email dans ce périmètre."),
      { code: "already-exists" },
    );
  }

  // Build invitation document
  const token = generateToken();

  const inviteData: Record<string, unknown> = {
    email,
    role: input.role,
    status: "pending",
    token,
    createdAt: serverTimestamp(),
    createdBy: input.createdBy || "admin",
  };

  if (normCompany) inviteData.companyId = normCompany;
  if (normAgency) inviteData.agencyId = normAgency;
  if (input.fullName?.trim()) inviteData.fullName = input.fullName.trim();
  if (input.phone?.trim()) inviteData.phone = input.phone.trim();

  const docRef = doc(db, "invitations", token);
  await setDoc(docRef, inviteData);

  const activationUrl = `${window.location.origin}/accept-invitation/${token}`;

  return {
    inviteId: docRef.id,
    token,
    activationUrl,
  };
}
