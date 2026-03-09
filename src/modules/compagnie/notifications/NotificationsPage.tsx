import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { collection, onSnapshot, orderBy, query, serverTimestamp, Timestamp, updateDoc, doc } from "firebase/firestore";
import { Bell, CheckCheck } from "lucide-react";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, StatusBadge } from "@/ui";

type ExpenseNotificationType =
  | "expense_submitted"
  | "expense_approved"
  | "expense_rejected"
  | "expense_paid";

interface NotificationRow {
  id: string;
  type: ExpenseNotificationType;
  message: string;
  createdAt: Timestamp | null;
  read: boolean;
  targetUserId?: string | null;
  targetRole?: string | null;
}

const ALLOWED_TYPES = new Set<ExpenseNotificationType>([
  "expense_submitted",
  "expense_approved",
  "expense_rejected",
  "expense_paid",
]);

const TYPE_LABEL: Record<ExpenseNotificationType, string> = {
  expense_submitted: "Dépense soumise",
  expense_approved: "Dépense approuvée",
  expense_rejected: "Dépense refusée",
  expense_paid: "Dépense payée",
};

function canSeeNotification(
  row: Pick<NotificationRow, "targetUserId" | "targetRole">,
  userId?: string | null,
  role?: string | null,
) {
  const targetUserId = String(row.targetUserId ?? "").trim();
  const targetRole = String(row.targetRole ?? "").trim();
  const normalizedUserId = String(userId ?? "").trim();
  const normalizedRole = String(role ?? "").trim();
  if (!targetUserId && !targetRole) return true;
  if (targetUserId && targetUserId === normalizedUserId) return true;
  if (targetRole && targetRole === normalizedRole) return true;
  return false;
}

function formatDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  const date = ts.toDate();
  return date.toLocaleString("fr-FR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationsPage() {
  const { user } = useAuth() as any;
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const [rows, setRows] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "companies", companyId, "notifications"),
      orderBy("createdAt", "desc"),
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const next: NotificationRow[] = snap.docs
          .map((d) => {
            const data = d.data() as {
              type?: string;
              title?: string;
              body?: string;
              message?: string;
              createdAt?: Timestamp | null;
              read?: boolean;
              targetUserId?: string | null;
              targetRole?: string | null;
            };
            const type = String(data.type ?? "") as ExpenseNotificationType;
            if (!ALLOWED_TYPES.has(type)) return null;
            const row: NotificationRow = {
              id: d.id,
              type,
              message: String(data.message ?? data.body ?? data.title ?? ""),
              createdAt: data.createdAt ?? null,
              read: data.read === true,
              targetUserId: data.targetUserId ?? null,
              targetRole: data.targetRole ?? null,
            };
            if (!canSeeNotification(row, user?.uid, user?.role)) return null;
            return row;
          })
          .filter((row): row is NotificationRow => row !== null);

        setRows(next);
        setLoading(false);
        setError(null);
      },
      (e) => {
        setLoading(false);
        setError(e instanceof Error ? e.message : "Erreur de chargement des notifications.");
      },
    );

    return () => unsubscribe();
  }, [companyId, user?.uid, user?.role]);

  const unreadCount = useMemo(() => rows.filter((r) => !r.read).length, [rows]);

  const markAsRead = async (id: string) => {
    if (!companyId) return;
    try {
      await updateDoc(doc(db, "companies", companyId, "notifications", id), {
        read: true,
        readAt: serverTimestamp(),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impossible de marquer la notification comme lue.");
    }
  };

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Centre de notifications"
        subtitle="Suivi des événements de dépenses"
        icon={Bell}
      />

      <SectionCard
        title="Notifications"
        icon={Bell}
        right={
          <StatusBadge status={unreadCount > 0 ? "warning" : "success"}>
            {unreadCount} non lue{unreadCount > 1 ? "s" : ""}
          </StatusBadge>
        }
      >
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-gray-500">Chargement...</div>
        ) : rows.length === 0 ? (
          <div className="py-8 text-center text-gray-500">Aucune notification.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.id}
                className={`rounded-lg border px-4 py-3 ${row.read ? "bg-white border-gray-200" : "bg-orange-50 border-orange-200"}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <StatusBadge status={row.read ? "neutral" : "warning"}>
                        {TYPE_LABEL[row.type]}
                      </StatusBadge>
                      {!row.read && <span className="text-xs font-semibold text-orange-700">Nouveau</span>}
                    </div>
                    <p className="text-sm text-gray-800 break-words">{row.message || "Notification de dépense."}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(row.createdAt)}</p>
                  </div>

                  {!row.read && (
                    <ActionButton
                      type="button"
                      onClick={() => void markAsRead(row.id)}
                      className="whitespace-nowrap"
                    >
                      <CheckCheck className="h-4 w-4" />
                      Marquer lu
                    </ActionButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
}
