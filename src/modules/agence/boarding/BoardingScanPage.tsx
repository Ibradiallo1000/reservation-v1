// src/modules/agence/boarding/BoardingScanPage.tsx
// Phase 3: Scan page with vehicle capacity from fleet. Wraps AgenceEmbarquementPage with capacity.
import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import AgenceEmbarquementPage from "@/modules/agence/embarquement/pages/AgenceEmbarquementPage";

/**
 * Fetches vehicle capacity for the given assignment from fleetVehicles.
 * Returns null if no vehicle assigned (no capacity limit).
 */
async function getVehicleCapacityForDeparture(
  companyId: string,
  agencyId: string,
  tripId: string | undefined,
  date: string,
  heure: string
): Promise<number | null> {
  const ref = collection(db, `companies/${companyId}/fleetVehicles`);
  const q = query(
    ref,
    where("status", "==", "assigned"),
    where("currentAgencyId", "==", agencyId),
    where("currentDate", "==", date),
    where("currentHeure", "==", heure)
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    const data = d.data();
    if (data.currentTripId === tripId) return (data.capacity as number) ?? null;
  }
  return null;
}

const BoardingScanPage: React.FC = () => {
  const { user } = useAuth() as { user: { companyId?: string } };
  const location = useLocation() as {
    state?: {
      agencyId?: string;
      date?: string;
      heure?: string;
      tripId?: string;
      departure?: string;
      arrival?: string;
      trajet?: string;
    };
  };
  const [vehicleCapacity, setVehicleCapacity] = useState<number | null>(null);
  const [resolved, setResolved] = useState(false);

  const companyId = user?.companyId ?? null;
  const agencyId = location.state?.agencyId ?? null;
  const date = location.state?.date ?? null;
  const heure = location.state?.heure ?? null;
  const tripId = location.state?.tripId ?? undefined;

  useEffect(() => {
    if (!companyId || !agencyId || !date || !heure) {
      setVehicleCapacity(null);
      setResolved(true);
      return;
    }
    let cancelled = false;
    getVehicleCapacityForDeparture(companyId, agencyId, tripId, date, heure).then((cap) => {
      if (!cancelled) {
        setVehicleCapacity(cap);
        setResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId, date, heure, tripId]);

  if (!resolved) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[200px] text-gray-500">
        Chargement de la capacité véhicule…
      </div>
    );
  }

  return <AgenceEmbarquementPage vehicleCapacity={vehicleCapacity} />;
};

export default BoardingScanPage;
