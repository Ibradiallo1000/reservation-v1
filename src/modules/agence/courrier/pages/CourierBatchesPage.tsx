/**
 * Phase 3: Courier Lots (Batches) — list, create, assign, ready, depart, escale arrival, close.
 * Route: /agence/courrier/lots
 */

import React, { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import useCompanyTheme from "@/shared/hooks/useCompanyTheme";
import { db } from "@/firebaseConfig";
import { collection, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { agencyBatchesRef, agencyBatchRef, shipmentRef, shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import type { CourierBatch } from "@/modules/logistics/domain/courierBatch.types";
import type { Shipment } from "@/modules/logistics/domain/shipment.types";
import {
  createCourierBatch,
  addShipmentToCourierBatch,
  removeShipmentFromCourierBatch,
  markCourierBatchReady,
  confirmCourierBatchDeparture,
  confirmEscaleArrival,
  closeCourierBatch,
} from "@/modules/logistics/services/courierBatches";
import { Layers, Plus, Loader2, CheckCircle, Truck, MapPin, X } from "lucide-react";
import { Link } from "react-router-dom";
import CourierPageHeader from "../components/CourierPageHeader";
import type { Company } from "@/types/companyTypes";

type BatchWithId = CourierBatch & { id: string };

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  READY: "Prêt",
  DEPARTED: "Parti",
  CLOSED: "Clôturé",
};

export default function CourierBatchesPage() {
  const { user, company } = useAuth() as {
    user: { uid: string; companyId?: string; agencyId?: string; role?: string | string[] };
    company: unknown;
  };
  const theme = useCompanyTheme(company as Company | null);
  const primaryColor = theme?.colors?.primary ?? "#ea580c";
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const rolesArr: string[] = Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : [];
  const isChefAgence = rolesArr.includes("chefAgence") || rolesArr.includes("admin_compagnie");
  const userRole = rolesArr[0] ?? "";

  const [batches, setBatches] = useState<BatchWithId[]>([]);
  const [shipmentsCreated, setShipmentsCreated] = useState<Shipment[]>([]);
  const [agencies, setAgencies] = useState<{ id: string; nomAgence?: string; nom?: string }[]>([]);
  const [fleetVehicles, setFleetVehicles] = useState<{ id: string; plateNumber?: string }[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<BatchWithId | null>(null);
  const [batchShipments, setBatchShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [createTripKey, setCreateTripKey] = useState("");
  const [createVehicleId, setCreateVehicleId] = useState("");
  const [assignShipmentId, setAssignShipmentId] = useState("");
  const [escaleShipmentIds, setEscaleShipmentIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const ref = agencyBatchesRef(db, companyId, agencyId);
    const unsub = onSnapshot(ref, (snap) => {
      setBatches(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as BatchWithId))
      );
    });
    return () => unsub();
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const q = query(
      shipmentsRef(db, companyId),
      where("originAgencyId", "==", agencyId),
      where("currentStatus", "==", "CREATED")
    );
    const unsub = onSnapshot(q, (snap) => {
      setShipmentsCreated(snap.docs.map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment)));
    });
    return () => unsub();
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, "companies", companyId, "agences")).then((snap) => {
      setAgencies(snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; nomAgence?: string; nom?: string })));
    });
    getDocs(collection(db, "companies", companyId, "fleetVehicles")).then((snap) => {
      setFleetVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as { id: string; plateNumber?: string })));
    });
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !agencyId || !selectedBatchId) {
      setBatchDetail(null);
      setBatchShipments([]);
      return;
    }
    const bRef = agencyBatchRef(db, companyId, agencyId, selectedBatchId);
    const unsub = onSnapshot(bRef, (snap) => {
      if (!snap.exists()) {
        setBatchDetail(null);
        setBatchShipments([]);
        return;
      }
      const b = { id: snap.id, ...snap.data() } as BatchWithId;
      setBatchDetail(b);
      if (b.shipmentIds.length === 0) {
        setBatchShipments([]);
        return;
      }
      Promise.all(b.shipmentIds.map((sid) => getDoc(shipmentRef(db, companyId, sid)))).then((docs) => {
        setBatchShipments(docs.filter((d) => d.exists()).map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment)));
      });
    });
    return () => unsub();
  }, [companyId, agencyId, selectedBatchId]);

  const byStatus = useMemo(() => {
    const d: Record<string, BatchWithId[]> = { DRAFT: [], READY: [], DEPARTED: [], CLOSED: [] };
    batches.forEach((b) => {
      if (d[b.status]) d[b.status].push(b);
    });
    return d;
  }, [batches]);

  const agencyName = (id: string) => agencies.find((a) => a.id === id)?.nomAgence ?? agencies.find((a) => a.id === id)?.nom ?? id;

  const handleCreateBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createTripKey.trim() || !createVehicleId.trim()) {
      setError("Clé trajet et véhicule requis.");
      return;
    }
    setError(null);
    setLoading((p) => ({ ...p, create: true }));
    try {
      const batchId = await createCourierBatch({
        companyId,
        originAgencyId: agencyId,
        tripKey: createTripKey.trim(),
        vehicleId: createVehicleId.trim(),
        createdBy: user!.uid,
      });
      setSelectedBatchId(batchId);
      setCreateTripKey("");
      setCreateVehicleId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur création lot");
    } finally {
      setLoading((p) => ({ ...p, create: false }));
    }
  };

  const handleAddShipment = async () => {
    if (!selectedBatchId || !assignShipmentId.trim()) return;
    setError(null);
    setLoading((p) => ({ ...p, add: true }));
    try {
      await addShipmentToCourierBatch({
        companyId,
        originAgencyId: agencyId,
        batchId: selectedBatchId,
        shipmentId: assignShipmentId.trim(),
        performedBy: user!.uid,
      });
      setAssignShipmentId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur ajout envoi");
    } finally {
      setLoading((p) => ({ ...p, add: false }));
    }
  };

  const handleRemoveShipment = async (shipmentId: string) => {
    if (!selectedBatchId) return;
    setError(null);
    setLoading((p) => ({ ...p, [shipmentId]: true }));
    try {
      await removeShipmentFromCourierBatch({ companyId, originAgencyId: agencyId, batchId: selectedBatchId, shipmentId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur retrait");
    } finally {
      setLoading((p) => ({ ...p, [shipmentId]: false }));
    }
  };

  const handleMarkReady = async () => {
    if (!selectedBatchId) return;
    setError(null);
    setLoading((p) => ({ ...p, ready: true }));
    try {
      await markCourierBatchReady({ companyId, originAgencyId: agencyId, batchId: selectedBatchId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setLoading((p) => ({ ...p, ready: false }));
    }
  };

  const handleConfirmDeparture = async () => {
    if (!selectedBatchId) return;
    setError(null);
    setLoading((p) => ({ ...p, depart: true }));
    try {
      await confirmCourierBatchDeparture({
        companyId,
        originAgencyId: agencyId,
        batchId: selectedBatchId,
        performedBy: user!.uid,
        userRole,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur départ");
    } finally {
      setLoading((p) => ({ ...p, depart: false }));
    }
  };

  const handleEscaleArrival = async () => {
    if (escaleShipmentIds.size === 0) return;
    setError(null);
    setLoading((p) => ({ ...p, escale: true }));
    try {
      await confirmEscaleArrival({
        companyId,
        agencyId,
        shipmentIds: Array.from(escaleShipmentIds),
        performedBy: user!.uid,
      });
      setEscaleShipmentIds(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur arrivée escale");
    } finally {
      setLoading((p) => ({ ...p, escale: false }));
    }
  };

  const handleCloseBatch = async () => {
    if (!selectedBatchId) return;
    setError(null);
    setLoading((p) => ({ ...p, close: true }));
    try {
      await closeCourierBatch({ companyId, originAgencyId: agencyId, batchId: selectedBatchId, userRole });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur clôture");
    } finally {
      setLoading((p) => ({ ...p, close: false }));
    }
  };

  const availableForAssign = useMemo(
    () => shipmentsCreated.filter((s) => !s.batchId && !batchDetail?.shipmentIds.includes(s.shipmentId)),
    [shipmentsCreated, batchDetail]
  );
  const forEscale = useMemo(
    () => batchShipments.filter((s) => s.currentStatus === "IN_TRANSIT" && s.destinationAgencyId === agencyId),
    [batchShipments, agencyId]
  );

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-6">
      <CourierPageHeader
        icon={Layers}
        title="Lots"
        primaryColor={primaryColor}
        description="Créez des lots, assignez des envois, confirmez le départ et les arrivées escale."
        right={
          <Link
            to="/agence/courrier"
            className="inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm"
            style={{ borderColor: primaryColor, color: primaryColor }}
          >
            Retour
          </Link>
        }
      />

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-800 border border-red-200 text-sm flex justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline">Fermer</button>
        </div>
      )}

      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <Plus className="w-5 h-5" style={{ color: primaryColor }} />
          Nouveau lot
        </h2>
        <form onSubmit={handleCreateBatch} className="flex flex-wrap gap-3 items-end">
          <div className="min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Clé trajet (dep_arr_heure_date)</label>
            <input
              type="text"
              value={createTripKey}
              onChange={(e) => setCreateTripKey(e.target.value)}
              placeholder="Bamako_Segou_08:00_2025-02-22"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="min-w-[140px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">Véhicule</label>
            <select
              value={createVehicleId}
              onChange={(e) => setCreateVehicleId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">—</option>
              {fleetVehicles.map((v) => (
                <option key={v.id} value={v.id}>{v.plateNumber ?? v.id}</option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={loading.create}
            className="rounded-lg px-4 py-2.5 text-white text-sm font-medium disabled:opacity-50 min-h-[44px] flex items-center gap-2"
            style={{ backgroundColor: primaryColor }}
          >
            {loading.create ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Créer lot
          </button>
        </form>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(["DRAFT", "READY", "DEPARTED", "CLOSED"] as const).map((status) => (
          <section key={status} className="rounded-xl border bg-white p-4 shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
              <Layers className="w-4 h-4" style={{ color: primaryColor }} />
              {STATUS_LABELS[status]}
            </h3>
            <ul className="space-y-2">
              {byStatus[status].length === 0 && <li className="text-sm text-gray-500">Aucun</li>}
              {byStatus[status].map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedBatchId(b.id)}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition ${
                      selectedBatchId === b.id ? "ring-2" : "border-gray-200 hover:border-gray-300"
                    }`}
                    style={selectedBatchId === b.id ? { borderColor: primaryColor, boxShadow: `0 0 0 2px ${primaryColor}` } : {}}
                  >
                    <span className="font-mono text-xs">{b.tripKey.slice(0, 20)}…</span>
                    <span className="block text-gray-600">{b.shipmentIds.length} envoi(s)</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {batchDetail && (
        <section className="rounded-xl border bg-white p-4 shadow-sm">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center justify-between flex-wrap gap-2">
            <span>Lot : {batchDetail.tripKey}</span>
            <span className="text-sm font-normal text-gray-500">{STATUS_LABELS[batchDetail.status]}</span>
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-600">
                  <th className="p-2">N° Envoi</th>
                  <th className="p-2">Destination</th>
                  <th className="p-2">Statut</th>
                  <th className="p-2">Emplacement</th>
                  {batchDetail.status === "DRAFT" && <th className="p-2"></th>}
                  {batchDetail.status === "DEPARTED" && forEscale.length > 0 && <th className="p-2">Arrivée escale</th>}
                </tr>
              </thead>
              <tbody>
                {batchShipments.map((s) => (
                  <tr key={s.shipmentId} className="border-b">
                    <td className="p-2 font-mono">{s.shipmentNumber ?? s.shipmentId}</td>
                    <td className="p-2">{agencyName(s.destinationAgencyId)}</td>
                    <td className="p-2">{s.currentStatus}</td>
                    <td className="p-2">{s.currentLocationAgencyId ? agencyName(s.currentLocationAgencyId) : "—"}</td>
                    {batchDetail.status === "DRAFT" && (
                      <td className="p-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveShipment(s.shipmentId)}
                          disabled={loading[s.shipmentId]}
                          className="text-red-600 hover:underline text-xs"
                        >
                          {loading[s.shipmentId] ? <Loader2 className="w-3 h-3 animate-spin inline" /> : <X className="w-3 h-3 inline" />}
                        </button>
                      </td>
                    )}
                    {batchDetail.status === "DEPARTED" && forEscale.length > 0 && (
                      <td className="p-2">
                        {s.currentStatus === "IN_TRANSIT" && s.destinationAgencyId === agencyId && (
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={escaleShipmentIds.has(s.shipmentId)}
                              onChange={(e) =>
                                setEscaleShipmentIds((prev) => {
                                  const next = new Set(prev);
                                  if (e.target.checked) next.add(s.shipmentId);
                                  else next.delete(s.shipmentId);
                                  return next;
                                })
                              }
                            />
                            Ici
                          </label>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {batchDetail.status === "DRAFT" && (
            <div className="mt-4 flex flex-wrap gap-2 items-end">
              <select
                value={assignShipmentId}
                onChange={(e) => setAssignShipmentId(e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[180px]"
              >
                <option value="">— Ajouter un envoi —</option>
                {availableForAssign.map((s) => (
                  <option key={s.shipmentId} value={s.shipmentId}>
                    {s.shipmentNumber ?? s.shipmentId} → {agencyName(s.destinationAgencyId)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleAddShipment}
                disabled={!assignShipmentId.trim() || loading.add}
                className="rounded-lg px-4 py-2 text-white text-sm disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {loading.add ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Ajouter"}
              </button>
            </div>
          )}

          {batchDetail.status === "DRAFT" && batchDetail.shipmentIds.length > 0 && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleMarkReady}
                disabled={loading.ready}
                className="rounded-lg px-4 py-2 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                {loading.ready ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                Marquer prêt
              </button>
            </div>
          )}

          {batchDetail.status === "READY" && isChefAgence && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleConfirmDeparture}
                disabled={loading.depart}
                className="rounded-lg px-4 py-2 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                {loading.depart ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                Confirmer départ
              </button>
            </div>
          )}

          {batchDetail.status === "DEPARTED" && forEscale.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={handleEscaleArrival}
                disabled={escaleShipmentIds.size === 0 || loading.escale}
                className="rounded-lg px-4 py-2 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
                style={{ backgroundColor: primaryColor }}
              >
                {loading.escale ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                Confirmer arrivée escale ({escaleShipmentIds.size})
              </button>
            </div>
          )}

          {batchDetail.status === "DEPARTED" && isChefAgence && (
            <div className="mt-3">
              <button
                type="button"
                onClick={handleCloseBatch}
                disabled={loading.close}
                className="rounded-lg px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium disabled:opacity-50"
              >
                {loading.close ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Clôturer le lot"}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
