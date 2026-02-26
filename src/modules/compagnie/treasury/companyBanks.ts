// Banques de la compagnie — configurées par le CEO, utilisées pour les virements caisse → banque (comptables agence).
import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
  deleteDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { ensureCompanyBankAccount } from "./financialAccounts";
import { financialAccountRef } from "./financialAccounts";

const COLLECTION = "companyBanks";

function companyBanksRef(companyId: string) {
  return collection(db, `companies/${companyId}/${COLLECTION}`);
}

function companyBankRef(companyId: string, bankId: string) {
  return doc(db, `companies/${companyId}/${COLLECTION}/${bankId}`);
}

export interface CompanyBankDoc {
  id?: string;
  name: string;
  iban?: string | null;
  description?: string | null;
  currency: string;
  isActive: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export async function listCompanyBanks(companyId: string): Promise<(CompanyBankDoc & { id: string })[]> {
  const snap = await getDocs(companyBanksRef(companyId));
  return snap.docs
    .filter((d) => (d.data() as CompanyBankDoc).isActive !== false)
    .map((d) => ({ id: d.id, ...d.data() } as CompanyBankDoc & { id: string }));
}

export async function addCompanyBank(
  companyId: string,
  data: Omit<CompanyBankDoc, "id" | "createdAt" | "updatedAt">
): Promise<string> {
  const now = Timestamp.now();
  const ref = await addDoc(companyBanksRef(companyId), {
    ...data,
    isActive: data.isActive ?? true,
    createdAt: now,
    updatedAt: serverTimestamp(),
  });
  await ensureCompanyBankAccount(companyId, ref.id, data.name, data.currency);
  return ref.id;
}

export async function updateCompanyBank(
  companyId: string,
  bankId: string,
  data: Partial<Pick<CompanyBankDoc, "name" | "iban" | "description" | "currency" | "isActive">>
): Promise<void> {
  const ref = companyBankRef(companyId, bankId);
  const payload: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (data.name !== undefined) payload.name = data.name;
  if (data.iban !== undefined) payload.iban = data.iban;
  if (data.description !== undefined) payload.description = data.description;
  if (data.currency !== undefined) payload.currency = data.currency;
  if (data.isActive !== undefined) payload.isActive = data.isActive;
  await updateDoc(ref, payload as any);
  if (data.name != null) {
    const accRef = financialAccountRef(companyId, `company_bank_${bankId}`);
    const snap = await getDoc(accRef);
    if (snap.exists()) {
      const { updateDoc: u } = await import("firebase/firestore");
      await u(accRef, { accountName: data.name, updatedAt: serverTimestamp() } as any);
    }
  }
}

/** Désactive la banque et le compte financier (on ne supprime pas pour garder l’historique). */
export async function deactivateCompanyBank(companyId: string, bankId: string): Promise<void> {
  await updateCompanyBank(companyId, bankId, { isActive: false });
  const accRef = financialAccountRef(companyId, `company_bank_${bankId}`);
  const snap = await getDoc(accRef);
  if (snap.exists()) {
    const { updateDoc: u } = await import("firebase/firestore");
    await u(accRef, { isActive: false, updatedAt: serverTimestamp() } as any);
  }
}
