// src/modules/agence/fleet/FleetMovementLogPage.tsx
// Phase 3/4: Movement log from fleetMovements collection (audit trail).
import React, { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, limit } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { format } from "date-fns";
import type { FleetMovementDoc } from "./types";
import { StandardLayoutWrapper, PageHeader, SectionCard, EmptyState, table, tableRowClassName } from "@/ui";
import { History } from "lucide-react";

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
      <StandardLayoutWrapper maxWidthClass="max-w-4xl">
        <p className="text-gray-500">Chargement des mouvements…</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-4xl">
      <PageHeader
        title="Historique des mouvements flotte"
        subtitle="Audit des changements de statut (fleetMovements)."
        icon={History}
      />
      <SectionCard title="Mouvements" noPad>
        {movements.length === 0 ? (
          <div className="p-6"><EmptyState message="Aucun mouvement enregistré." /></div>
        ) : (
        <div className={table.wrapper}>
          <table className={table.base}>
            <thead className={table.head}>
              <tr>
                <th className={table.th}>Véhicule</th>
                <th className={table.th}>Transition</th>
                <th className={table.th}>De → Vers agence</th>
                <th className={table.th}>Trajet / Date</th>
                <th className={table.th}>Par</th>
                <th className={table.th}>Date</th>
              </tr>
            </thead>
            <tbody className={table.body}>
              {movements.map((m) => (
                <tr key={m.id} className={tableRowClassName()}>
                  <td className={table.td + " font-medium"}>{m.vehicleId}</td>
                  <td className={table.td}>{m.previousStatus} → {m.newStatus}</td>
                  <td className={table.td}>{m.fromAgencyId ?? "—"} → {m.toAgencyId ?? "—"}</td>
                  <td className={table.td}>{[m.date, m.heure, m.tripId].filter(Boolean).join(" • ") || "—"}</td>
                  <td className={table.td}>{m.movedBy}</td>
                  <td className={table.td}>{m.at ? format(m.at, "dd/MM/yyyy HH:mm") : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default FleetMovementLogPage;
