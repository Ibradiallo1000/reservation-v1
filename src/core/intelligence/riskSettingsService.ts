// src/core/intelligence/riskSettingsService.ts
// Read risk settings from Firestore. Fallback to defaults if missing.

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  RISK_SETTINGS_COLLECTION,
  RISK_SETTINGS_DOC_ID,
  type RiskSettingsDoc,
  mergeWithDefaults,
} from "./riskSettings";

export async function getRiskSettings(companyId: string): Promise<RiskSettingsDoc> {
  const ref = doc(db, "companies", companyId, RISK_SETTINGS_COLLECTION, RISK_SETTINGS_DOC_ID);
  const snap = await getDoc(ref);
  if (!snap.exists()) return mergeWithDefaults(null);
  return mergeWithDefaults(snap.data() as Partial<RiskSettingsDoc>);
}
