// Phase B1.5 — Trip costs: create, edit (same day only), view history. No delete.
import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import {
  createTripCost,
  updateTripCost,
  listTripCosts,
  totalOperationalCost,
  type TripCostDoc,
} from "@/core/intelligence";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";
import { PageErrorState, PageOfflineState } from "@/shared/ui/PageStates";

const TODAY = format(new Date(), "yyyy-MM-dd");

type TripCostWithId = TripCostDoc & { id: string };

export default function TripCostsPage() {
  const isOnline = useOnlineStatus();
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const navigate = useNavigate();
  const { setHeader, resetHeader } = usePageHeader();

  const [items, setItems] = useState<TripCostWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(TODAY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState({
    tripId: "",
    agencyId: user?.agencyId ?? "",
    date: TODAY,
    fuelCost: 0,
    driverCost: 0,
    assistantCost: 0,
    tollCost: 0,
    maintenanceCost: 0,
    otherOperationalCost: 0,
  });

  const isAgencyManager = user?.role === "chefAgence";
  const canEditSameDay = (docDate: string) => docDate === TODAY;

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    setError(null);
    try {
      const list = await listTripCosts(companyId, {
        date: dateFilter,
        agencyId: isAgencyManager && user?.agencyId ? user.agencyId : undefined,
        limitCount: 200,
      });
      setItems(list);
    } catch (e) {
      console.error("listTripCosts:", e);
      setItems([]);
      setError(
        !isOnline
          ? "Connexion indisponible. Impossible de charger les coûts trajet."
          : "Erreur lors du chargement des coûts trajet."
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, dateFilter, isAgencyManager, user?.agencyId, isOnline]);

  useEffect(() => {
    setHeader({ title: "Coûts par trajet" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  useEffect(() => {
    load();
  }, [load, reloadKey]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !user?.uid) return;
    setSaving(true);
    try {
      await createTripCost(companyId, { ...form, agencyId: form.agencyId || (user.agencyId ?? "") }, user.uid);
      setForm({ ...form, tripId: "", fuelCost: 0, driverCost: 0, assistantCost: 0, tollCost: 0, maintenanceCost: 0, otherOperationalCost: 0 });
      setShowForm(false);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent, id: string) => {
    e.preventDefault();
    if (!companyId) return;
    setSaving(true);
    try {
      const row = items.find((i) => i.id === id);
      if (!row || row.date !== TODAY) return;
      await updateTripCost(companyId, id, {
        fuelCost: form.fuelCost,
        driverCost: form.driverCost,
        assistantCost: form.assistantCost,
        tollCost: form.tollCost,
        maintenanceCost: form.maintenanceCost,
        otherOperationalCost: form.otherOperationalCost,
      });
      setEditingId(null);
      await load();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (row: TripCostWithId) => {
    if (!canEditSameDay(row.date)) return;
    setForm({
      tripId: row.tripId,
      agencyId: row.agencyId,
      date: row.date,
      fuelCost: Number(row.fuelCost) || 0,
      driverCost: Number(row.driverCost) || 0,
      assistantCost: Number(row.assistantCost) || 0,
      tollCost: Number(row.tollCost) || 0,
      maintenanceCost: Number(row.maintenanceCost) || 0,
      otherOperationalCost: Number(row.otherOperationalCost) || 0,
    });
    setEditingId(row.id);
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Compagnie introuvable.</p>
        <button type="button" onClick={() => navigate(-1)} className="mt-2 text-sm text-blue-600">
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-5xl mx-auto">
      {!isOnline && (
        <PageOfflineState message="Connexion instable: l’historique des coûts peut être incomplet." />
      )}
      {error && (
        <PageErrorState message={error} onRetry={() => setReloadKey((v) => v + 1)} />
      )}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" /> Retour
        </button>
        <div className="flex items-center gap-2">
          <label className="text-sm text-gray-600">Date</label>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {!showForm && !editingId && (
        <button
          type="button"
          onClick={() => {
            setForm({
              tripId: "",
              agencyId: user?.agencyId ?? "",
              date: TODAY,
              fuelCost: 0,
              driverCost: 0,
              assistantCost: 0,
              tollCost: 0,
              maintenanceCost: 0,
              otherOperationalCost: 0,
            });
            setShowForm(true);
          }}
          className="inline-flex items-center gap-1 px-3 py-2 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700"
        >
          <Plus className="w-4 h-4" /> Nouveau coût trajet
        </button>
      )}

      {showForm && (
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Créer un coût trajet</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="ID trajet"
              value={form.tripId}
              onChange={(e) => setForm((f) => ({ ...f, tripId: e.target.value }))}
              className="border rounded px-3 py-2 text-sm"
              required
            />
            {!isAgencyManager && (
              <input
                type="text"
                placeholder="ID agence"
                value={form.agencyId}
                onChange={(e) => setForm((f) => ({ ...f, agencyId: e.target.value }))}
                className="border rounded px-3 py-2 text-sm"
              />
            )}
            <input
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              className="border rounded px-3 py-2 text-sm"
            />
            <input type="number" placeholder="Carburant" value={form.fuelCost || ""} onChange={(e) => setForm((f) => ({ ...f, fuelCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Chauffeur" value={form.driverCost || ""} onChange={(e) => setForm((f) => ({ ...f, driverCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Convoyeur" value={form.assistantCost || ""} onChange={(e) => setForm((f) => ({ ...f, assistantCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Péage" value={form.tollCost || ""} onChange={(e) => setForm((f) => ({ ...f, tollCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Maintenance" value={form.maintenanceCost || ""} onChange={(e) => setForm((f) => ({ ...f, maintenanceCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Autre opérationnel" value={form.otherOperationalCost || ""} onChange={(e) => setForm((f) => ({ ...f, otherOperationalCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-sm">
                Annuler
              </button>
            </div>
          </form>
        </section>
      )}

      {editingId && (
        <section className="bg-white rounded-xl border p-4 shadow-sm">
          <h2 className="text-lg font-semibold mb-3">Modifier (même jour uniquement)</h2>
          <form onSubmit={(e) => handleUpdate(e, editingId)} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input type="number" placeholder="Carburant" value={form.fuelCost || ""} onChange={(e) => setForm((f) => ({ ...f, fuelCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Chauffeur" value={form.driverCost || ""} onChange={(e) => setForm((f) => ({ ...f, driverCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Convoyeur" value={form.assistantCost || ""} onChange={(e) => setForm((f) => ({ ...f, assistantCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Péage" value={form.tollCost || ""} onChange={(e) => setForm((f) => ({ ...f, tollCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Maintenance" value={form.maintenanceCost || ""} onChange={(e) => setForm((f) => ({ ...f, maintenanceCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <input type="number" placeholder="Autre opérationnel" value={form.otherOperationalCost || ""} onChange={(e) => setForm((f) => ({ ...f, otherOperationalCost: Number(e.target.value) || 0 }))} className="border rounded px-3 py-2 text-sm" min={0} step={0.01} />
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={saving} className="px-4 py-2 bg-orange-600 text-white rounded-lg text-sm disabled:opacity-50">
                {saving ? "Enregistrement…" : "Enregistrer"}
              </button>
              <button type="button" onClick={() => setEditingId(null)} className="px-4 py-2 border rounded-lg text-sm">
                Annuler
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="bg-white rounded-xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Historique</h2>
        {loading ? (
          <div className="space-y-3 animate-fadein">
            <div className="h-10 rounded-lg skeleton" />
            <div className="h-10 rounded-lg skeleton" />
            <div className="h-10 rounded-lg skeleton" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-500">Aucun coût enregistré pour cette date.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Trajet</th>
                  <th className="text-left py-2">Agence</th>
                  <th className="text-left py-2">Date</th>
                  <th className="text-right py-2">Carburant</th>
                  <th className="text-right py-2">Chauffeur</th>
                  <th className="text-right py-2">Convoyeur</th>
                  <th className="text-right py-2">Péage</th>
                  <th className="text-right py-2">Maint.</th>
                  <th className="text-right py-2">Autre</th>
                  <th className="text-right py-2">Total</th>
                  <th className="text-left py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="py-2">{row.tripId}</td>
                    <td className="py-2">{row.agencyId}</td>
                    <td className="py-2">{row.date}</td>
                    <td className="py-2 text-right">{Number(row.fuelCost || 0).toLocaleString("fr-FR")}</td>
                    <td className="py-2 text-right">{Number(row.driverCost || 0).toLocaleString("fr-FR")}</td>
                    <td className="py-2 text-right">{Number(row.assistantCost || 0).toLocaleString("fr-FR")}</td>
                    <td className="py-2 text-right">{Number(row.tollCost || 0).toLocaleString("fr-FR")}</td>
                    <td className="py-2 text-right">{Number(row.maintenanceCost || 0).toLocaleString("fr-FR")}</td>
                    <td className="py-2 text-right">{Number(row.otherOperationalCost || 0).toLocaleString("fr-FR")}</td>
                    <td className="py-2 text-right font-medium">{totalOperationalCost(row).toLocaleString("fr-FR")}</td>
                    <td className="py-2">
                      {canEditSameDay(row.date) ? (
                        <button type="button" onClick={() => startEdit(row)} className="text-orange-600 hover:underline inline-flex items-center gap-0.5">
                          <Pencil className="w-3.5 h-3.5" /> Modifier
                        </button>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
