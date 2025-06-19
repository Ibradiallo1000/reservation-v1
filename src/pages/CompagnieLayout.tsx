// ✅ CompagnieLayout.tsx - version rapide avec Link + icônes harmonisées
import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, Building, MapPinned, Mail, Users, ClipboardList, Settings, Image, Wallet, BarChart2, MessageSquare } from 'lucide-react';

const CompagnieLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <aside className="w-64 bg-white shadow-md hidden md:block">
        <div className="p-4 font-bold text-lg border-b">Espace Compagnie</div>
        <nav className="flex flex-col p-4 space-y-2 text-sm">
          <Link to="/compagnie/dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="w-4 h-4" /> Tableau de bord
          </Link>
          <Link to="/compagnie/agences" className="flex items-center gap-2">
            <Building className="w-4 h-4" /> Agences
          </Link>
          <Link to="/compagnie/trajets" className="flex items-center gap-2">
            <MapPinned className="w-4 h-4" /> Trajets
          </Link>
          <Link to="/compagnie/courriers" className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Courriers
          </Link>
          <Link to="/compagnie/messages" className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Messages clients
          </Link>
          <Link to="/compagnie/personnel" className="flex items-center gap-2">
            <Users className="w-4 h-4" /> Personnel
          </Link>
          <Link to="/compagnie/reservations" className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" /> Réservations
          </Link>
          <Link to="/compagnie/images" className="flex items-center gap-2">
            <Image className="w-4 h-4" /> Bibliothèque d’images
          </Link>
          <Link to="/compagnie/finances" className="flex items-center gap-2">
            <Wallet className="w-4 h-4" /> Finances
          </Link>
          <Link to="/compagnie/statistiques" className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4" /> Statistiques
          </Link>
          <Link to="/compagnie/parametres" className="flex items-center gap-2">
            <Settings className="w-4 h-4" /> Paramètres
          </Link>
        </nav>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  );
};

export default CompagnieLayout;
