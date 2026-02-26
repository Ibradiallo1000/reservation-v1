// src/modules/agence/fleet/FleetMovementLogPage.tsx
// Phase 3/4: Movement log from fleetMovements collection (audit trail).
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import type { FleetMovementDoc } from "./types";

interface MovementRow extends FleetMovementDoc {
  id: string;
  at: Date | null;
}

const FleetMovementLogPage: React.FC = () => {
  const { user } = useAuth() as { user: { companyId?: string }; company: unknown };
  const companyId = user?.companyId ?? null;
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) {
      setMovements([]);
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const ref = collection(db, `companies/${companyId}/fleetMovements`);
        const q = query(ref, orderBy("movedAt", "desc"), limit(100));
        const snap = await getDocs(q);
        const list: MovementRow[] = snap.docs.map((d) => {
          const data = d.data() as FleetMovementDoc & { movedAt?: { toDate?: () => Date } };
          return {
            id: d.id,
            ...data,
            at: data.movedAt?.toDate?.() ?? null,
          };
        });
        setMovements(list);
      } catch {
        setMovements([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId]);

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-gray-500">Chargement des mouvements…</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl font-semibold">Historique des mouvements flotte</h1>
      <p className="text-sm text-gray-600">Audit des changements de statut (fleetMovements).</p>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left">Véhicule</th>
                <th className="px-3 py-2 text-left">Transition</th>
                <th className="px-3 py-2 text-left">De → Vers agence</th>
                <th className="px-3 py-2 text-left">Trajet / Date</th>
                <th className="px-3 py-2 text-left">Par</th>
                <th className="px-3 py-2 text-left">Date</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((m) => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{m.vehicleId}</td>
                  <td className="px-3 py-2">{m.previousStatus} → {m.newStatus}</td>
                  <td className="px-3 py-2">{m.fromAgencyId ?? "—"} → {m.toAgencyId ?? "—"}</td>
                  <td className="px-3 py-2">{[m.date, m.heure, m.tripId].filter(Boolean).join(" • ") || "—"}</td>
                  <td className="px-3 py-2">{m.movedBy}</td>
                  <td className="px-3 py-2 text-gray-600">{m.at ? format(m.at, "dd/MM/yyyy HH:mm") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {movements.length === 0 && (
          <div className="p-6 text-center text-gray-500">Aucun mouvement enregistré.</div>
        )}
      </div>
    </div>
  );
};

export default FleetMovementLogPage;
