// src/pages/AdminSidebarLayout.tsx
import React, { useMemo } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { LogOut, Building, Home, FileText, DollarSign, BarChart2, Settings, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type MenuItem = { label: string; icon: LucideIcon; path: string; end?: boolean };

const menuItems: MenuItem[] = [
  { label: "Tableau de bord", icon: Home, path: "dashboard", end: true },
  { label: "Compagnies", icon: Building, path: "compagnies" },
  { label: "Réservations", icon: FileText, path: "reservations" },
  { label: "Finances", icon: DollarSign, path: "finances" },
  { label: "Statistiques", icon: BarChart2, path: "statistiques" },
  { label: "Paramètres", icon: Settings, path: "parametres-platforme" },
];

const AdminSidebarLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const headerTitle = useMemo(() => {
    const seg = pathname.replace(/^\/+/, "").split("/");
    const key = seg[1] || "dashboard"; // après /admin/...
    const found = menuItems.find((m) => m.path === key) || menuItems[0];
    return found.label;
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Erreur déconnexion:", err);
    }
  };

  return (
    <div className="h-screen overflow-hidden">
      <div className="grid grid-cols-[16rem_1fr] h-full min-h-0">
        {/* === SIDEBAR FIXE === */}
        <aside className="bg-orange-600 text-white relative flex flex-col">
          {/* Logo */}
          <div className="px-5 py-4 border-b border-white/15 flex items-center gap-3 sticky top-0 z-10 bg-orange-600">
            <img
              src="/images/teliya-logo.jpg"
              alt="Teliya"
              className="w-9 h-9 rounded bg-white object-cover"
            />
            <span className="text-lg font-semibold tracking-wide">Teliya</span>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto px-2 pt-2 pb-20">
            <nav>
              {menuItems.map(({ label, icon: Icon, path, end }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={end}
                  className={({ isActive }) =>
                    [
                      "flex items-center gap-3 px-4 py-2 rounded-lg my-1 text-sm transition-colors",
                      isActive
                        ? "bg-white/20 font-semibold shadow-[inset_0_0_0_1px_rgba(255,255,255,.15)]"
                        : "hover:bg-white/10",
                    ].join(" ")
                  }
                >
                  <Icon className="w-5 h-5" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Utilisateur connecté (fixé en bas) */}
          <div className="sticky bottom-0 px-4 py-3 border-t border-white/15 bg-orange-700/95 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-white/20 grid place-items-center">
                  <User className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {user?.displayName || "Utilisateur"}
                  </p>
                  <p className="text-[11px] text-white/85 leading-tight">
                    Super Administrateur
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white text-orange-700 hover:bg-white/90 text-xs"
              >
                <LogOut className="w-4 h-4" />
                Déconnexion
              </button>
            </div>
          </div>
        </aside>

        {/* === COLONNE CONTENU === */}
        <div className="flex flex-col min-w-0 min-h-0">
          {/* Header sticky */}
          <header className="bg-orange-600 text-white sticky top-0 z-20">
            <div className="px-6 py-3 flex items-center justify-between">
              <h1 className="text-base font-medium">{headerTitle}</h1>
            </div>
          </header>

          {/* Contenu scrollable */}
          <main className="flex-1 min-h-0 overflow-y-auto bg-gray-50 p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminSidebarLayout;
