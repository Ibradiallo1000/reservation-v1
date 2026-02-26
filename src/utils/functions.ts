// src/utils/functions.ts
import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "../lib/firebaseClient"; // chemin relatif — fonctionne sans config tsconfig alias

const functions = getFunctions(app);

/**
 * createAgencyCallable
 * payload: { companyId: string, name: string, address?: string }
 * returns: Promise resolving to callable result (res.data)
 */
export const createAgencyCallable = async (payload: {
  companyId: string;
  name: string;
  address?: string | null;
}) => {
  const fn = httpsCallable(functions, "companyCreateAgencyCascade");
  const res = await fn(payload);
  return res.data;
};

