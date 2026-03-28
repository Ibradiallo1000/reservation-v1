/**
 * Chargement fiable des infos compagnie côté parcours public :
 * 1) sessionStorage (`companyInfo`) si id cohérent avec companyId attendu
 * 2) sinon Firestore `companies/{companyId}`
 * Ne pas utiliser le résultat si ok === false — afficher l’erreur à la place.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export const PUBLIC_COMPANY_INFO_SESSION_KEY = "companyInfo";

export interface PublicCompanyInfoBase {
  id: string;
  name: string;
  primaryColor?: string;
  secondaryColor?: string;
  couleurPrimaire?: string;
  couleurSecondaire?: string;
  logoUrl?: string;
  slug?: string;
  telephone?: string;
}

function mapFirestoreCompanyDoc(companyId: string, companyData: Record<string, unknown>): PublicCompanyInfoBase {
  const name =
    String(companyData.nom ?? companyData.name ?? "").trim() || "Compagnie";
  return {
    id: companyId,
    name,
    primaryColor: (companyData.primaryColor as string) || (companyData.couleurPrimaire as string),
    secondaryColor: (companyData.secondaryColor as string) || (companyData.couleurSecondaire as string),
    couleurPrimaire: companyData.couleurPrimaire as string | undefined,
    couleurSecondaire: companyData.couleurSecondaire as string | undefined,
    logoUrl: (companyData.logoUrl as string) || "",
    slug: (companyData.slug as string) || undefined,
    telephone: (companyData.telephone as string) || undefined,
  };
}

/** Parse sessionStorage si JSON valide, id === companyId, et nom présent. */
export function tryParseCompanyInfoFromSession(
  companyId: string,
  sessionKey: string = PUBLIC_COMPANY_INFO_SESSION_KEY
): PublicCompanyInfoBase | null {
  const cid = String(companyId ?? "").trim();
  if (!cid || typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || String(parsed.id ?? "").trim() !== cid) return null;
    const name = String(parsed.name ?? parsed.nom ?? "").trim();
    if (!name) return null;
    return {
      id: cid,
      name,
      primaryColor: parsed.primaryColor as string | undefined,
      secondaryColor: parsed.secondaryColor as string | undefined,
      couleurPrimaire: parsed.couleurPrimaire as string | undefined,
      couleurSecondaire: parsed.couleurSecondaire as string | undefined,
      logoUrl: (parsed.logoUrl as string) || "",
      slug: (parsed.slug as string) || undefined,
      telephone: (parsed.telephone as string) || undefined,
    };
  } catch {
    return null;
  }
}

/**
 * 1) sessionStorage (même companyId)
 * 2) Firestore
 */
export async function loadPublicCompanyInfoSessionThenFirestore(
  companyId: string | null | undefined
): Promise<{ ok: true; info: PublicCompanyInfoBase } | { ok: false; message: string }> {
  const cid = String(companyId ?? "").trim();
  if (!cid) {
    return {
      ok: false,
      message: "Identifiant compagnie manquant. Reprenez la réservation depuis l’accueil.",
    };
  }

  const fromSession = tryParseCompanyInfoFromSession(cid);
  if (fromSession) {
    return { ok: true, info: fromSession };
  }

  const snap = await getDoc(doc(db, "companies", cid));
  if (!snap.exists()) {
    return {
      ok: false,
      message:
        "Impossible de charger les informations de la compagnie. Vérifiez votre connexion ou reprenez depuis l’accueil.",
    };
  }
  const info = mapFirestoreCompanyDoc(snap.id, snap.data() as Record<string, unknown>);
  return { ok: true, info };
}

export type PublicPaymentMethods = Record<
  string,
  { logoUrl?: string; url?: string; ussdPattern?: string; merchantNumber?: string } | null | undefined
>;

/** Fusionne moyens de paiement + champs frais depuis Firestore (page upload preuve). */
export async function enrichPublicCompanyForUploadPreuve(
  base: PublicCompanyInfoBase
): Promise<
  PublicCompanyInfoBase & {
    paymentMethods: PublicPaymentMethods;
  }
> {
  const [pmSnap, cSnap] = await Promise.all([
    getDocs(query(collection(db, "paymentMethods"), where("companyId", "==", base.id))),
    getDoc(doc(db, "companies", base.id)),
  ]);

  if (!cSnap.exists()) {
    throw new Error("Compagnie introuvable dans Firestore.");
  }

  const methods: PublicPaymentMethods = {};
  pmSnap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.name) {
      methods[data.name as string] = {
        logoUrl: data.logoUrl || "",
        url: data.defaultPaymentUrl || "",
        ussdPattern: data.ussdPattern || "",
        merchantNumber: data.merchantNumber || "",
      };
    }
  });

  const companyData = cSnap.data() as Record<string, unknown>;
  const fresh = mapFirestoreCompanyDoc(cSnap.id, companyData);

  return {
    ...base,
    ...fresh,
    paymentMethods: methods,
    primaryColor:
      (companyData.primaryColor as string) ||
      (companyData.couleurPrimaire as string) ||
      base.primaryColor ||
      "#3b82f6",
    secondaryColor:
      (companyData.secondaryColor as string) ||
      (companyData.couleurSecondaire as string) ||
      base.secondaryColor ||
      "#93c5fd",
    logoUrl: (companyData.logoUrl as string) || base.logoUrl || "",
  };
}
