import React from "react";
import { Bell } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useUnreadCompanyNotificationsCount } from "@/shared/hooks/useUnreadCompanyNotificationsCount";

interface NotificationsBellProps {
  companyId?: string | null;
  userId?: string | null;
  role?: string | null;
}

export default function NotificationsBell({
  companyId,
  userId,
  role,
}: NotificationsBellProps) {
  const unreadCount = useUnreadCompanyNotificationsCount(companyId, userId, role);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isActive = Boolean(companyId && pathname === `/compagnie/${companyId}/notifications`);

  return (
    <button
      type="button"
      onClick={() => {
        if (!companyId) return;
        navigate(`/compagnie/${companyId}/notifications`);
      }}
      className="relative p-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-gray-50 dark:hover:bg-slate-600 transition text-gray-600 dark:text-slate-300"
      title="Notifications"
      aria-label="Notifications"
      aria-current={isActive ? "page" : undefined}
    >
      <Bell className="w-4 h-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] font-semibold text-center">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}
