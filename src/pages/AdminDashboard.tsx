// src/pages/AdminDashboard.tsx

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebaseConfig';

interface CompanyStat {
  companyId: string;
  companySlug: string;
  total: number;
  count: number;
  commission: number;
}

const links = [
  { title: 'Créer un membre du staff', path: '/admin/ajouter-personnel', description: 'Ajouter un utilisateur interne à la plateforme' },
  { title: 'Compagnies', path: '/admin/compagnies', description: 'Voir et gérer toutes les compagnies partenaires' },
  { title: 'Réservations', path: '/admin/reservations', description: 'Voir la liste complète des réservations reçues' },
  { title: 'Agents Créés', path: '/admin/agents', description: 'Voir les agents enregistrés dans le système' },
  { title: 'Finances globales', path: '/admin/finances', description: 'Suivez les revenus, dépenses et bénéfices de la compagnie.' },
  { title: 'Statistiques', path: '/admin/statistiques', description: "Consulter les statistiques d'utilisation du système" },
  { title: 'Historique des ventes', path: '/admin/ventes', description: "Voir l'historique complet des ventes par ville ou pays" },
  { title: 'Dépenses journalières', path: '/admin/depenses', description: "Ajouter et suivre les sorties d'argent quotidiennes." },
  { title: 'Messagerie', path: '/admin/messagerie', description: 'Répondez aux clients ou communiquez avec vos agents.' },
  { title: 'Paramètres', path: '/admin/parametres', description: 'Modifiez les préférences, le mot de passe ou le logo.' },
];

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<CompanyStat[]>([]);
  const [totalGlobal, setTotalGlobal] = useState({ total: 0, reservations: 0, commission: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const snapshot = await getDocs(collection(db, 'reservations'));
      let total = 0;
      let count = 0;
      let commission = 0;

      const grouped: Record<string, CompanyStat> = {};

      for (const docSnap of snapshot.docs) {
        const d = docSnap.data();
        const companyId = d.companyId || 'inconnu';
        const companySlug = d.companySlug || '—';
        const montant = d.total || 0;
        const comm = d.commission || 0;

        if (!grouped[companyId]) {
          grouped[companyId] = {
            companyId,
            companySlug,
            total: 0,
            count: 0,
            commission: 0,
          };
        }

        grouped[companyId].total += montant;
        grouped[companyId].commission += comm;
        grouped[companyId].count += 1;

        total += montant;
        commission += comm;
        count++;
      }

      setStats(Object.values(grouped));
      setTotalGlobal({ total, reservations: count, commission });
    };

    fetchStats();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Super Administrateur – Vue Globale Plateforme</h1>
      <p className="text-gray-600 mb-6">Gérez toutes les compagnies, agences et utilisateurs depuis cet espace.</p>

      {/* Récap global */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Total réservations</h2>
          <p className="text-xl font-bold text-blue-700">{totalGlobal.reservations}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Montant encaissé</h2>
          <p className="text-xl font-bold text-green-600">{totalGlobal.total.toLocaleString()} FCFA</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Commission générée</h2>
          <p className="text-xl font-bold text-orange-600">{totalGlobal.commission.toLocaleString()} FCFA</p>
        </div>
      </div>

      {/* Statistiques par compagnie */}
      <h2 className="text-lg font-semibold mb-4">Détail par compagnie</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((s, i) => (
          <div key={i} className="p-4 border rounded-lg shadow-sm bg-white">
            <h3 className="text-lg font-bold text-yellow-700 mb-1">{s.companySlug}</h3>
            <p className="text-sm text-gray-700">Réservations : {s.count}</p>
            <p className="text-sm text-gray-700">Montant : {s.total.toLocaleString()} FCFA</p>
            <p className="text-sm text-gray-700">Commission : {s.commission.toLocaleString()} FCFA</p>
          </div>
        ))}
      </div>

      {/* Liens vers les modules */}
      <h2 className="text-lg font-semibold mb-4">Modules de gestion</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {links.map((card, index) => (
          <Link
            to={card.path}
            key={index}
            className="p-4 border rounded-lg shadow-sm hover:shadow-md bg-white hover:bg-gray-50"
          >
            <h3 className="text-lg font-semibold text-orange-600 mb-1">{card.title}</h3>
            <p className="text-sm text-gray-600">{card.description}</p>
            to="/villes"📍 Villes
          </Link>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
