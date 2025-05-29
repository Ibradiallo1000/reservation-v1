import React from 'react';
import { useLocation } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
}

const AdminSidebarLayout: React.FC<Props> = ({ children }) => {
  const location = useLocation();

  const links = [
    { label: 'Tableau de bord', path: '/admin/dashboard' },
    { label: 'Compagnies', path: '/admin/compagnies' },
    { label: 'Réservations', path: '/admin/reservations' },
    { label: 'Finances', path: '/admin/finances' },
    { label: 'Statistiques', path: '/admin/statistiques' },
    { label: 'Historique des ventes', path: '/admin/ventes' },
    { label: 'Dépenses journalières', path: '/admin/depenses' },
    { label: 'Messagerie', path: '/admin/messagerie' },
    { label: 'Paramètres', path: '/admin/parametres' },
    { label: 'Ajouter un personnel', path: '/admin/ajouter-personnel' },
    { label: 'Liste du personnel', path: '/admin/liste-personnel' },
  ];

  return (
    <div className="flex h-screen">
      <aside className="w-64 bg-white border-r">
        <nav className="p-4">
          {links.map((link, idx) => (
            <div
              key={idx}
              className={`mb-2 ${location.pathname === link.path ? 'font-semibold text-blue-600' : ''}`}
            >
              <a href={link.path}>{link.label}</a>
            </div>
          ))}
        </nav>
      </aside>
      <main className="flex-1 bg-gray-100 p-6 overflow-auto">{children}</main>
    </div>
  );
};

export default AdminSidebarLayout;
