// src/layouts/AdminSidebarLayout.tsx
import React from 'react';
import { Link } from 'react-router-dom';

const AdminSidebarLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-white shadow-lg p-4">
        <h2 className="text-lg font-bold mb-6">Admin Panel</h2>
        <ul className="space-y-3">
          <li><Link to="/admin/dashboard" className="text-blue-600">Tableau de bord</Link></li>
          <li><Link to="/admin/compagnies" className="text-blue-600">Compagnies</Link></li>
          <li><Link to="/admin/ajouter-compagnie" className="text-blue-600">Ajouter Compagnie</Link></li>
          <li><Link to="/admin/ajouter-trajet" className="text-blue-600">Ajouter Trajet</Link></li>
          {/* Ajoute ici d’autres liens si besoin */}
        </ul>
      </aside>

      {/* Contenu principal */}
      <main className="flex-1 bg-gray-100 p-6">
        {children}
      </main>
    </div>
  );
};

export default AdminSidebarLayout;
