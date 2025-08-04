import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LogOut, Building, Home, FileText, DollarSign, BarChart2, Settings, User
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const AdminSidebarLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const menuItems = [
    { label: "Tableau de bord", icon: Home, path: "/dashboard" },
    { label: "Compagnies", icon: Building, path: "/compagnies" },
    { label: "Réservations", icon: FileText, path: "/reservations" },
    { label: "Finances", icon: DollarSign, path: "/finances" },
    { label: "Statistiques", icon: BarChart2, path: "/statistiques" },
    { label: "Paramètres", icon: Settings, path: "/parametres-platforme" },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (err) {
      console.error("Erreur déconnexion:", err);
    }
  };

  return (
    <div className="flex min-h-screen bg-white">
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col relative">
        {/* En-tête simple */}
        <div className="p-6 flex items-center justify-center border-b">
          <span className="text-xl font-bold text-orange-600 tracking-wide">
            Espace Pro
          </span>
        </div>

        {/* Navigation */}
        <nav className="mt-6 flex-1">
          {menuItems.map(({ label, icon: Icon, path }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `flex items-center px-6 py-3 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-orange-50 text-orange-600 border-r-4 border-orange-600"
                    : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              <Icon className="h-5 w-5 mr-3" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Utilisateur connecté fixé en bas */}
        <div className="absolute bottom-0 left-0 w-full p-4 border-t bg-white">
          <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg shadow">
            <div className="flex items-center gap-3">
              <User className="w-8 h-8 text-orange-600" />
              <div>
                <p className="font-semibold text-gray-800">{user?.displayName || "Utilisateur"}</p>
                <p className="text-sm text-gray-500">Super Administrateur</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-2 rounded-lg text-xs"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 bg-gray-50 p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminSidebarLayout;
