import React, { useEffect, useState } from "react";
import { collection, getDocs, doc, updateDoc } from "firebase/firestore";
import { db } from "../firebaseConfig";
import { useNavigate } from "react-router-dom";

interface Company {
  id: string;
  nom: string;
  slug: string;
  email: string;
  telephone: string;
  pays: string;
  plan: "free" | "standard" | "premium";
  commissionRate: number;
  status: string;
}

const plans = {
  free: { label: "Free", commission: 0.1 },
  standard: { label: "Standard", commission: 0.05 },
  premium: { label: "Premium", commission: 0.02 },
};

const AdminCompagniesPage: React.FC = () => {
  const [compagnies, setCompagnies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const fetchCompagnies = async () => {
      try {
        const snapshot = await getDocs(collection(db, "companies"));
        const data = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...(doc.data() as Omit<Company, "id">),
        }));
        setCompagnies(data);
      } catch (err) {
        console.error("Erreur chargement compagnies:", err);
        setMessage("Erreur lors du chargement des compagnies");
      } finally {
        setLoading(false);
      }
    };
    fetchCompagnies();
  }, []);

  const handleToggleStatus = async (id: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === "actif" ? "inactif" : "actif";
      await updateDoc(doc(db, "companies", id), { status: newStatus });
      setMessage(`Statut mis à jour en "${newStatus}"`);
      setCompagnies((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: newStatus } : c))
      );
    } catch (err) {
      console.error("Erreur maj statut:", err);
      setMessage("Erreur lors de la mise à jour du statut");
    }
  };

  const handlePlanChange = async (id: string, newPlan: keyof typeof plans) => {
    try {
      const newCommission = plans[newPlan].commission;
      await updateDoc(doc(db, "companies", id), {
        plan: newPlan,
        commissionRate: newCommission,
      });
      setMessage(`Plan changé en "${plans[newPlan].label}"`);
      setCompagnies((prev) =>
        prev.map((c) =>
          c.id === id ? { ...c, plan: newPlan, commissionRate: newCommission } : c
        )
      );
    } catch (err) {
      console.error("Erreur maj plan:", err);
      setMessage("Erreur lors du changement de plan");
    }
  };

  if (loading) return <p className="p-6">Chargement des compagnies...</p>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Gestion des compagnies</h1>
        <button
          onClick={() => navigate("/compagnies/ajouter")}
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded"
        >
          + Ajouter une compagnie
        </button>
      </div>

      {message && <p className="mb-4 text-blue-600">{message}</p>}

      {compagnies.length === 0 ? (
        <p className="text-gray-500 italic">Aucune compagnie enregistrée</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {compagnies.map((c) => (
            <div
              key={c.id}
              className="border rounded-lg shadow-md bg-white p-5 hover:shadow-lg transition"
            >
              <h2 className="text-lg font-bold text-orange-600">{c.nom}</h2>
              <p className="text-sm text-gray-600">Slug : {c.slug || "—"}</p>
              <p className="text-sm text-gray-600">Email : {c.email}</p>
              <p className="text-sm text-gray-600">Téléphone : {c.telephone}</p>
              <p className="text-sm text-gray-600">Pays : {c.pays}</p>
              <p
                className={`text-sm mt-1 ${
                  c.status === "inactif" ? "text-red-600" : "text-green-600"
                }`}
              >
                Statut : {c.status || "actif"}
              </p>

              <div className="mt-3">
                <label className="block text-sm text-gray-700 font-medium">
                  Plan d’abonnement :
                </label>
                <select
                  value={c.plan}
                  onChange={(e) =>
                    handlePlanChange(c.id, e.target.value as keyof typeof plans)
                  }
                  className="border p-2 rounded mt-1 w-full"
                >
                  {Object.entries(plans).map(([key, value]) => (
                    <option key={key} value={key}>
                      {value.label} — {value.commission * 100}% commission
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-wrap gap-2 mt-4">
                <button
                  onClick={() => navigate(`/compagnies/${c.id}/modifier`)}
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
                <a
                  href={`/${c.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  Voir site
                </a>
                <a
                  href={`/compagnies/${c.id}/factures`}
                  className="text-sm px-3 py-1 rounded bg-purple-600 text-white hover:bg-purple-700"
                >
                  Factures
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminCompagniesPage;
