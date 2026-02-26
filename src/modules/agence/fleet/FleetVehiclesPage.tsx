// src/modules/agence/fleet/FleetVehiclesPage.tsx
// Phase 3: List and filter fleet vehicles.
import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import type { FleetVehicle, FleetVehicleStatus } from "./types";
import { transitionVehicleStatus } from "./fleetStateMachine";
import { canTransition } from "./types";

const statusLabels: Record<FleetVehicleStatus, string> = {
  garage: "En garage",
  assigned: "Affecté",
  in_transit: "En transit",
  arrived: "Arrivé",
  maintenance: "Maintenance",
};

const FleetVehiclesPage: React.FC = () => {
  const { user, company } = useAuth() as { user: { companyId?: string; uid?: string }; company: unknown };
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get("status") as FleetVehicleStatus | null;
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [agencies, setAgencies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.companyId) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    const companyId = user.companyId;
    (async () => {
      setLoading(true);
      try {
        const [fleetSnap, agencesSnap] = await Promise.all([
          getDocs(collection(db, `companies/${companyId}/fleetVehicles`)),
          getDocs(collection(db, `companies/${companyId}/agences`)),
        ]);
        const agencyMap: Record<string, string> = {};
        agencesSnap.docs.forEach((d) => {
          const data = d.data() as { nom?: string; name?: string };
          agencyMap[d.id] = data?.nom ?? data?.name ?? d.id;
        });
        setAgencies(agencyMap);

        let list: FleetVehicle[] = fleetSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FleetVehicle, "id">),
        }));
        if (statusFilter && statusLabels[statusFilter] !== undefined) {
          list = list.filter((v) => v.status === statusFilter);
        }
        setVehicles(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.companyId, statusFilter]);

  const setStatus = async (vehicle: FleetVehicle, newStatus: FleetVehicleStatus) => {
    const companyId = user?.companyId;
    const uid = user?.uid ?? "";
    if (!companyId || !uid) return;
    if (!canTransition(vehicle.status, newStatus)) {
      alert(`Transition interdite : ${vehicle.status} → ${newStatus}`);
      return;
    }
    setUpdatingId(vehicle.id);
    try {
      await transitionVehicleStatus(companyId, vehicle.id, newStatus, uid, {
        toAgencyId: newStatus === "arrived" ? (vehicle.destinationAgencyId ?? vehicle.currentAgencyId) : null,
        tripId: vehicle.currentTripId ?? undefined,
        date: vehicle.currentDate ?? undefined,
        heure: vehicle.currentHeure ?? undefined,
      });
      setVehicles((prev) =>
        prev.map((v) => (v.id === vehicle.id ? { ...v, status: newStatus } : v))
      );
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Erreur lors de la mise à jour.");
    } finally {
      setUpdatingId(null);
    }
  };

  const primaryColor = (company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#0ea5e9";

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-gray-500">Chargement des véhicules…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Véhicules flotte</h1>
      {statusFilter && (
        <p className="text-sm text-gray-600">Filtre : {statusLabels[statusFilter] ?? statusFilter}</p>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Plaque / Code</th>
                <th className="px-3 py-2 text-left">Capacité</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-left">Agence / Trajet</th>
                <th className="px-3 py-2 text-left">Chauffeur / Convoyeur</th>
                <th className="px-3 py-2 text-center w-40">Action</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{v.plateNumber} — {v.internalCode}</td>
                  <td className="px-3 py-2">{v.capacity}</td>
                  <td className="px-3 py-2">
                    <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {statusLabels[v.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {v.currentAgencyId ? agencies[v.currentAgencyId] ?? v.currentAgencyId : "—"}
                    {v.currentTripId && ` • ${v.currentDate ?? ""} ${v.currentHeure ?? ""}`}
                  </td>
                  <td className="px-3 py-2">{v.chauffeurName || "—"} / {v.convoyeurName || "—"}</td>
                  <td className="px-3 py-2 text-center">
                    {updatingId === v.id ? (
                      <span className="text-xs text-gray-500">…</span>
                    ) : (
                      <select
                        className="text-xs border rounded px-2 py-1"
                        value={v.status}
                        onChange={(e) => setStatus(v, e.target.value as FleetVehicleStatus)}
                      >
                        {(Object.keys(statusLabels) as FleetVehicleStatus[]).map((s) => (
                          <option key={s} value={s} disabled={!canTransition(v.status, s)}>
                            {statusLabels[s]}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vehicles.length === 0 && (
          <div className="p-6 text-center text-gray-500">Aucun véhicule.</div>
        )}
      </div>
    </div>
  );
};

export default FleetVehiclesPage;
