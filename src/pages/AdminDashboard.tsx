// src/pages/AdminDashboard.tsx
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

const nf = new Intl.NumberFormat("fr-FR");
const fmtFCFA = (n: number) => `${nf.format(n || 0)} FCFA`;
const toNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const AdminDashboard: React.FC = () => {
  const [stats, setStats] = useState<CompanyStat[]>([]);
  const [totalGlobal, setTotalGlobal] = useState({
    total: 0,
    reservations: 0,
    commission: 0,
    compagnies: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        // 1) compagnies
        const companiesSnap = await getDocs(collection(db, "companies"));
        const companies: Company[] = companiesSnap.docs.map((doc) => ({
          id: doc.id,
          nom: doc.data().nom || "Compagnie",
          slug: doc.data().slug || "—",
          plan: doc.data().plan || "free",
          status: doc.data().status || "actif",
        }));

        // 2) réservations (toutes les sous-collections "reservations")
        const reservationsSnap = await getDocs(collectionGroup(db, "reservations"));

        let total = 0;
        let count = 0;
        let commission = 0;
        const grouped: Record<string, CompanyStat> = {};

        for (const docSnap of reservationsSnap.docs) {
          const d = docSnap.data() as any;

          const companyId = d.companyId || "inconnu";
          const montant = toNum(d.total ?? d.montant);
          const comm = toNum(d.commission);

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

        // 3) fusion pour afficher aussi les compagnies sans résa
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
      } catch (err: any) {
        console.error("Erreur lors du chargement des stats:", err);
        setError("Impossible de charger les statistiques pour le moment.");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="space-y-4">
      {/* Titre/intro (le vrai header est dans le layout, ici on garde simple) */}
      <div>
        <h1 className="text-2xl font-bold">Tableau de bord – Administration plateforme</h1>
        <p className="text-gray-600">Suivi global des compagnies, abonnements et revenus.</p>
      </div>

      {/* Erreur */}
      {error && (
        <div className="border border-red-200 bg-red-50 text-red-700 rounded-lg px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* KPIs globaux */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Total compagnies</h2>
          <p className="text-2xl font-bold text-gray-900">{totalGlobal.compagnies}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Total réservations</h2>
          <p className="text-2xl font-bold text-gray-900">{totalGlobal.reservations}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Montant encaissé</h2>
          <p className="text-2xl font-bold text-emerald-600">{fmtFCFA(totalGlobal.total)}</p>
        </div>
        <div className="bg-white border rounded-lg p-4 shadow-sm">
          <h2 className="text-sm text-gray-500">Commission générée</h2>
          <p className="text-2xl font-bold text-orange-600">{fmtFCFA(totalGlobal.commission)}</p>
        </div>
      </div>

      {/* Loading state pour la liste */}
      {loading && (
        <div className="text-sm text-gray-500">Chargement des statistiques compagnies…</div>
      )}

      {/* Statistiques par compagnie */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Compagnies</h2>

        {(!loading && stats.length === 0) ? (
          <p className="text-gray-500 italic">Aucune donnée disponible</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.map((s) => (
              <div key={s.companyId} className="p-4 border rounded-lg shadow-sm bg-white">
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-bold text-orange-600">{s.companyName}</h3>
                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                    Plan : {s.plan}
                  </span>
                </div>

                <div className="mt-2 space-y-1 text-sm text-gray-700">
                  <p>Réservations : <b>{s.count}</b></p>
                  <p>Montant : <b>{fmtFCFA(s.total)}</b></p>
                  <p>Commission : <b>{fmtFCFA(s.commission)}</b></p>
                </div>

                <div className="flex gap-2 mt-3">
                  <Link
                    to={`/admin/compagnies/${s.companyId}`}
                    className="text-sm px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Gérer
                  </Link>
                  <Link
                    to={`/admin/compagnies/${s.companyId}/factures`}
                    className="text-sm px-3 py-1.5 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                  >
                    Factures
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
