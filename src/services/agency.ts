// src/services/agency.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebaseConfig"; // ton init Firebase

export async function createAgencyWithChief(payload: {
  companyId: string;
  agency: { nom: string; ville?: string; telephone?: string; adresse?: string };
  chief: { email: string; displayName?: string; phoneNumber?: string };
  sendPasswordReset?: boolean;
}) {
  const fn = httpsCallable(functions, "createAgencyWithChief");
  const res = await fn(payload);
  return res.data as {
    ok: boolean;
    agencyId: string;
    chiefUid: string;
    resetLink?: string | null;
  };
}
