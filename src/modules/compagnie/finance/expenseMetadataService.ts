import {
  addDoc,
  collection,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export interface SupplierDoc {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
}

export interface ExpenseCategoryDoc {
  id: string;
  code: string;
  label: string;
  isActive: boolean;
}

function suppliersRef(companyId: string) {
  return collection(db, "companies", companyId, "suppliers");
}

function categoriesRef(companyId: string) {
  return collection(db, "companies", companyId, "expenseCategories");
}

export async function listSuppliers(companyId: string): Promise<SupplierDoc[]> {
  const snap = await getDocs(
    query(
      suppliersRef(companyId),
      where("isActive", "==", true),
      orderBy("name", "asc")
    )
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: String(data.name ?? ""),
      phone: (data.phone as string | null) ?? null,
      email: (data.email as string | null) ?? null,
      isActive: Boolean(data.isActive ?? true),
    };
  });
}

export async function createSupplier(params: {
  companyId: string;
  name: string;
  phone?: string;
  email?: string;
  createdBy?: string;
}): Promise<string> {
  const ref = await addDoc(suppliersRef(params.companyId), {
    name: params.name.trim(),
    phone: params.phone?.trim() || null,
    email: params.email?.trim() || null,
    isActive: true,
    createdBy: params.createdBy ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listExpenseCategories(
  companyId: string
): Promise<ExpenseCategoryDoc[]> {
  const snap = await getDocs(
    query(
      categoriesRef(companyId),
      where("isActive", "==", true),
      orderBy("label", "asc")
    )
  );
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      code: String(data.code ?? ""),
      label: String(data.label ?? ""),
      isActive: Boolean(data.isActive ?? true),
    };
  });
}

export async function createExpenseCategory(params: {
  companyId: string;
  code: string;
  label: string;
  createdBy?: string;
}): Promise<string> {
  const ref = await addDoc(categoriesRef(params.companyId), {
    code: params.code.trim(),
    label: params.label.trim(),
    isActive: true,
    createdBy: params.createdBy ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}
