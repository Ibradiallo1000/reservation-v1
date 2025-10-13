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
  plan?: string;
  planId?: string;
  publicPageEnabled?: boolean;
  onlineBookingEnabled?: boolean;
  guichetEnabled?: boolean;
  commissionOnline?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  maxAgences?: number;
};

type PlanDoc = {
  name: string;
  priceMonthly: number;
  quotaReservations?: number;
  overagePerReservation?: number;
  commissionOnline?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  maxAgences?: number;
  features?: { publicPage?: boolean; onlineBooking?: boolean; guichet?: boolean };
};

type PlanOption = { id: string; name: string; priceMonthly: number | null };

const nf = new Intl.NumberFormat("fr-FR");

function fmtPct(n?: number) {
  if (typeof n !== "number") return "—";
  return `${Math.round(n * 100)}%`;
}
function fmtFcfa(n?: number) {
  if (typeof n !== "number") return "—";
  return `${nf.format(n)} FCFA`;
}

const AdminCompagniesPage: React.FC = () => {
  const [compagnies, setCompagnies] = useState<Company[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const [cSnap, pSnap] = await Promise.all([
          getDocs(query(collection(db, "companies"), orderBy("nom", "asc"))),
          getDocs(query(collection(db, "plans"), orderBy("priceMonthly", "asc"))),
        ]);
        setCompagnies(cSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Company[]);
        setPlans(
          pSnap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: String(data?.name ?? d.id),
              priceMonthly: typeof data?.priceMonthly === "number" ? data.priceMonthly : null,
            };
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

  const hasCompanies = useMemo(() => compagnies.length > 0, [compagnies]);

  async function applyPlanToCompany(companyId: string, planId: string) {
    setApplyingId(companyId);
    try {
      const pSnap = await getDoc(doc(db, "plans", planId));
      if (!pSnap.exists()) throw new Error("Plan introuvable");
      const p = pSnap.data() as PlanDoc;

      const f = p.features ?? {};
      const publicPageEnabled = !!f.publicPage || !!f.onlineBooking;

      const patch = {
        planId,
        plan: p.name,
        publicPageEnabled,
        onlineBookingEnabled: !!f.onlineBooking,
        guichetEnabled: !!f.guichet,
        commissionOnline: f.onlineBooking ? Number(p.commissionOnline ?? 0) : 0,
        feeGuichet: f.guichet ? Number(p.feeGuichet ?? 0) : 0,
        minimumMonthly: Number(p.minimumMonthly ?? 0),
        maxAgences: Number(p.maxAgences ?? 0),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, "companies", companyId), patch);

      setCompagnies((prev) => prev.map((c) => (c.id === companyId ? { ...c, ...patch } : c)));
      setMessage(`Plan « ${p.name ?? planId} » appliqué avec succès.`);
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de l’application du plan");
    } finally {
      setApplyingId(null);
    }
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
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-orange-700">Compagnies</h1>
          <p className="text-sm text-gray-500">Gérez les plans et le statut des compagnies.</p>
        </div>
        <button
          onClick={() => navigate("/admin/compagnies/ajouter")}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg shadow-sm"
        >
          + Ajouter une compagnie
        </button>
      </div>

      {message && <p className="mb-2 text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded px-3 py-2">{message}</p>}

      {!hasCompanies ? (
        <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-gray-500">
          Aucune compagnie pour l’instant.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {compagnies.map((c) => {
            const isInactive = c.status === "inactif";
            const isApplying = applyingId === c.id;
            return (
              <div key={c.id} className="rounded-2xl border shadow-sm bg-white p-5 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold text-gray-900">{c.nom}</div>
                    <div className="text-xs text-gray-500">Slug: {c.slug || "—"}</div>
                    <div className="text-xs text-gray-500">Email: {c.email || "—"}</div>
                    <div className="text-xs text-gray-500">Téléphone: {c.telephone || "—"}</div>
                    <div className="text-xs text-gray-500">Pays: {c.pays || "—"}</div>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${isInactive ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
                    {isInactive ? "Inactif" : "Actif"}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Plan actuel</span>
                    <b>{c.plan || "—"}</b>
                  </div>

                  <label className="block text-gray-700 font-medium">Appliquer un plan</label>
                  <select
                    value={c.planId || ""}
                    disabled={isInactive || isApplying}
                    onChange={async (e) => {
                      const pid = e.target.value;
                      if (!pid) return;
                      await applyPlanToCompany(c.id, pid);
                    }}
                    className={`border rounded-lg px-3 py-2 w-full ${isInactive ? "bg-gray-100 cursor-not-allowed" : "bg-white"}`}
                    title={isInactive ? "Réactivez la compagnie pour changer de plan" : ""}
                  >
                    <option value="">— Sélectionner —</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}{p.priceMonthly != null ? ` • ${nf.format(p.priceMonthly)} FCFA / mois` : ""}
                      </option>
                    ))}
                  </select>

                  <div className="text-xs border rounded-lg p-2 bg-gray-50 space-y-1">
                    <div className="flex items-center justify-between"><span className="text-gray-500">Agences max</span> <b>{c.maxAgences ?? "—"}</b></div>
                    <div className="flex items-center justify-between"><span className="text-gray-500">Commission online</span> <b>{fmtPct(c.commissionOnline)}</b></div>
                    <div className="flex items-center justify-between"><span className="text-gray-500">Frais guichet</span> <b>{fmtFcfa(c.feeGuichet)}</b></div>
                    <div className="flex items-center justify-between"><span className="text-gray-500">Minimum mensuel</span> <b>{fmtFcfa(c.minimumMonthly)}</b></div>
                    <div className="pt-1 text-gray-500">
                      Features :{" "}
                      <span className="inline-flex gap-1 ml-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${c.publicPageEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>Vitrine</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${c.onlineBookingEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>Réservation</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] ${c.guichetEnabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>Guichet</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <button
                    onClick={() => navigate(`/admin/compagnies/${c.id}/modifier`)}
                    className="text-sm px-3 py-1.5 rounded-lg bg-orange-600 text-white hover:bg-orange-700"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => handleToggleStatus(c.id, c.status)}
                    className="text-sm px-3 py-1.5 rounded-lg bg-amber-500 text-white hover:bg-amber-600"
                  >
                    {isInactive ? "Réactiver" : "Désactiver"}
                  </button>
                  {c.slug && (
                    <a
                      href={`/${c.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                    >
                      Voir site
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminCompagniesPage;
