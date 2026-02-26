// Phase 5 — Global fleet supervision (CEO). Read-only; no direct editing. State machine rules unchanged.
import React, { useEffect, useState, useMemo } from "react";
import { useParams } from "react-router-dom";
import { collection, query, where, onSnapshot, getDocs, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePageHeader } from "@/contexts/PageHeaderContext";
import { Truck, Circle } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  garage: "Garage",
  assigned: "Affecté",
  in_transit: "En transit",
  arrived: "Arrivé",
  maintenance: "Maintenance",
};

const IN_TRANSIT_WARN_MS = 6 * 60 * 60 * 1000;  // 6h = orange
const IN_TRANSIT_STALE_MS = 12 * 60 * 60 * 1000; // 12h = red

type FleetDoc = {
  id: string;
  status: string;
  currentAgencyId?: string | null;
  destinationAgencyId?: string | null;
  plateNumber?: string;
  currentTripId?: string | null;
  currentDate?: string;
  currentHeure?: string;
  lastMovementAt?: { toMillis?: () => number } | null;
};

export default function CompanyGlobalFleetPage() {
  const { user } = useAuth();
  const { companyId: routeCompanyId } = useParams<{ companyId: string }>();
  const companyId = routeCompanyId ?? user?.companyId ?? "";
  const { setHeader, resetHeader } = usePageHeader();

  const [vehicles, setVehicles] = useState<FleetDoc[]>([]);
  const [agencies, setAgencies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setHeader({ title: "Flotte globale" });
    return () => resetHeader();
  }, [setHeader, resetHeader]);

  useEffect(() => {
    if (!companyId) {
      setLoading(false);
      return;
    }
    getDocs(collection(db, "companies", companyId, "agences")).then((snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach((d) => {
        const data = d.data() as { nom?: string };
        map[d.id] = data?.nom ?? d.id;
      });
      setAgencies(map);
    });
  }, [companyId]);

  useEffect(() => {
    if (!companyId) return;
    const q = query(
      collection(db, "companies", companyId, "fleetVehicles"),
      where("status", "in", ["garage", "assigned", "in_transit", "arrived", "maintenance"]),
      limit(300)
    );
    const unsub = onSnapshot(q, (snap) => {
      setVehicles(snap.docs.map((d) => ({ id: d.id, ...d.data() } as FleetDoc)));
      setLoading(false);
    });
    return () => unsub();
  }, [companyId]);

  const getDelayLevel = (v: FleetDoc): "normal" | "delayed" | "anomaly" => {
    if (v.status !== "in_transit") return "normal";
    const moved = (v.lastMovementAt as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
    if (!moved) return "normal";
    const elapsed = Date.now() - moved;
    if (elapsed >= IN_TRANSIT_STALE_MS) return "anomaly";
    if (elapsed >= IN_TRANSIT_WARN_MS) return "delayed";
    return "normal";
  };

  if (!companyId) {
    return (
      <div className="p-6">
        <p className="text-gray-500">Compagnie introuvable.</p>
      </div>
    );
  }

  if (loading && vehicles.length === 0) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px]">
        <div className="text-gray-500">Chargement de la flotte…</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-6xl mx-auto">
      <p className="text-sm text-gray-600">
        Vue globale en lecture seule. Les modifications se font depuis l&apos;espace Flotte de chaque agence.
      </p>

      <section className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b bg-gray-50">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="w-5 h-5" /> Véhicules ({vehicles.length})
          </h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left py-2 px-3">Plaque / ID</th>
                <th className="text-left py-2 px-3">Statut</th>
                <th className="text-left py-2 px-3">Position</th>
                <th className="text-left py-2 px-3">Destination</th>
                <th className="text-left py-2 px-3">Trajet</th>
                <th className="text-center py-2 px-3">Indicateur</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-gray-500">Aucun véhicule.</td>
                </tr>
              ) : (
                vehicles.map((v) => {
                  const delay = getDelayLevel(v);
                  return (
                    <tr key={v.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{v.plateNumber ?? v.id}</td>
                      <td className="py-2 px-3">{STATUS_LABELS[v.status] ?? v.status}</td>
                      <td className="py-2 px-3">
                        {v.currentAgencyId ? agencies[v.currentAgencyId] ?? v.currentAgencyId : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {v.destinationAgencyId ? agencies[v.destinationAgencyId] ?? v.destinationAgencyId : "—"}
                      </td>
                      <td className="py-2 px-3">
                        {v.currentTripId ? `${v.currentDate ?? ""} ${v.currentHeure ?? ""} (${v.currentTripId})` : "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {delay === "normal" && (
                          <span className="inline-flex items-center gap-1 text-emerald-600" title="Normal">
                            <Circle className="w-3 h-3 fill-current" /> Normal
                          </span>
                        )}
                        {delay === "delayed" && (
                          <span className="inline-flex items-center gap-1 text-amber-600" title="Retard possible">
                            <Circle className="w-3 h-3 fill-current" /> Retard
                          </span>
                        )}
                        {delay === "anomaly" && (
                          <span className="inline-flex items-center gap-1 text-red-600" title="Anomalie / transit prolongé">
                            <Circle className="w-3 h-3 fill-current" /> Anomalie
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
