// Routes réseau et escales — Géré par le responsable logistique (menu Garage) et le CEO.
// Path: companies/{companyId}/routes — Accès: /compagnie/:companyId/garage/routes
import React, { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton, EmptyState, table } from "@/ui";
import { createRoute, listRoutes, updateRoute, setRouteStatus, deleteRoute, getRoute } from "@/modules/compagnie/routes/routesService";
import { getRouteStops, addStop, updateStop, deleteStop } from "@/modules/compagnie/routes/routeStopsService";
import { ROUTE_STATUS, type RouteDocWithId, type RouteStopDocWithId } from "@/modules/compagnie/routes/routesTypes";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { MapPin, Plus, Pencil, Power, Loader2, Trash2, ListOrdered } from "lucide-react";

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
    origin: "",
    destination: "",
    distanceKm: "" as string | number,
    estimatedDurationMinutes: "" as string | number,
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const [stopsModalRouteId, setStopsModalRouteId] = useState<string | null>(null);
  const [stops, setStops] = useState<RouteStopDocWithId[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);
  const [stopForm, setStopForm] = useState({
    city: "",
    order: 1,
    distanceFromStartKm: "" as string | number,
    estimatedArrivalOffsetMinutes: "" as string | number,
    boardingAllowed: true,
    dropoffAllowed: true,
  });
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [stopError, setStopError] = useState<string | null>(null);

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

  const loadStops = useCallback(
    async (routeId: string) => {
      if (!companyId) return;
      setStopsLoading(true);
      setStopError(null);
      try {
        const list = await getRouteStops(companyId, routeId);
        setStops(list);
      } catch (e) {
        console.error(e);
        setStops([]);
        setStopError("Impossible de charger les escales.");
      } finally {
        setStopsLoading(false);
      }
    },
    [companyId]
  );

  const openStopsModal = (routeId: string) => {
    setStopsModalRouteId(routeId);
    setEditingStopId(null);
    setStopForm({ city: "", order: 1, distanceFromStartKm: "", estimatedArrivalOffsetMinutes: "", boardingAllowed: true, dropoffAllowed: true });
    loadStops(routeId);
  };

  const openCreate = () => {
    setForm({ origin: "", destination: "", distanceKm: "", estimatedDurationMinutes: "" });
    setEditId(null);
    setModal("create");
    setSaveError(null);
  };

  const openEdit = (r: RouteDocWithId) => {
    setForm({
      origin: r.origin ?? r.departureCity ?? "",
      destination: r.destination ?? r.arrivalCity ?? "",
      distanceKm: r.distanceKm ?? r.distance ?? "",
      estimatedDurationMinutes: r.estimatedDurationMinutes ?? r.estimatedDuration ?? "",
    });
    setEditId(r.id);
    setModal("edit");
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!companyId) return;
    const origin = (form.origin || "").trim();
    const destination = (form.destination || "").trim();
    if (!origin || !destination) {
      setSaveError("Origine et destination sont obligatoires.");
      return;
    }
    setActioningId("save");
    setSaveError(null);
    try {
      if (modal === "edit" && editId) {
        await updateRoute(companyId, editId, {
          origin,
          destination,
          distanceKm: form.distanceKm === "" ? null : Number(form.distanceKm),
          estimatedDurationMinutes: form.estimatedDurationMinutes === "" ? null : Number(form.estimatedDurationMinutes),
        });
      } else {
        await createRoute(companyId, {
          origin,
          destination,
          distanceKm: form.distanceKm === "" ? null : Number(form.distanceKm),
          estimatedDurationMinutes: form.estimatedDurationMinutes === "" ? null : Number(form.estimatedDurationMinutes),
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

  const handleDeleteRoute = async (routeId: string) => {
    if (!companyId) return;
    if (!window.confirm("Supprimer cette route et toutes ses escales ?")) return;
    setActioningId(routeId);
    try {
      await deleteRoute(companyId, routeId);
      if (stopsModalRouteId === routeId) setStopsModalRouteId(null);
      await loadRoutes();
    } catch (e: any) {
      alert(e?.message ?? "Erreur lors de la suppression.");
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

  const handleAddStop = async () => {
    if (!companyId || !stopsModalRouteId) return;
    const city = (stopForm.city || "").trim();
    if (!city) {
      setStopError("Ville obligatoire.");
      return;
    }
    setStopError(null);
    try {
      await addStop(companyId, stopsModalRouteId, {
        city,
        order: Math.max(1, Math.floor(Number(stopForm.order)) || 1),
        distanceFromStartKm: stopForm.distanceFromStartKm === "" ? null : Number(stopForm.distanceFromStartKm),
        estimatedArrivalOffsetMinutes: stopForm.estimatedArrivalOffsetMinutes === "" ? null : Number(stopForm.estimatedArrivalOffsetMinutes),
        boardingAllowed: stopForm.boardingAllowed,
        dropoffAllowed: stopForm.dropoffAllowed,
      });
      setStopForm({ city: "", order: stops.length + 1, distanceFromStartKm: "", estimatedArrivalOffsetMinutes: "", boardingAllowed: true, dropoffAllowed: true });
      await loadStops(stopsModalRouteId);
    } catch (e: any) {
      setStopError(e?.message ?? "Erreur.");
    }
  };

  /** Ajoute en une fois les 2 escales minimales : origine (ordre 1) et destination (ordre 2). */
  const handleAddOriginAndDestination = async () => {
    if (!companyId || !stopsModalRouteId || !routeForStops) return;
    const origin = (routeForStops.origin ?? routeForStops.departureCity ?? "").trim();
    const destination = (routeForStops.destination ?? routeForStops.arrivalCity ?? "").trim();
    if (!origin || !destination) {
      setStopError("La route doit avoir une origine et une destination.");
      return;
    }
    setStopError(null);
    try {
      await addStop(companyId, stopsModalRouteId, {
        city: origin,
        order: 1,
        distanceFromStartKm: null,
        estimatedArrivalOffsetMinutes: 0,
        boardingAllowed: true,
        dropoffAllowed: true,
      });
      await addStop(companyId, stopsModalRouteId, {
        city: destination,
        order: 2,
        distanceFromStartKm: routeForStops.distanceKm ?? routeForStops.distance ?? null,
        estimatedArrivalOffsetMinutes: routeForStops.estimatedDurationMinutes ?? routeForStops.estimatedDuration ?? null,
        boardingAllowed: true,
        dropoffAllowed: true,
      });
      await loadStops(stopsModalRouteId);
      setStopForm({ city: "", order: 3, distanceFromStartKm: "", estimatedArrivalOffsetMinutes: "", boardingAllowed: true, dropoffAllowed: true });
    } catch (e: any) {
      setStopError(e?.message ?? "Erreur.");
    }
  };

  const handleUpdateStop = async () => {
    if (!companyId || !stopsModalRouteId || !editingStopId) return;
    setStopError(null);
    try {
      await updateStop(companyId, stopsModalRouteId, editingStopId, {
        city: (stopForm.city || "").trim() || undefined,
        order: Math.max(1, Math.floor(Number(stopForm.order)) || 1),
        distanceFromStartKm: stopForm.distanceFromStartKm === "" ? null : Number(stopForm.distanceFromStartKm),
        estimatedArrivalOffsetMinutes: stopForm.estimatedArrivalOffsetMinutes === "" ? null : Number(stopForm.estimatedArrivalOffsetMinutes),
        boardingAllowed: stopForm.boardingAllowed,
        dropoffAllowed: stopForm.dropoffAllowed,
      });
      setEditingStopId(null);
      setStopForm({ city: "", order: 1, distanceFromStartKm: "", estimatedArrivalOffsetMinutes: "", boardingAllowed: true, dropoffAllowed: true });
      await loadStops(stopsModalRouteId);
    } catch (e: any) {
      setStopError(e?.message ?? "Erreur.");
    }
  };

  const handleDeleteStop = async (stopId: string) => {
    if (!companyId || !stopsModalRouteId) return;
    if (!window.confirm("Supprimer cette escale ?")) return;
    try {
      await deleteStop(companyId, stopsModalRouteId, stopId);
      await loadStops(stopsModalRouteId);
    } catch (e: any) {
      setStopError(e?.message ?? "Erreur.");
    }
  };

  const routeForStops = stopsModalRouteId ? routes.find((r) => r.id === stopsModalRouteId) : null;
  const primaryColor = (theme?.colors?.primary as string) ?? "#0ea5e9";

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Routes réseau"
        subtitle="Définir les liaisons et escales. Les agences configurent ensuite les horaires et tarifs sur ces routes."
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
            <EmptyState message="Aucune route. Ajoutez des liaisons (ex. Bamako → Sikasso) et leurs escales." />
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
                  <th className={table.th}>Itinéraire</th>
                  <th className={table.th}>Distance</th>
                  <th className={table.th}>Durée est.</th>
                  <th className={table.th}>Escales</th>
                  <th className={table.th}>Statut</th>
                  <th className={table.th + " w-48 text-right"}>Actions</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {routes.map((r) => (
                  <tr key={r.id} className="border-t border-gray-200 dark:border-gray-700">
                    <td className={table.td}>
                      <span className="font-medium">{r.origin ?? r.departureCity}</span>
                      <span className="mx-1 text-gray-500">→</span>
                      <span className="font-medium">{r.destination ?? r.arrivalCity}</span>
                    </td>
                    <td className={table.td}>{r.distanceKm != null ? `${r.distanceKm} km` : r.distance != null ? `${r.distance} km` : "—"}</td>
                    <td className={table.td}>{r.estimatedDurationMinutes != null ? `${r.estimatedDurationMinutes} min` : r.estimatedDuration != null ? `${r.estimatedDuration} min` : "—"}</td>
                    <td className={table.td}>
                      <button
                        type="button"
                        onClick={() => openStopsModal(r.id)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1"
                      >
                        <ListOrdered className="w-4 h-4" />
                        Voir / gérer
                      </button>
                    </td>
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
                      <button
                        type="button"
                        onClick={() => handleDeleteRoute(r.id)}
                        disabled={actioningId === r.id}
                        className="p-2 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
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
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Origine</label>
                <input
                  type="text"
                  value={form.origin}
                  onChange={(e) => setForm((f) => ({ ...f, origin: e.target.value }))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="ex. Bamako"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Destination</label>
                <input
                  type="text"
                  value={form.destination}
                  onChange={(e) => setForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="ex. Sikasso"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Distance (km, optionnel)</label>
                <input
                  type="number"
                  min={0}
                  value={form.distanceKm}
                  onChange={(e) => setForm((f) => ({ ...f, distanceKm: e.target.value }))}
                  className="w-full border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600"
                  placeholder="—"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Durée estimée (min, optionnel)</label>
                <input
                  type="number"
                  min={0}
                  value={form.estimatedDurationMinutes}
                  onChange={(e) => setForm((f) => ({ ...f, estimatedDurationMinutes: e.target.value }))}
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

      {stopsModalRouteId && routeForStops && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Escales — {routeForStops.origin ?? routeForStops.departureCity} → {routeForStops.destination ?? routeForStops.arrivalCity}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Ordre croissant. Première = origine, dernière = destination. Minimum 2 escales.
              </p>
            </div>
            <div className="p-4 flex-1 overflow-y-auto">
              {stopsLoading ? (
                <div className="flex items-center justify-center gap-2 text-gray-500 py-8">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Chargement…
                </div>
              ) : (
                <>
                  <ul className="space-y-2 mb-4">
                    {stops.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 py-2 px-3 rounded bg-gray-50 dark:bg-gray-700/50"
                      >
                        <span className="font-medium">{s.order}. {s.city}</span>
                        <span className="text-sm text-gray-500">
                          {s.distanceFromStartKm != null ? `${s.distanceFromStartKm} km` : ""}
                          {s.estimatedArrivalOffsetMinutes != null ? ` · ${s.estimatedArrivalOffsetMinutes} min` : ""}
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStopId(s.id);
                              setStopForm({
                                city: s.city,
                                order: s.order,
                                distanceFromStartKm: s.distanceFromStartKm ?? "",
                                estimatedArrivalOffsetMinutes: s.estimatedArrivalOffsetMinutes ?? "",
                                boardingAllowed: s.boardingAllowed ?? true,
                                dropoffAllowed: s.dropoffAllowed ?? true,
                              });
                            }}
                            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300"
                            title="Modifier"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStop(s.id)}
                            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600"
                            title="Supprimer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {stops.length < 2 && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <p className="text-sm text-amber-800 dark:text-amber-200 mb-2">
                        Une route doit avoir au moins 2 escales : l&apos;origine et la destination.
                      </p>
                      <button
                        type="button"
                        onClick={handleAddOriginAndDestination}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                        style={{ backgroundColor: primaryColor }}
                      >
                        Ajouter les 2 escales (origine + destination)
                      </button>
                    </div>
                  )}
                  <div className="space-y-2 border-t border-gray-200 dark:border-gray-700 pt-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      {editingStopId ? "Modifier l'escale" : "Ajouter une escale"}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={stopForm.city}
                        onChange={(e) => setStopForm((f) => ({ ...f, city: e.target.value }))}
                        className="border rounded px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Ville"
                      />
                      <input
                        type="number"
                        min={1}
                        value={stopForm.order}
                        onChange={(e) => setStopForm((f) => ({ ...f, order: Number(e.target.value) || 1 }))}
                        className="border rounded px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Ordre"
                      />
                      <input
                        type="number"
                        min={0}
                        value={stopForm.distanceFromStartKm}
                        onChange={(e) => setStopForm((f) => ({ ...f, distanceFromStartKm: e.target.value }))}
                        className="border rounded px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Distance (km)"
                      />
                      <input
                        type="number"
                        min={0}
                        value={stopForm.estimatedArrivalOffsetMinutes}
                        onChange={(e) => setStopForm((f) => ({ ...f, estimatedArrivalOffsetMinutes: e.target.value }))}
                        className="border rounded px-2 py-1.5 dark:bg-gray-700 dark:border-gray-600"
                        placeholder="Offset (min)"
                      />
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={stopForm.boardingAllowed}
                          onChange={(e) => setStopForm((f) => ({ ...f, boardingAllowed: e.target.checked }))}
                        />
                        Montée
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={stopForm.dropoffAllowed}
                          onChange={(e) => setStopForm((f) => ({ ...f, dropoffAllowed: e.target.checked }))}
                        />
                        Descente
                      </label>
                    </div>
                    {stopError && <p className="text-sm text-red-600 dark:text-red-400">{stopError}</p>}
                    <div className="flex gap-2">
                      {editingStopId ? (
                        <>
                          <button
                            type="button"
                            onClick={() => { setEditingStopId(null); setStopForm({ city: "", order: stops.length + 1, distanceFromStartKm: "", estimatedArrivalOffsetMinutes: "", boardingAllowed: true, dropoffAllowed: true }); }}
                            className="px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-sm"
                          >
                            Annuler
                          </button>
                          <button
                            type="button"
                            onClick={handleUpdateStop}
                            className="px-3 py-1.5 rounded bg-gray-800 dark:bg-gray-600 text-white text-sm"
                          >
                            Enregistrer
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={handleAddStop}
                          className="px-3 py-1.5 rounded text-white text-sm"
                          style={{ backgroundColor: primaryColor }}
                        >
                          Ajouter
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => { setStopsModalRouteId(null); setStops([]); setStopError(null); setEditingStopId(null); }}
                className="w-full px-4 py-2 rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
