// src/services/companies.ts
import { httpsCallable } from "firebase/functions";
import { functions } from "@/firebaseConfig";

type CreateAgencyPayload = {
  companyId: string;
  agency: {
    nomAgence: string;
    ville: string;
    pays: string;
    quartier?: string;
    type?: string;
    statut?: "active" | "inactive";
    latitude?: number | null;
    longitude?: number | null;
  };
  manager: {
    name: string;
    email: string;
    phone?: string;
  };
};

type CreateAgencyResult = {
  ok: boolean;
  agencyId: string;
  manager: { uid: string; resetLink?: string | null };
  mustRefreshToken?: boolean; // utile pour le chef quand il se connecte
};

export async function createAgencyWithChief(payload: CreateAgencyPayload) {
  const fn = httpsCallable(functions, "companyCreateAgencyCascade");
  const res = await fn(payload);
  return res.data as CreateAgencyResult;
}
