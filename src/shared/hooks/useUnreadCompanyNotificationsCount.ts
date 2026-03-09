import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "@/firebaseConfig";

const EXPENSE_NOTIFICATION_TYPES = new Set([
  "expense_submitted",
  "expense_approved",
  "expense_rejected",
  "expense_paid",
]);

function canSeeNotification(
  notification: { targetUserId?: string | null; targetRole?: string | null },
  userId?: string | null,
  role?: string | null,
): boolean {
  const targetUserId = String(notification.targetUserId ?? "").trim();
  const targetRole = String(notification.targetRole ?? "").trim();
  const normalizedRole = String(role ?? "").trim();
  const normalizedUserId = String(userId ?? "").trim();

  if (!targetUserId && !targetRole) return true;
  if (targetUserId && targetUserId === normalizedUserId) return true;
  if (targetRole && targetRole === normalizedRole) return true;
  return false;
}

export function useUnreadCompanyNotificationsCount(
  companyId?: string | null,
  userId?: string | null,
  role?: string | null,
): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!companyId) {
      setCount(0);
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "notifications"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        let unread = 0;
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() as {
            type?: string;
            read?: boolean;
            targetUserId?: string | null;
            targetRole?: string | null;
          };
          if (!EXPENSE_NOTIFICATION_TYPES.has(String(data.type ?? ""))) return;
          if (!canSeeNotification(data, userId, role)) return;
          if (data.read !== true) unread += 1;
        });
        setCount(unread);
      },
      (error) => {
        console.error("[useUnreadCompanyNotificationsCount] Snapshot error:", error);
        setCount(0);
      },
    );

    return () => unsubscribe();
  }, [companyId, userId, role]);

  return count;
}
