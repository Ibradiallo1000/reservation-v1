import React, { useState, useMemo } from "react";
import { Link, Outlet, useLocation, matchPath } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/hooks/useCompanyTheme";
import {
  LayoutDashboard,
  MapPinned,
  Coins,
  Users,
  ClipboardList,
  LogOut,
  Wrench,
} from "lucide-react";

type MenuItem = {
  label: string;
  path: string;
  icon: React.ReactNode;
  permission?: string;
};

const AgenceSidebar: React.FC = () => {
  const { user, logout, hasPermission, company } = useAuth();
  const theme = useCompanyTheme(company);
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(true);

  const menuItems: MenuItem[] = useMemo(
    () => [
      { label: "Dashboard", path: "/agence/dashboard", icon: <LayoutDashboard />, permission: "view_dashboard" },
      { label: "Réservations", path: "/agence/reservations", icon: <ClipboardList />, permission: "manage_bookings" },
      { label: "Embarquement", path: "/agence/embarquement", icon: <MapPinned />, permission: "embarquement" },
      { label: "Trajets", path: "/agence/trajets", icon: <MapPinned />, permission: "manage_routes" },
      { label: "Recettes", path: "/agence/recettes", icon: <Coins />, permission: "manage_income" },
      { label: "Affectations", path: "/agence/affectations", icon: <Wrench />, permission: "garage_manage" },
      { label: "Personnel", path: "/agence/personnel", icon: <Users />, permission: "manage_staff" },
    ],
    []
  );

  const isActive = (path: string) =>
    !!matchPath({ path, end: false }, location.pathname);

  return (
    <div className="flex min-h-screen">
      <aside
        className={`fixed h-full w-64 flex flex-col`}
        style={{ backgroundColor: theme.primary, color: "#fff" }}
      >
        {/* ===== HEADER AGENCE ===== */}
        <div className="p-5 border-b border-white/20 flex items-center gap-3">
          {user?.agencyLogoUrl ? (
            <img
              src={user.agencyLogoUrl}
              alt={user.agencyNom}
              className="h-10 w-10 rounded-full object-cover"
            />
          ) : (
            <div
              className="h-10 w-10 rounded-full flex items-center justify-center font-bold"
              style={{ backgroundColor: theme.secondary }}
            >
              {user?.agencyNom?.[0] || "A"}
            </div>
          )}
          <div>
            <div className="text-lg font-bold">
              {user?.agencyNom || "Agence"}
            </div>
            <div className="text-xs opacity-80">
              {user?.agencyTelephone || ""}
            </div>
          </div>
        </div>

        {/* ===== MENU ===== */}
        <nav className="flex-1 py-4">
          <ul className="space-y-1 px-2">
            {menuItems.map((item) => {
              if (item.permission && !hasPermission(item.permission)) return null;
              const active = isActive(item.path);

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm ${
                      active ? "bg-white/20" : ""
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ===== FOOTER ===== */}
        <div className="p-4 border-t border-white/20">
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-white/10"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 bg-gray-50 p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default AgenceSidebar;
