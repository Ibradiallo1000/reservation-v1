import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, getDocs, collectionGroup } from "firebase/firestore";
import { db } from "../firebaseConfig";

interface Company {
  id: string;
  nom: string;
  slug: string;
  plan: string;
  status: string;
}

interface CompanyStat {
  companyId: string;
  companySlug: string;
  companyName: string;
  plan: string;
  total: number;
  count: number;
  commission: number;
}

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<CompanyStat[]>([]);
  const [totalGlobal, setTotalGlobal] = useState({
    total: 0,
    reservations: 0,
    commission: 0,
    compagnies: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // 🔹 Étape 1 : récupérer toutes les compagnies
        const companiesSnap = await getDocs(collection(db, "companies"));
        const companies: Company[] = companiesSnap.docs.map((doc) => ({
          id: doc.id,
          nom: doc.data().nom || "Compagnie",
          slug: doc.data().slug || "—",
          plan: doc.data().plan || "free",
          status: doc.data().status || "actif",
        }));

        // 🔹 Étape 2 : récupérer toutes les réservations
        const reservationsSnap = await getDocs(collectionGroup(db, "reservations"));

        let total = 0;
        let count = 0;
        let commission = 0;
        const grouped: Record<string, CompanyStat> = {};

        for (const docSnap of reservationsSnap.docs) {
          const d = docSnap.data();
          const companyId = d.companyId || "inconnu";
          const montant = d.total || d.montant || 0;
          const comm = d.commission || 0;

          if (!grouped[companyId]) {
            grouped[companyId] = {
              companyId,
              companySlug: d.companySlug || "—",
              companyName: d.companyName || "Compagnie",
              plan: d.plan || "free",
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

        // 🔹 Étape 3 : fusionner stats + compagnies
        const mergedStats: CompanyStat[] = companies.map((c) => ({
          companyId: c.id,
          companySlug: c.slug,
          companyName: c.nom,
          plan: c.plan,
          total: grouped[c.id]?.total || 0,
          count: grouped[c.id]?.count || 0,
          commission: grouped[c.id]?.commission || 0,
        }));

        setStats(mergedStats);
        setTotalGlobal({
          total,
          reservations: count,
          commission,
          compagnies: companies.length,
        });
      } catch (err) {
        console.error("Erreur lors du chargement des stats:", err);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">
        Tableau de bord – Administration plateforme
      </h1>
      <p className="text-gray-600 mb-6">
        Suivi global des compagnies, abonnements et revenus.
      </p>

      {/* Récap global */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Total compagnies</h2>
          <p className="text-xl font-bold text-purple-600">{totalGlobal.compagnies}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Total réservations</h2>
          <p className="text-xl font-bold text-blue-600">{totalGlobal.reservations}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Montant encaissé</h2>
          <p className="text-xl font-bold text-green-600">
            {totalGlobal.total.toLocaleString()} FCFA
          </p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Commission générée</h2>
          <p className="text-xl font-bold text-orange-600">
            {totalGlobal.commission.toLocaleString()} FCFA
          </p>
        </div>
      </div>

      {/* Statistiques par compagnie */}
      <h2 className="text-lg font-semibold mb-4">Compagnies</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.length === 0 ? (
          <p className="text-gray-500 italic">Aucune donnée disponible</p>
        ) : (
          stats.map((s) => (
            <div key={s.companyId} className="p-4 border rounded-lg shadow-sm bg-white">
              <h3 className="text-lg font-bold text-orange-600 mb-1">{s.companyName}</h3>
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                Plan : {s.plan}
              </span>
              <p className="text-sm mt-2 text-gray-700">Réservations : {s.count}</p>
              <p className="text-sm text-gray-700">
                Montant : {s.total.toLocaleString()} FCFA
              </p>
              <p className="text-sm text-gray-700">
                Commission : {s.commission.toLocaleString()} FCFA
              </p>
              <div className="flex gap-2 mt-3">
                <Link
                  to={`/admin/compagnies/${s.companyId}`}
                  className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  Gérer
                </Link>
                <Link
                  to={`/admin/compagnies/${s.companyId}/factures`}
                  className="text-sm px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                >
                  Factures
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
