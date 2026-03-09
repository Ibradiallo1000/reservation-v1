import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

export type CompanyNotificationType =
  | "expense_submitted"
  | "expense_approved"
  | "expense_rejected"
  | "expense_paid";

export interface CompanyNotificationInput {
  companyId: string;
  type: CompanyNotificationType;
  entityType: "expense";
  entityId: string;
  title: string;
  body: string;
  link?: string;
  expenseId?: string;
  agencyId?: string | null;
  targetUserId?: string | null;
  targetRole?: string | null;
}

function notificationsRef(companyId: string) {
  return collection(db, "companies", companyId, "notifications");
}

export async function createCompanyNotification(
  input: CompanyNotificationInput
): Promise<void> {
  await addDoc(notificationsRef(input.companyId), {
    type: input.type,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    body: input.body,
    link: input.link ?? null,
    expenseId: input.expenseId ?? null,
    agencyId: input.agencyId ?? null,
    targetUserId: input.targetUserId ?? null,
    targetRole: input.targetRole ?? null,
    read: false,
    createdAt: serverTimestamp(),
  });
}

export async function notifyCompanyRoles(params: {
  companyId: string;
  roles: string[];
  type: CompanyNotificationType;
  entityType: "expense";
  entityId: string;
  title: string;
  body: string;
  link?: string;
  expenseId?: string;
  agencyId?: string | null;
}): Promise<void> {
  const roles = Array.from(new Set(params.roles.filter(Boolean))).slice(0, 10);
  if (roles.length === 0) return;

  const usersSnap = await getDocs(
    query(
      collection(db, "users"),
      where("companyId", "==", params.companyId),
      where("role", "in", roles)
    )
  );

  const writes = usersSnap.docs.map((u) =>
    createCompanyNotification({
      companyId: params.companyId,
      type: params.type,
      entityType: params.entityType,
      entityId: params.entityId,
      title: params.title,
      body: params.body,
      link: params.link,
      expenseId: params.expenseId,
      agencyId: params.agencyId,
      targetUserId: u.id,
      targetRole: (u.data() as { role?: string }).role ?? null,
    })
  );
  await Promise.all(writes);
}
