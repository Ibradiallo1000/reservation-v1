// src/modules/agence/fleet/FleetAssignmentPage.tsx
// Phase 3: Refactor from AffectationVehiculePage — writes to fleetVehicles + legacy affectations.
import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { affectationKey, type FleetVehicleDoc, type FleetVehicleStatus } from "./types";

type WeeklyTrip = {
  id: string;
  departure: string;
  arrival: string;
  horaires: Record<string, string[]>;
  active: boolean;
};

type AgencyItem = { id: string; nom: string };

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const weekdayFR = (d: Date) =>
  d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

type LegacyAffectation = {
  busNumber?: string;
  immatriculation?: string;
  chauffeur?: string;
  chefEmbarquement?: string;
  tripId?: string | null;
  date?: string;
  heure?: string;
  updatedAt?: unknown;
};

const FleetAssignmentRow: React.FC<{
  companyId: string;
  agencyId: string;
  trip: WeeklyTrip;
  date: string;
  heure: string;
  fleetVehicleIds: string[];
  onSaved?: () => void;
}> = ({ companyId, agencyId, trip, date, heure, fleetVehicleIds, onSaved }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busNumber, setBusNumber] = useState("");
  const [immat, setImmat] = useState("");
  const [chauffeur, setChauffeur] = useState("");
  const [convoyeur, setConvoyeur] = useState("");
  const [capacity, setCapacity] = useState<number>(50);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [exists, setExists] = useState(false);

  const key = useMemo(() => affectationKey(trip.departure, trip.arrival, heure, date), [trip.departure, trip.arrival, heure, date]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const legacyRef = doc(db, `companies/${companyId}/agences/${agencyId}/affectations/${key}`);
        const legacySnap = await getDoc(legacyRef);
        const fleetRef = collection(db, `companies/${companyId}/fleetVehicles`);
        const q = query(
          fleetRef,
          where("currentAgencyId", "==", agencyId),
          where("currentDate", "==", date),
          where("currentHeure", "==", heure),
          where("currentTripId", "==", trip.id)
        );
        const fleetSnap = await getDocs(q);

        if (!cancelled) {
          if (legacySnap.exists()) {
            const d = legacySnap.data() as LegacyAffectation;
            setBusNumber(d.busNumber ?? "");
            setImmat(d.immatriculation ?? "");
            setChauffeur(d.chauffeur ?? "");
            setConvoyeur(d.chefEmbarquement ?? "");
            setExists(true);
          } else {
            setBusNumber("");
            setImmat("");
            setChauffeur("");
            setConvoyeur("");
            setExists(false);
          }
          if (!fleetSnap.empty) {
            const first = fleetSnap.docs[0];
            setVehicleId(first.id);
            const data = first.data();
            setCapacity((data.capacity as number) ?? 50);
            setChauffeur((data.chauffeurName as string) ?? chauffeur);
            setConvoyeur((data.convoyeurName as string) ?? convoyeur);
          } else {
            setVehicleId(null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, agencyId, key, date, heure, trip.id]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const legacyRef = doc(db, `companies/${companyId}/agences/${agencyId}/affectations/${key}`);
      const legacyPayload: LegacyAffectation = {
        busNumber: busNumber || "",
        immatriculation: immat || "",
        chauffeur: chauffeur || "",
        chefEmbarquement: convoyeur || "",
        tripId: trip.id || null,
        date,
        heure,
        updatedAt: new Date(),
      };
      await setDoc(legacyRef, legacyPayload, { merge: true });

      const fleetRef = collection(db, `companies/${companyId}/fleetVehicles`);
      const now = serverTimestamp();
      const fleetPayload: FleetVehicleDoc = {
        plateNumber: busNumber || immat || "—",
        internalCode: busNumber || immat || key,
        capacity,
        status: "assigned" as FleetVehicleStatus,
        currentAgencyId: agencyId,
        destinationAgencyId: null,
        currentTripId: trip.id || null,
        currentDeparture: trip.departure,
        currentArrival: trip.arrival,
        currentDate: date,
        currentHeure: heure,
        departureTime: null,
        estimatedArrivalTime: null,
        lastMovementAt: now,
        lastMovementBy: null,
        chauffeurName: chauffeur || "",
        convoyeurName: convoyeur || "",
        createdAt: now,
        updatedAt: now,
      };

      if (vehicleId) {
        await setDoc(doc(db, `companies/${companyId}/fleetVehicles/${vehicleId}`), { ...fleetPayload, updatedAt: now }, { merge: true });
      } else {
        const newRef = doc(fleetRef);
        await setDoc(newRef, { ...fleetPayload, id: newRef.id });
        setVehicleId(newRef.id);
      }
      setExists(true);
      onSaved?.();
    } catch (e) {
      console.error(e);
      alert("Échec de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }, [companyId, agencyId, key, busNumber, immat, chauffeur, convoyeur, capacity, vehicleId, trip.id, trip.departure, trip.arrival, date, heure, onSaved]);

  return (
    <tr className="border-t">
      <td className="px-3 py-2 whitespace-nowrap text-sm">
        <div className="font-medium">{trip.departure} → {trip.arrival}</div>
        <div className="text-xs text-gray-500">{date} • {heure}</div>
      </td>
      <td className="px-2 py-2">
        <input className="w-32 px-2 py-1 border rounded text-sm" placeholder="N° Bus" value={busNumber} onChange={(e) => setBusNumber(e.target.value)} disabled={loading || saving} />
      </td>
      <td className="px-2 py-2">
        <input className="w-32 px-2 py-1 border rounded text-sm" placeholder="Immat." value={immat} onChange={(e) => setImmat(e.target.value)} disabled={loading || saving} />
      </td>
      <td className="px-2 py-2">
        <input type="number" min={1} className="w-20 px-2 py-1 border rounded text-sm" value={capacity} onChange={(e) => setCapacity(Number(e.target.value) || 50)} disabled={loading || saving} />
      </td>
      <td className="px-2 py-2">
        <input className="w-40 px-2 py-1 border rounded text-sm" placeholder="Chauffeur" value={chauffeur} onChange={(e) => setChauffeur(e.target.value)} disabled={loading || saving} />
      </td>
      <td className="px-2 py-2">
        <input className="w-40 px-2 py-1 border rounded text-sm" placeholder="Convoyeur" value={convoyeur} onChange={(e) => setConvoyeur(e.target.value)} disabled={loading || saving} />
      </td>
      <td className="px-2 py-2 text-center">
        <button
          onClick={save}
          disabled={saving || loading}
          className={`px-3 py-1 rounded text-sm text-white ${exists ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"}`}
        >
          {saving ? "…" : exists ? "Mettre à jour" : "Affecter"}
        </button>
      </td>
      <td className="px-3 py-2 text-xs text-center">
        {loading ? "…" : exists ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Affecté</span>
        ) : (
          <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200">Non affecté</span>
        )}
      </td>
    </tr>
  );
};

const FleetAssignmentPage: React.FC = () => {
  const { user, company } = useAuth() as { user: { companyId?: string; agencyId?: string }; company: unknown };
  const companyId = user?.companyId ?? null;
  const userAgencyId = user?.agencyId ?? null;
  const theme = {
    primary: (company as { couleurPrimaire?: string })?.couleurPrimaire ?? "#0ea5e9",
    secondary: (company as { couleurSecondaire?: string })?.couleurSecondaire ?? "#f59e0b",
    bg: "#f7f8fa",
  };

  const [agencies, setAgencies] = useState<AgencyItem[]>([]);
  const [selectedAgencyId, setSelectedAgencyId] = useState<string | null>(userAgencyId);
  const [selectedDate, setSelectedDate] = useState<string>(toLocalISO(new Date()));
  const [dayTrips, setDayTrips] = useState<WeeklyTrip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<WeeklyTrip | null>(null);
  const [selectedHeure, setSelectedHeure] = useState<string>("");
  const [fleetVehicleIds, setFleetVehicleIds] = useState<string[]>([]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, `companies/${companyId}/agences`)).then((snap) => {
      const list = snap.docs.map((d) => ({
        id: d.id,
        nom: (d.data() as { nom?: string; name?: string })?.nom ?? (d.data() as { name?: string })?.name ?? d.id,
      }));
      setAgencies(list);
      if (!userAgencyId && list.length === 1) setSelectedAgencyId(list[0].id);
    });
  }, [companyId, userAgencyId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, `companies/${companyId}/fleetVehicles`)).then((snap) => {
      setFleetVehicleIds(snap.docs.map((d) => d.id));
    });
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !selectedAgencyId) {
      setDayTrips([]);
      setSelectedTrip(null);
      setSelectedHeure("");
      return;
    }
    const weeklyTripsRef = collection(db, `companies/${companyId}/agences/${selectedAgencyId}/weeklyTrips`);
    getDocs(weeklyTripsRef).then((snap) => {
      const dayName = weekdayFR(new Date(selectedDate));
      const trips = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as WeeklyTrip))
        .filter((t) => t.active && (t.horaires?.[dayName] || []).length > 0);
      setDayTrips(trips);
    });
  }, [companyId, selectedAgencyId, selectedDate]);

  const hoursForSelected = useMemo(() => {
    if (!selectedTrip) return [];
    const dayName = weekdayFR(new Date(selectedDate));
    return (selectedTrip.horaires?.[dayName] || []).slice().sort();
  }, [selectedTrip, selectedDate]);

  if (!user) return null;

  return (
    <div className="min-h-screen" style={{ background: theme.bg }}>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white rounded-xl border p-4 shadow-sm space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold" style={{ color: theme.secondary }}>Agence :</span>
            {userAgencyId ? (
              <span className="px-2 py-1 rounded border bg-gray-50 text-sm">
                {agencies.find((a) => a.id === (selectedAgencyId || userAgencyId))?.nom ?? "—"}
              </span>
            ) : (
              <select
                className="px-2 py-1 border rounded text-sm"
                value={selectedAgencyId ?? ""}
                onChange={(e) => setSelectedAgencyId(e.target.value || null)}
              >
                <option value="">— Choisir —</option>
                {agencies.map((a) => (
                  <option key={a.id} value={a.id}>{a.nom}</option>
                ))}
              </select>
            )}
            <span className="font-semibold" style={{ color: theme.secondary }}>Date :</span>
            <input type="date" className="border rounded px-3 py-1" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
          </div>
          <div className="font-semibold">Trajet & heure</div>
          <div className="flex flex-wrap gap-2">
            {!selectedAgencyId ? (
              <div className="text-gray-500">Choisissez une agence.</div>
            ) : dayTrips.length === 0 ? (
              <div className="text-gray-500">Aucun trajet pour cette date.</div>
            ) : (
              <>
                {dayTrips.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { setSelectedTrip(t); setSelectedHeure(""); }}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${selectedTrip?.id === t.id ? "text-white" : "bg-gray-200 text-gray-700"}`}
                    style={selectedTrip?.id === t.id ? { background: theme.primary } : undefined}
                  >
                    {t.departure} → {t.arrival}
                  </button>
                ))}
                {selectedTrip && (
                  <div className="flex flex-wrap items-center gap-2">
                    {hoursForSelected.map((h) => (
                      <button
                        key={h}
                        type="button"
                        onClick={() => setSelectedHeure(h)}
                        className={`px-2 py-1 rounded border text-sm ${selectedHeure === h ? "text-white" : "bg-white text-gray-700"}`}
                        style={selectedHeure === h ? { background: theme.primary, borderColor: theme.primary } : undefined}
                      >
                        {h}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border shadow-sm">
          <div className="px-4 py-3 border-b font-semibold">Affectation véhicule & équipage (flotte)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left">Trajet</th>
                  <th className="px-3 py-2 text-left">N° Bus</th>
                  <th className="px-3 py-2 text-left">Immat.</th>
                  <th className="px-3 py-2 text-left">Capacité</th>
                  <th className="px-3 py-2 text-left">Chauffeur</th>
                  <th className="px-3 py-2 text-left">Convoyeur</th>
                  <th className="px-3 py-2 text-center w-32">Action</th>
                  <th className="px-3 py-2 text-center w-32">Statut</th>
                </tr>
              </thead>
              <tbody>
                {selectedTrip && selectedHeure ? (
                  <FleetAssignmentRow
                    key={`${selectedTrip.id}_${selectedHeure}`}
                    companyId={companyId!}
                    agencyId={(selectedAgencyId ?? userAgencyId)!}
                    trip={selectedTrip}
                    date={selectedDate}
                    heure={selectedHeure}
                    fleetVehicleIds={fleetVehicleIds}
                  />
                ) : (
                  (() => {
                    const dayName = weekdayFR(new Date(selectedDate));
                    const rows: JSX.Element[] = [];
                    dayTrips.forEach((t) => {
                      (t.horaires?.[dayName] || []).slice().sort().forEach((h) => {
                        rows.push(
                          <FleetAssignmentRow
                            key={`${t.id}_${h}`}
                            companyId={companyId!}
                            agencyId={(selectedAgencyId ?? userAgencyId)!}
                            trip={t}
                            date={selectedDate}
                            heure={h}
                            fleetVehicleIds={fleetVehicleIds}
                          />
                        );
                      });
                    });
                    if (rows.length === 0) {
                      return (
                        <tr>
                          <td className="px-3 py-4 text-gray-500" colSpan={8}>Aucun trajet pour cette date.</td>
                        </tr>
                      );
                    }
                    return rows;
                  })()
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FleetAssignmentPage;
