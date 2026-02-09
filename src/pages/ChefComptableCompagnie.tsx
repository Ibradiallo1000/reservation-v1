// src/pages/ChefComptableCompagnie.tsx

import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  CreditCard,
  BarChart3,
  FileText,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Layout – Chef Comptable Compagnie
 * Rôle : company_accountant / financial_director
 */
const ChefComptableCompagnie: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition
     ${
       isActive
         ? "bg-blue-600 text-white"
         : "text-gray-700 hover:bg-gray-100"
     }`;

  return (
    <div className="min-h-screen flex bg-gray-50">
      {/* ================= SIDEBAR ================= */}
      <aside className="w-64 bg-white border-r flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b">
          <h1 className="text-lg font-bold text-gray-900">
            Comptabilité – Compagnie
          </h1>
          <p className="text-xs text-gray-500 truncate">
            {user?.email}
          </p>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          <NavLink to="/comptable" end className={navItemClass}>
            <LayoutDashboard className="h-4 w-4" />
            Tableau de bord
          </NavLink>

          <NavLink
            to="/comptable/reservations-en-ligne"
            className={navItemClass}
          >
            <CreditCard className="h-4 w-4" />
            Réservations en ligne
          </NavLink>

          <NavLink
            to="/comptable/finances"
            className={navItemClass}
          >
            <BarChart3 className="h-4 w-4" />
            Finances
          </NavLink>

          <NavLink
            to="/comptable/rapports"
            className={navItemClass}
          >
            <FileText className="h-4 w-4" />
            Rapports
          </NavLink>

          <NavLink
            to="/comptable/parametres"
            className={navItemClass}
          >
            <Settings className="h-4 w-4" />
            Paramètres
          </NavLink>
        </nav>

        {/* Footer */}
        <div className="border-t p-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 rounded-lg
                       text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ================= CONTENT ================= */}
      <main className="flex-1 flex flex-col">
        {/* Header top */}
        <header className="h-14 bg-white border-b flex items-center px-6">
          <h2 className="text-sm font-semibold text-gray-800">
            Espace Chef Comptable – Compagnie
          </h2>
        </header>

        {/* Pages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default ChefComptableCompagnie;
