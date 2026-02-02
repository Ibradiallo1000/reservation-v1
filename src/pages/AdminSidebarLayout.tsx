// src/pages/AdminSidebarLayout.tsx
import React, { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  LogOut,
  Building,
  Home,
  FileText,
  DollarSign,
  BarChart2,
  Settings,
  User,
  PanelLeftClose,
  PanelLeftOpen,
  Image as ImageIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type MenuItem = { label: string; icon: LucideIcon; path: string; end?: boolean };

const MENU: MenuItem[] = [
  { label: "Tableau de bord", icon: Home, path: "dashboard", end: true },
  { label: "Compagnies", icon: Building, path: "compagnies" },
  { label: "Réservations", icon: FileText, path: "reservations" },
  { label: "Finances", icon: DollarSign, path: "finances" },
  { label: "Statistiques", icon: BarChart2, path: "statistiques" },
  { label: "Plans & tarifs", icon: DollarSign, path: "plans" },
  { label: "Médias", icon: ImageIcon, path: "media" },
  { label: "Paramètres", icon: Settings, path: "parametres-platforme" },
];

const AdminSidebarLayout: React.FC = () => {
  const { user, logout } = useAuth() as any;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Titre header basé sur le segment juste après /admin/ (robuste aux sous-routes)
  const headerTitle = useMemo(() => {
    const seg = pathname.split("/").filter(Boolean);
    const key = seg[0] === "admin" ? (seg[1] || "dashboard") : "dashboard";
    const match = MENU.find((m) => m.path.split("/")[0] === key);
    return match?.label ?? "Tableau de bord";
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      console.error(e);
    }
  };

  const roleLabel =
    Array.isArray(user?.role) ? user.role.join(", ") : user?.role || "—";

  return (
    // app-root : s'assure que le fond couvre tout l'écran et évite bande visible
    <div className="app-root h-screen overflow-hidden bg-[hsl(var(--background))] bg-white">
      <div className="grid grid-cols-[auto_1fr] h-full min-h-0">
        {/* === SIDEBAR === */}
        <aside
          className={[
            "bg-orange-600 text-white relative flex flex-col min-h-screen z-30",
            "transition-all duration-300",
            collapsed ? "w-[84px]" : "w-64",
          ].join(" ")}
        >
          {/* Top bar */}
          <div className="px-4 py-4 border-b border-white/15 flex items-center justify-between sticky top-0 z-10 bg-orange-600">
            <div className="flex items-center gap-2 overflow-hidden">
              {/* ✅ Logo rond */}
              <img
                src="/images/teliya-logo.jpg"
                alt="Teliya"
                className="w-9 h-9 rounded-full bg-white object-cover shrink-0 p-[2px]"
              />
              {!collapsed && (
                <span className="text-lg font-semibold tracking-wide">Teliya</span>
              )}
            </div>
            <button
              onClick={() => setCollapsed((v) => !v)}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20"
              title={collapsed ? "Ouvrir" : "Réduire"}
            >
              {collapsed ? (
                <PanelLeftOpen className="w-5 h-5" />
              ) : (
                <PanelLeftClose className="w-5 h-5" />
              )}
            </button>
          </div>

          {/* Nav */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-3 pb-24">
            {MENU.map(({ label, icon: Icon, path, end }) => (
              <NavLink
                key={path}
                to={path} // relatif à /admin
                end={end}
                className={({ isActive }) =>
                  [
                    "group flex items-center gap-3 my-1 px-3 py-3 rounded-xl transition",
                    "whitespace-nowrap overflow-hidden",
                    isActive
                      ? "bg-white text-orange-700 font-semibold shadow-sm"
                      : "text-white/95 hover:bg-white/10",
                  ].join(" ")
                }
                title={label}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span className="truncate">{label}</span>}
              </NavLink>
            ))}
          </nav>

          {/* User + Déconnexion (bas) */}
          <div className="sticky bottom-0 px-4 py-3 border-t border-white/15 bg-orange-700/95 backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-full bg-white/20 grid place-items-center">
                  <User className="w-5 h-5" />
                </div>
                {!collapsed && (
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {user?.displayName || user?.email || "Utilisateur"}
                    </p>
                    <p className="text-[11px] text-white/85 leading-tight truncate">
                      {roleLabel}
                    </p>
                  </div>
                )}
              </div>
              <button
                onClick={handleLogout}
                className="w-9 h-9 rounded-full bg-white text-orange-700 hover:bg-white/90 grid place-items-center"
                title="Déconnexion"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* === COLONNE CONTENU === */}
        <div className="flex flex-col min-w-0 min-h-0">
          {/* Bandeau (sticky) */}
          <header className="bg-orange-600 text-white sticky top-0 z-20">
            <div className="px-6 py-3 flex items-center justify-between gap-4">
              <h1 className="text-base font-medium">{headerTitle}</h1>

              {/* ✅ Suppression du doublon (plus d’infos user + bouton logout en haut) */}
              <div className="h-6" />
            </div>
          </header>

          {/* Contenu emboîté */}
          <main className="flex-1 min-h-0 overflow-y-auto bg-[hsl(var(--background))] p-4 md:p-6">
            <div className="h-full flex items-stretch">
              <div className="bg-white w-full rounded-none md:rounded-l-3xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] border border-orange-100 overflow-hidden">
                <div className="p-4 md:p-6">
                  <Outlet />
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

export default AdminSidebarLayout;
