// src/modules/agence/fleet/FleetDashboardPage.tsx
// Phase 3: Fleet dashboard — garage, assigned, in_transit, maintenance, approaching.
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import type { FleetVehicle, FleetVehicleStatus } from "./types";

type AgencyItem = { id: string; nom: string };

const statusLabels: Record<FleetVehicleStatus, string> = {
  garage: "En garage",
  assigned: "Affecté",
  in_transit: "En transit",
  arrived: "Arrivé",
  maintenance: "Maintenance",
};

const FleetDashboardPage: React.FC = () => {
  const { user, company } = useAuth() as { user: { companyId?: string; agencyId?: string }; company: unknown };
  const navigate = useNavigate();
  const companyId = user?.companyId ?? null;
  const currentAgencyId = user?.agencyId ?? null;

  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [agencies, setAgencies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setVehicles([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const agencesSnap = await getDocs(collection(db, `companies/${companyId}/agences`));
        const agencyMap: Record<string, string> = {};
        agencesSnap.docs.forEach((d) => {
          const data = d.data() as { nom?: string; name?: string };
          agencyMap[d.id] = data?.nom ?? data?.name ?? d.id;
        });
        setAgencies(agencyMap);

        const fleetRef = collection(db, `companies/${companyId}/fleetVehicles`);
        const snap = await getDocs(fleetRef);
        const list: FleetVehicle[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FleetVehicle, "id">),
        }));
        setVehicles(list);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  const byStatus = (status: FleetVehicleStatus) =>
    vehicles.filter((v) => v.status === status);
  const inGarage = byStatus("garage");
  const assigned = byStatus("assigned");
  const inTransit = byStatus("in_transit");
  const arrived = byStatus("arrived");
  const maintenance = byStatus("maintenance");
  const approaching = vehicles.filter(
    (v) =>
      v.status === "in_transit" &&
      currentAgencyId &&
      ((v as { destinationAgencyId?: string | null }).destinationAgencyId === currentAgencyId || v.currentArrival === currentAgencyId)
  );

  const primaryColor = (company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#0ea5e9";

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="text-gray-500">Chargement du tableau de bord flotte…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold">Tableau de bord Flotte</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => navigate("/agence/fleet/vehicles?status=garage")}
          className="text-left p-4 rounded-xl border bg-white hover:bg-gray-50"
        >
          <div className="text-2xl font-bold" style={{ color: primaryColor }}>{inGarage.length}</div>
          <div className="text-sm text-gray-600">{statusLabels.garage}</div>
        </button>
        <button
          type="button"
          onClick={() => navigate("/agence/fleet/vehicles?status=assigned")}
          className="text-left p-4 rounded-xl border bg-white hover:bg-gray-50"
        >
          <div className="text-2xl font-bold text-amber-600">{assigned.length}</div>
          <div className="text-sm text-gray-600">{statusLabels.assigned}</div>
        </button>
        <button
          type="button"
          onClick={() => navigate("/agence/fleet/vehicles?status=in_transit")}
          className="text-left p-4 rounded-xl border bg-white hover:bg-gray-50"
        >
          <div className="text-2xl font-bold text-blue-600">{inTransit.length}</div>
          <div className="text-sm text-gray-600">{statusLabels.in_transit}</div>
        </button>
        <button
          type="button"
          onClick={() => navigate("/agence/fleet/vehicles?status=maintenance")}
          className="text-left p-4 rounded-xl border bg-white hover:bg-gray-50"
        >
          <div className="text-2xl font-bold text-red-600">{maintenance.length}</div>
          <div className="text-sm text-gray-600">{statusLabels.maintenance}</div>
        </button>
      </div>

      {approaching.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <h2 className="font-semibold text-emerald-800 mb-2">Véhicules approchant cette agence</h2>
          <ul className="space-y-2">
            {approaching.map((v) => (
              <li key={v.id} className="flex items-center justify-between text-sm">
                <span className="font-medium">{v.plateNumber} — {v.internalCode}</span>
                <span className="text-gray-600">{v.chauffeurName || "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b font-semibold">Véhicules récents</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Plaque / Code</th>
                <th className="px-3 py-2 text-left">Capacité</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-left">Agence / Trajet</th>
                <th className="px-3 py-2 text-left">Chauffeur</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.slice(0, 15).map((v) => (
                <tr key={v.id} className="border-t">
                  <td className="px-3 py-2">{v.plateNumber} — {v.internalCode}</td>
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
                  <td className="px-3 py-2">{v.chauffeurName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {vehicles.length === 0 && (
          <div className="p-6 text-center text-gray-500">Aucun véhicule enregistré. Créez-en depuis Véhicules ou Affectation.</div>
        )}
      </div>
    </div>
  );
};

export default FleetDashboardPage;
