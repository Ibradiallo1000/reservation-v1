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
  invitationId?: string; // ✅ IMPORTANT
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
  commissionOnline?: number;
  feeGuichet?: number;
  minimumMonthly?: number;
  maxAgences?: number;
  features?: {
    publicPage?: boolean;
    onlineBooking?: boolean;
    guichet?: boolean;
  };
};

type PlanOption = {
  id: string;
  name: string;
  priceMonthly: number | null;
};

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

        setCompagnies(
          cSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
        );

        setPlans(
          pSnap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              name: String(data?.name ?? d.id),
              priceMonthly:
                typeof data?.priceMonthly === "number"
                  ? data.priceMonthly
                  : null,
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

  const hasCompanies = useMemo(
    () => compagnies.length > 0,
    [compagnies]
  );

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

      setCompagnies((prev) =>
        prev.map((c) => (c.id === companyId ? { ...c, ...patch } : c))
      );

      setMessage(`Plan « ${p.name} » appliqué.`);
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
      await updateDoc(doc(db, "companies", id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      });
      setCompagnies((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
      );
    } catch (err) {
      console.error(err);
      setMessage("Erreur lors de la mise à jour du statut");
    }
  };

  if (loading) return <p className="p-6">Chargement…</p>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-orange-700">Compagnies</h1>
        <button
          onClick={() => navigate("/admin/compagnies/ajouter")}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg"
        >
          + Ajouter une compagnie
        </button>
      </div>

      {message && (
        <p className="text-sm text-orange-800 bg-orange-50 border border-orange-200 rounded px-3 py-2">
          {message}
        </p>
      )}

      {!hasCompanies ? (
        <div className="border-dashed border rounded p-10 text-center">
          Aucune compagnie.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {compagnies.map((c) => {
            const isInactive = c.status === "inactif";
            const isApplying = applyingId === c.id;

            return (
              <div key={c.id} className="border rounded-xl p-5 bg-white">
                <div className="font-semibold">{c.nom}</div>
                <div className="text-xs text-gray-500">
                  {c.email || "—"}
                </div>

                {/* 🔥 LIEN INVITATION */}
                {c.invitationId && (
                  <a
                    href={`/accept-invitation/${c.invitationId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-sm text-blue-600 underline"
                  >
                    🔗 Activer le compte admin
                  </a>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      navigate(`/admin/compagnies/${c.id}/modifier`)
                    }
                    className="px-3 py-1.5 rounded bg-orange-600 text-white"
                  >
                    Modifier
                  </button>

                  <button
                    onClick={() => handleToggleStatus(c.id, c.status)}
                    className="px-3 py-1.5 rounded bg-amber-500 text-white"
                  >
                    {isInactive ? "Réactiver" : "Désactiver"}
                  </button>

                  {c.slug && (
                    <a
                      href={`/${c.slug}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded bg-blue-600 text-white"
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
