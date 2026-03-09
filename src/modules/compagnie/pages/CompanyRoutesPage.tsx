// Routes réseau — CEO manages company transport routes.
// Path: companies/{companyId}/routes
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState, table } from "@/ui";
import { createRoute, listRoutes, updateRoute, setRouteStatus } from "@/modules/compagnie/routes/routesService";
import { ROUTE_STATUS, type RouteDocWithId } from "@/modules/compagnie/routes/routesTypes";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { MapPin, Plus, Pencil, Power, Loader2 } from "lucide-react";

export default function CompanyRoutesPage() {
  const { user } = useAuth();
  const { companyId: urlCompanyId } = useParams<{ companyId?: string }>();
  const companyId = urlCompanyId ?? user?.companyId ?? "";
  const theme = useCompanyTheme(companyId ? undefined : null);

  const [routes, setRoutes] = useState<RouteDocWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [modal, setModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({
    departureCity: "",
    arrivalCity: "",
    distance: "" as string | number,
    estimatedDuration: "" as string | number,
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadRoutes = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const list = await listRoutes(companyId);
      setRoutes(list);
    } catch (e) {
      console.error(e);
      setRoutes([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadRoutes();
  }, [loadRoutes]);

  const openCreate = () => {
    setForm({ departureCity: "", arrivalCity: "", distance: "", estimatedDuration: "" });
    setEditId(null);
    setModal("create");
    setSaveError(null);
  };

  const openEdit = (r: RouteDocWithId) => {
    setForm({
      departureCity: r.departureCity ?? "",
      arrivalCity: r.arrivalCity ?? "",
      distance: r.distance ?? "",
      estimatedDuration: r.estimatedDuration ?? "",
    });
    setEditId(r.id);
    setModal("edit");
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!companyId) return;
    const dep = (form.departureCity || "").trim();
    const arr = (form.arrivalCity || "").trim();
    if (!dep || !arr) {
      setSaveError("Ville de départ et ville d'arrivée sont obligatoires.");
      return;
    }
    setActioningId("save");
    setSaveError(null);
    try {
      if (modal === "edit" && editId) {
        await updateRoute(companyId, editId, {
          departureCity: dep,
          arrivalCity: arr,
          distance: form.distance === "" ? null : Number(form.distance),
          estimatedDuration: form.estimatedDuration === "" ? null : Number(form.estimatedDuration),
        });
      } else {
        await createRoute(companyId, {
          departureCity: dep,
          arrivalCity: arr,
          distance: form.distance === "" ? null : Number(form.distance),
          estimatedDuration: form.estimatedDuration === "" ? null : Number(form.estimatedDuration),
        });
      }
      setModal(null);
      setEditId(null);
      await loadRoutes();
    } catch (e: any) {
      setSaveError(e?.message ?? "Erreur lors de l'enregistrement.");
    } finally {
      setActioningId(null);
    }
  };

  const handleSetStatus = async (routeId: string, currentStatus: string) => {
    if (!companyId) return;
    const next = currentStatus === ROUTE_STATUS.ACTIVE ? ROUTE_STATUS.DISABLED : ROUTE_STATUS.ACTIVE;
    setActioningId(routeId);
    try {
      await setRouteStatus(companyId, routeId, next);
      await loadRoutes();
    } catch (e) {
      console.error(e);
    } finally {
      setActioningId(null);
    }
  };

  const primaryColor = (theme?.colors?.primary as string) ?? "#0ea5e9";

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Routes réseau"
        subtitle="Définir les liaisons officielles de la compagnie. Les agences configurent ensuite les horaires et tarifs sur ces routes."
        icon={MapPin}
        primaryColorVar={primaryColor}
        right={
          <ActionButton onClick={openCreate}>
            <Plus className="w-4 h-4" />
            Nouvelle route
          </ActionButton>
        }
      />

      <SectionCard title="Liste des routes" noPad>
        {loading ? (
          <div className="p-8 flex items-center justify-center gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Chargement…
          </div>
        ) : routes.length === 0 ? (
          <div className="p-6">
            <EmptyState message="Aucune route. Ajoutez des liaisons (ex. Bamako → Ségou) pour que les agences puissent configurer les trajets." />
            <div className="mt-3 flex justify-center">
              <ActionButton onClick={openCreate}>
                <Plus className="w-4 h-4" />
                Nouvelle route
              </ActionButton>
            </div>
          </div>
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Départ</th>
                  <th className={table.th}>Arrivée</th>
                  <th className={table.th}>Distance</th>
                  <th className={table.th}>Durée est.</th>
                  <th className={table.th}>Statut</th>
                  <th className={table.th + " w-40 text-right"}>Actions</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {routes.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className={table.td}>{r.departureCity}</td>
                    <td className={table.td}>{r.arrivalCity}</td>
                    <td className={table.td}>{r.distance != null ? `${r.distance} km` : "—"}</td>
                    <td className={table.td}>{r.estimatedDuration != null ? `${r.estimatedDuration} min` : "—"}</td>
                    <td className={table.td}>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          (r.status ?? ROUTE_STATUS.ACTIVE) === ROUTE_STATUS.ACTIVE
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                        }`}
                      >
                        {(r.status ?? ROUTE_STATUS.ACTIVE) === ROUTE_STATUS.ACTIVE ? "Actif" : "Désactivé"}
                      </span>
                    </td>
                    <td className={table.td + " text-right"}>
                      <button
                        type="button"
                        onClick={() => openEdit(r)}
                        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
                        title="Modifier"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSetStatus(r.id, r.status ?? ROUTE_STATUS.ACTIVE)}
                        disabled={actioningId === r.id}
                        className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400 disabled:opacity-50"
                        title={(r.status ?? ROUTE_STATUS.ACTIVE) === ROUTE_STATUS.ACTIVE ? "Désactiver" : "Activer"}
                      >
                        {actioningId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Power className="w-4 h-4" />}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {modal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {modal === "create" ? "Nouvelle route" : "Modifier la route"}
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ville de départ</label>
                <input
                  type="text"
                  value={form.departureCity}
                  onChange={(e) => setForm((f) => ({ ...f, departureCity: e.target.value }))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="ex. Bamako"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Ville d'arrivée</label>
                <input
                  type="text"
                  value={form.arrivalCity}
                  onChange={(e) => setForm((f) => ({ ...f, arrivalCity: e.target.value }))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="ex. Ségou"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Distance (km, optionnel)</label>
                <input
                  type="number"
                  min={0}
                  value={form.distance}
                  onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="—"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Durée estimée (min, optionnel)</label>
                <input
                  type="number"
                  min={0}
                  value={form.estimatedDuration}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedDuration: e.target.value }))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="—"
                />
              </div>
            </div>
            {saveError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{saveError}</p>}
            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setModal(null); setEditId(null); setSaveError(null); }}
                className="px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                Annuler
              </button>
              <ActionButton onClick={handleSave} disabled={actioningId === "save"}>
                {actioningId === "save" ? "Enregistrement…" : "Enregistrer"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
