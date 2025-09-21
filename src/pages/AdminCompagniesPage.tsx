// src/pages/AdminCompagniesPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useNavigate } from "react-router-dom";

type Company = {
  id: string;
  nom: string;
  slug?: string;
  email?: string;
  telephone?: string;
  pays?: string;
  status?: "actif" | "inactif";
  // champs synchronisés avec un plan
  plan?: string;      // nom du plan (dénormalisé)
  planId?: string;    // id du plan
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;
  commissionOnline?: number;  // 0.01 = 1%
  feeGuichet?: number;        // FCFA / billet (si guichet)
  minimumMonthly?: number;    // FCFA
  maxAgences?: number;
};

type PlanDoc = {
  name: string;
  priceMonthly: number;
  quotaReservations?: number;
  overagePerReservation?: number;
  commissionOnline: number; // 0.01
  feeGuichet: number;       // FCFA / billet
  minimumMonthly: number;   // FCFA
  maxAgences: number;
  features: { publicPage: boolean; onlineBooking: boolean; guichet: boolean };
};

const nf = new Intl.NumberFormat("fr-FR");

const AdminCompagniesPage: React.FC = () => {
  const [compagnies, setCompagnies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  // ===== Load companies + plans
  useEffect(() => {
    (async () => {
      try {
        const [cSnap, pSnap] = await Promise.all([
          getDocs(query(collection(db, "companies"), orderBy("nom", "asc"))),
          getDocs(query(collection(db, "plans"), orderBy("priceMonthly", "asc"))),
        ]);

        setCompagnies(
          cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Company[]
        );

        setPlans(
          pSnap.docs.map((d) => {
            const data = d.data() as any;
            return { id: d.id, name: String(data.name ?? d.id) };
          })
        );
      } catch (err) {
        console.error(err);
        setMessage("Erreur lors du chargement des données");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ===== Helpers
  const hasCompanies = useMemo(() => compagnies.length > 0, [compagnies.length]);

  async function applyPlanToCompany(companyId: string, planId: string) {
    // lire le plan
    const pSnap = await getDoc(doc(db, "plans", planId));
    if (!pSnap.exists()) throw new Error("Plan introuvable");
    const p = pSnap.data() as PlanDoc;

    // cohérence : onlineBooking => publicPage true
    const publicPageEnabled = !!p.features.publicPage || !!p.features.onlineBooking;

    await updateDoc(doc(db, "companies", companyId), {
      planId,
      plan: p.name,
      publicPageEnabled,
      onlineBookingEnabled: !!p.features.onlineBooking,
      guichetEnabled: !!p.features.guichet,
      commissionOnline: Number(p.features.onlineBooking ? p.commissionOnline : 0),
      feeGuichet: Number(p.features.guichet ? p.feeGuichet : 0),
      minimumMonthly: Number(p.minimumMonthly || 0),
      maxAgences: Number(p.maxAgences || 0),
      updatedAt: serverTimestamp(),
    });

    // maj état local
    setCompagnies((prev) =>
      prev.map((c) =>
        c.id === companyId
          ? {
              ...c,
              planId,
              plan: p.name,
              publicPageEnabled,
              onlineBookingEnabled: !!p.features.onlineBooking,
              guichetEnabled: !!p.features.guichet,
              commissionOnline: p.features.onlineBooking ? p.commissionOnline : 0,
              feeGuichet: p.features.guichet ? p.feeGuichet : 0,
              minimumMonthly: p.minimumMonthly || 0,
              maxAgences: p.maxAgences || 0,
            }
          : c
      )
    );
  }

  const handleToggleStatus = async (id: string, currentStatus?: string) => {
    try {
      const newStatus = currentStatus === "inactif" ? "actif" : "inactif";
      await updateDoc(doc(db, "companies", id), { status: newStatus, updatedAt: serverTimestamp() });
      setMessage(`Statut mis à jour en « ${newStatus} »`);
      setCompagnies((prev) => prev.map((c) => (c.id === id ? { ...c, status: newStatus as any } : c)));
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la mise à jour du statut");
    }
  };

  if (loading) return <p className="p-6">Chargement des compagnies…</p>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestion des compagnies</h1>
        <button
          onClick={() => navigate("/admin/compagnies/ajouter")}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded"
        >
          + Ajouter une compagnie
        </button>
      </div>

      {message && <p className="mb-4 text-blue-600">{message}</p>}

      {!hasCompanies ? (
        <p className="text-gray-500 italic">Aucune compagnie enregistrée</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {compagnies.map((c) => (
            <div
              key={c.id}
              className="border rounded-xl shadow-sm bg-white p-5 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-orange-700">{c.nom}</h2>
                  <p className="text-xs text-gray-500">Slug : {c.slug || "—"}</p>
                  <p className="text-xs text-gray-500">Email : {c.email || "—"}</p>
                  <p className="text-xs text-gray-500">Téléphone : {c.telephone || "—"}</p>
                  <p className="text-xs text-gray-500">Pays : {c.pays || "—"}</p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded ${
                    c.status === "inactif" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"
                  }`}
                >
                  {c.status === "inactif" ? "Inactif" : "Actif"}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <div className="text-sm">
                  <span className="text-gray-600">Plan actuel : </span>
                  <b>{c.plan || "—"}</b>
                </div>

                <label className="block text-sm text-gray-700 font-medium">
                  Appliquer un plan
                </label>
                <select
                  value={c.planId || ""}
                  onChange={async (e) => {
                    const pid = e.target.value;
                    if (!pid) return;
                    try {
                      await applyPlanToCompany(c.id, pid);
                      const planName = plans.find((p) => p.id === pid)?.name || "";
                      setMessage(`Plan « ${planName} » appliqué à ${c.nom}`);
                    } catch (err) {
                      console.error(err);
                      setMessage("Erreur lors de l’application du plan");
                    }
                  }}
                  className="border p-2 rounded mt-1 w-full"
                >
                  <option value="">— Sélectionner —</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                {/* résumé tarifaire si déjà synchronisé */}
                <div className="text-xs text-gray-600 border rounded-lg p-2">
                  <div>
                    <span className="text-gray-500">Agences max :</span>{" "}
                    <b>{c.maxAgences ?? "—"}</b>
                  </div>
                  <div>
                    <span className="text-gray-500">Commission online :</span>{" "}
                    <b>{c.commissionOnline != null ? Math.round((c.commissionOnline || 0) * 100) + "%" : "—"}</b>
                  </div>
                  <div>
                    <span className="text-gray-500">Frais guichet :</span>{" "}
                    <b>{c.feeGuichet != null ? nf.format(c.feeGuichet) + " FCFA" : "—"}</b>
                  </div>
                  <div>
                    <span className="text-gray-500">Minimum mensuel :</span>{" "}
                    <b>{c.minimumMonthly ? nf.format(c.minimumMonthly) + " FCFA" : "—"}</b>
                  </div>
                  <div className="mt-1 text-gray-500">
                    Features :{" "}
                    <b>
                      {c.publicPageEnabled ? "Vitrine" : "—"},{" "}
                      {c.onlineBookingEnabled ? "Réservation en ligne" : "—"},{" "}
                      {c.guichetEnabled ? "Guichet" : "—"}
                    </b>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => navigate(`/admin/compagnies/${c.id}/modifier`)}
                  className="text-sm px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleToggleStatus(c.id, c.status)}
                  className="text-sm px-3 py-1 rounded bg-yellow-500 text-white hover:bg-yellow-600"
                >
                  {c.status === "inactif" ? "Réactiver" : "Désactiver"}
                </button>
                {c.slug && (
                  <a
                    href={`/${c.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Voir site
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCompagniesPage;
