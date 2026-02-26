import React, { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/ui/button";

type Company = {
  id: string;
  nom: string;
  slug?: string;
  email?: string;
  telephone?: string;
  status?: "actif" | "inactif";
};

const AdminCompagniesPage: React.FC = () => {
  const [compagnies, setCompagnies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const snap = await getDocs(
        query(collection(db, "companies"), orderBy("nom", "asc"))
      );
      setCompagnies(
        snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }))
      );
      setLoading(false);
    })();
  }, []);

  async function toggleStatus(c: Company) {
    const newStatus = c.status === "inactif" ? "actif" : "inactif";
    await updateDoc(doc(db, "companies", c.id), {
      status: newStatus,
      updatedAt: serverTimestamp(),
    });
    setCompagnies((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, status: newStatus } : x))
    );
  }

  if (loading) return <div className="p-6">Chargement…</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Compagnies</h1>
        <Button
          onClick={() => navigate("/admin/compagnies/ajouter")}
          variant="primary"
        >
          + Ajouter une compagnie
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {compagnies.map((c) => (
          <div
            key={c.id}
            className="bg-white border rounded-xl p-5 space-y-4"
          >
            {/* Infos */}
            <div>
              <div className="font-semibold text-lg">{c.nom}</div>
              <div className="text-sm text-gray-600">
                {c.email || "—"} • {c.telephone || "—"}
              </div>
            </div>

            {/* Statut */}
            <span
              className={`inline-block px-2 py-1 text-xs rounded ${
                c.status === "actif"
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              {c.status === "actif" ? "Active" : "Inactive"}
            </span>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-2 pt-2">
              <Button
                onClick={() =>
                  navigate(`/admin/compagnies/${c.id}/configurer`)
                }
                variant="primary"
                size="sm"
              >
                Configurer
              </Button>

              <Button
                onClick={() =>
                  navigate(`/admin/compagnies/${c.id}/modifier`)
                }
                variant="primary"
                size="sm"
              >
                Modifier
              </Button>

              {c.slug && (
                <a
                  href={`/${c.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded text-center"
                >
                  Voir site
                </a>
              )}

              <Button
                onClick={() => toggleStatus(c)}
                variant="danger"
                size="sm"
              >
                {c.status === "actif" ? "Désactiver" : "Activer"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AdminCompagniesPage;
