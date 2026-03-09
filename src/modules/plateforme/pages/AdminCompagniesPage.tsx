import React, { useEffect, useState } from "react";
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
import { Building2, Mail, Phone, ExternalLink, Settings, Pencil, Power, MapPin, CreditCard } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageLoadingState, PageOfflineState } from "@/shared/ui/PageStates";

type Company = {
  id: string;
  nom: string;
  slug?: string;
  email?: string;
  telephone?: string;
  status?: "actif" | "inactif";
  plan?: string;
  pays?: string;
};

const AdminCompagniesPage: React.FC = () => {
  const isOnline = useOnlineStatus();
  const [compagnies, setCompagnies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const snap = await getDocs(
          query(collection(db, "companies"), orderBy("nom", "asc"))
        );
        setCompagnies(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
          }))
        );
      } catch (e) {
        console.error(e);
        setCompagnies([]);
        setError(
          !isOnline
            ? "Connexion indisponible. Impossible de charger les compagnies."
            : "Erreur lors du chargement des compagnies."
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [isOnline, reloadKey]);

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

  if (loading) {
    return <PageLoadingState />;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: la liste peut être incomplète." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Compagnies</h1>
        <Button
          onClick={() => navigate("/admin/compagnies/ajouter")}
          variant="primary"
          className="w-full sm:w-auto"
        >
          + Ajouter une compagnie
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {compagnies.map((c) => (
          <article
            key={c.id}
            className="group relative aspect-square bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-2xl overflow-hidden shadow-sm hover:shadow-md dark:shadow-none dark:hover:border-slate-600 transition-all duration-200 flex flex-col"
          >
            {/* Accent bar */}
            <div className="h-1 bg-gradient-to-r from-[var(--btn-primary,#FF6600)] to-amber-500 dark:from-orange-500 dark:to-amber-600 flex-shrink-0" />

            <div className="p-3 sm:p-4 flex-1 flex flex-col min-h-0">
              {/* En-tête : nom + statut */}
              <div className="flex items-start justify-between gap-2 mb-2 sm:mb-3 flex-shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex-shrink-0 w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center text-gray-600 dark:text-slate-400 group-hover:text-[var(--btn-primary,#FF6600)] dark:group-hover:text-orange-400 transition-colors">
                    <Building2 className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <h2 className="font-semibold text-gray-900 dark:text-white truncate text-sm sm:text-base">
                    {c.nom}
                  </h2>
                </div>
                <span
                  className={`flex-shrink-0 inline-flex items-center px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-medium ${
                    c.status === "actif"
                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                      : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300"
                  }`}
                >
                  {c.status === "actif" ? "Active" : "Inactif"}
                </span>
              </div>

              {/* Infos importantes */}
              <div className="space-y-1.5 text-xs text-gray-600 dark:text-slate-400 flex-1 min-h-0 overflow-hidden">
                {c.plan && (
                  <div className="flex items-center gap-1.5 truncate">
                    <CreditCard className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                    <span className="truncate">{c.plan}</span>
                  </div>
                )}
                {c.pays && (
                  <div className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                    <span className="truncate">{c.pays}</span>
                  </div>
                )}
                {c.email ? (
                  <div className="flex items-center gap-1.5 truncate">
                    <Mail className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                    <span className="truncate">{c.email}</span>
                  </div>
                ) : c.telephone ? (
                  <div className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 flex-shrink-0 text-gray-400 dark:text-slate-500" />
                    <span className="truncate">{c.telephone}</span>
                  </div>
                ) : null}
                {!c.email && !c.telephone && !c.plan && !c.pays && (
                  <span className="text-gray-400 dark:text-slate-500">—</span>
                )}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2 pt-2 sm:pt-3 border-t border-gray-100 dark:border-slate-700 flex-shrink-0">
                <Button
                  onClick={() => navigate(`/admin/compagnies/${c.id}/configurer`)}
                  variant="primary"
                  size="sm"
                  className="w-full justify-center text-xs px-2 py-1.5 h-auto"
                >
                  <Settings className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                  Configurer
                </Button>
                <Button
                  onClick={() => navigate(`/admin/compagnies/${c.id}/modifier`)}
                  variant="secondary"
                  size="sm"
                  className="w-full justify-center text-xs px-2 py-1.5 h-auto"
                >
                  <Pencil className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
                  Modifier
                </Button>
                {c.slug ? (
                  <a
                    href={`/${c.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="col-span-2 sm:col-span-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" />
                    Voir site
                  </a>
                ) : null}
                <Button
                  onClick={() => toggleStatus(c)}
                  variant="danger"
                  size="sm"
                  className={`w-full justify-center text-xs px-2 py-1.5 h-auto ${!c.slug ? "col-span-2" : ""}`}
                >
                  <Power className="w-3.5 h-3.5 flex-shrink-0 mr-1" />
                  {c.status === "actif" ? "Désactiver" : "Activer"}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default AdminCompagniesPage;
