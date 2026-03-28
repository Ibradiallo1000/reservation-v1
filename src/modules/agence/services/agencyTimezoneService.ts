import { doc, getDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { DEFAULT_AGENCY_TIMEZONE, resolveAgencyTimezone } from "@/shared/date/dateUtilsTz";

/**
 * Fuseau IANA de l'agence (document `companies/{companyId}/agences/{agencyId}`).
 * Ne modifie aucune donnée ; utilisé pour bornes de requêtes / KPI.
 */
export async function fetchAgencyTimezone(companyId: string, agencyId: string): Promise<string> {
  if (!companyId?.trim() || !agencyId?.trim()) return DEFAULT_AGENCY_TIMEZONE;
  try {
    const snap = await getDoc(doc(db, "companies", companyId, "agences", agencyId));
    if (!snap.exists()) return DEFAULT_AGENCY_TIMEZONE;
    return resolveAgencyTimezone(snap.data() as { timezone?: string | null });
  } catch {
    return DEFAULT_AGENCY_TIMEZONE;
  }
}
