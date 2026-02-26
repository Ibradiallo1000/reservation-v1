// Treasury — Financial accounts. Balance MUST only be updated via financialMovements (increment in transaction).
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FinancialAccountType } from "./types";
import { agencyCashAccountId, companyBankAccountId } from "./types";

const COLLECTION = "financialAccounts";

export function financialAccountRef(companyId: string, accountId: string) {
  return doc(db, `companies/${companyId}/${COLLECTION}/${accountId}`);
}

export async function getAccount(
  companyId: string,
  accountId: string
): Promise<{ id: string; currentBalance: number; currency: string } | null> {
  const snap = await getDoc(financialAccountRef(companyId, accountId));
  if (!snap.exists()) return null;
  const d = snap.data();
  return {
    id: snap.id,
    currentBalance: Number(d?.currentBalance ?? 0),
    currency: String(d?.currency ?? ""),
  };
}

/** Phase C2: Ensure default agency_cash exists for an agency. No agency-level banks (all banks belong to company). Idempotent. */
export async function ensureDefaultAgencyAccounts(
  companyId: string,
  agencyId: string,
  currency: string,
  agencyName?: string
): Promise<void> {
  const cashId = agencyCashAccountId(agencyId);
  const base = { companyId, currency, isActive: true };
  const now = Timestamp.now();

  const cashRef = financialAccountRef(companyId, cashId);
  const cashSnap = await getDoc(cashRef);
  if (!cashSnap.exists()) {
    await setDoc(cashRef, {
      ...base,
      agencyId,
      accountType: "agency_cash",
      accountName: agencyName ? `Caisse ${agencyName}` : `Caisse agence ${agencyId}`,
      currentBalance: 0,
      createdAt: now,
      updatedAt: serverTimestamp(),
    });
  }
  // agency_bank no longer created; use company_bank for all bank accounts (Phase C2).
}

/** Ensure a company-level bank account exists (used when CEO adds a bank). Idempotent. */
export async function ensureCompanyBankAccount(
  companyId: string,
  companyBankDocId: string,
  accountName: string,
  currency: string
): Promise<void> {
  const accountId = companyBankAccountId(companyBankDocId);
  const ref = financialAccountRef(companyId, accountId);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  const now = Timestamp.now();
  await setDoc(ref, {
    companyId,
    agencyId: null,
    accountType: "company_bank",
    accountName,
    currency,
    currentBalance: 0,
    isActive: true,
    createdAt: now,
    updatedAt: serverTimestamp(),
  });
}

/** List accounts for company (optionally by agency). */
export async function listAccounts(
  companyId: string,
  options?: { agencyId?: string | null; accountType?: FinancialAccountType }
): Promise<{ id: string; agencyId: string | null; accountType: string; accountName: string; currentBalance: number; currency: string }[]> {
  const ref = collection(db, `companies/${companyId}/${COLLECTION}`);
  const constraints = [where("isActive", "==", true)];
  if (options?.agencyId !== undefined) {
    if (options.agencyId === null) constraints.push(where("agencyId", "==", null));
    else constraints.push(where("agencyId", "==", options.agencyId));
  }
  if (options?.accountType) constraints.push(where("accountType", "==", options.accountType));
  const q = query(ref, ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      agencyId: data.agencyId ?? null,
      accountType: data.accountType,
      accountName: data.accountName,
      currentBalance: Number(data.currentBalance ?? 0),
      currency: data.currency ?? "",
    };
  });
}
