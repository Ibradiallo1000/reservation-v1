/**
 * Planification : associer créneaux (trajet + date + heure) à un véhicule disponible en ville.
 * Les affectations « planned » sont validées par la logistique (contrôleur flotte / admin).
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { collection, doc, getDoc, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { useAuth } from "@/contexts/AuthContext";
import { getAgencyCityFromDoc } from "@/modules/agence/utils/agencyCity";
import { listVehiclesAvailableInCity } from "@/modules/compagnie/fleet/vehiclesService";
import { normalizeCity } from "@/shared/utils/normalizeCity";
import type { VehicleDoc } from "@/modules/compagnie/fleet/vehicleTypes";
import {
  createPlannedTripAssignment,
  subscribeTripAssignmentsForDate,
  updatePlannedTripAssignmentVehicle,
  validateTripAssignment,
  type TripAssignmentDoc,
} from "./tripAssignmentService";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton } from "@/ui";
import { CalendarRange, Truck } from "lucide-react";
import { toast } from "sonner";

type WeeklyTripRow = {
  id: string;
  departure: string;
  arrival: string;
  horaires: Record<string, string[]>;
  active: boolean;
};

function weekdayFRFromIso(iso: string): string {
  const parts = iso.split("-").map(Number);
  const y = parts[0] ?? 0;
  const m = parts[1] ?? 1;
  const d = parts[2] ?? 1;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
}

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

const TripPlanningPage: React.FC = () => {
  const { user } = useAuth() as {
    user?: { companyId?: string; agencyId?: string; role?: string | string[] };
  };
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";

  const rolesArr = useMemo(
    () => (Array.isArray(user?.role) ? user.role : user?.role ? [user.role] : []),
    [user?.role]
  );
  const has = useCallback((r: string) => rolesArr.includes(r), [rolesArr]);

  const canPlan = has("chefAgence") || has("superviseur") || has("admin_compagnie");
  const canValidate = has("agency_fleet_controller") || has("admin_compagnie");

  const [agencyCity, setAgencyCity] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => toLocalISODate(new Date()));
  const [weeklyTrips, setWeeklyTrips] = useState<WeeklyTripRow[]>([]);
  const [vehicles, setVehicles] = useState<Array<VehicleDoc & { id: string }>>([]);
  const [assignments, setAssignments] = useState<Array<TripAssignmentDoc & { id: string }>>([]);
  const [loadingAgency, setLoadingAgency] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [pickVehicleBySlot, setPickVehicleBySlot] = useState<Record<string, string>>({});
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editVehicleId, setEditVehicleId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  /** Empêche double envoi planification (tous les créneaux bloqués pendant une requête). */
  const [planningSlotKey, setPlanningSlotKey] = useState<string | null>(null);
  const [validatingAssignmentId, setValidatingAssignmentId] = useState<string | null>(null);

  const dayName = useMemo(() => weekdayFRFromIso(selectedDate), [selectedDate]);

  const slots = useMemo(() => {
    const list: Array<{ tripId: string; departure: string; arrival: string; heure: string }> = [];
    weeklyTrips
      .filter((t) => t.active && (t.horaires?.[dayName]?.length ?? 0) > 0)
      .forEach((t) => {
        (t.horaires[dayName] ?? [])
          .slice()
          .sort()
          .forEach((heure) => {
            list.push({
              tripId: t.id,
              departure: t.departure,
              arrival: t.arrival,
              heure,
            });
          });
      });
    return list;
  }, [weeklyTrips, dayName]);

  const assignmentBySlotKey = useMemo(() => {
    const m = new Map<string, TripAssignmentDoc & { id: string }>();
    assignments.forEach((a) => {
      if (a.status !== "planned" && a.status !== "validated") return;
      m.set(`${a.tripId}|${a.date}|${a.heure}`, a);
    });
    return m;
  }, [assignments]);

  const plateByVehicleId = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach((v) => m.set(v.id, String(v.plateNumber ?? v.id)));
    return m;
  }, [vehicles]);

  const plateLabel = useCallback(
    (vehicleId: string) => plateByVehicleId.get(vehicleId) ?? vehicleId,
    [plateByVehicleId]
  );

  useEffect(() => {
    if (!companyId || !agencyId) {
      setLoadingAgency(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoadingAgency(true);
      try {
        const snap = await getDoc(doc(db, `companies/${companyId}/agences/${agencyId}`));
        const city = getAgencyCityFromDoc(snap.exists() ? (snap.data() as Record<string, unknown>) : null);
        if (!cancelled) setAgencyCity(city);
      } finally {
        if (!cancelled) setLoadingAgency(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    let cancelled = false;
    getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/weeklyTrips`)).then((snap) => {
      if (cancelled) return;
      setWeeklyTrips(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          return {
            id: d.id,
            departure: String(data.departure ?? ""),
            arrival: String(data.arrival ?? ""),
            horaires: (data.horaires as Record<string, string[]>) ?? {},
            active: data.active !== false,
          };
        })
      );
    });
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId]);

  useEffect(() => {
    if (!companyId || !agencyCity) {
      setVehicles([]);
      return;
    }
    let cancelled = false;
    setLoadingVehicles(true);
    listVehiclesAvailableInCity(companyId, normalizeCity(agencyCity), { limitCount: 200, agencyId })
      .then(({ vehicles: v }) => {
        if (!cancelled) setVehicles(v);
      })
      .catch(() => {
        if (!cancelled) setVehicles([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingVehicles(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, agencyId, agencyCity]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const unsub = subscribeTripAssignmentsForDate(companyId, agencyId, selectedDate, setAssignments, () => {
      setAssignments([]);
    });
    return () => unsub();
  }, [companyId, agencyId, selectedDate]);

  useEffect(() => {
    setEditingAssignmentId(null);
    setEditVehicleId("");
  }, [selectedDate]);

  const handlePlan = async (tripId: string, heure: string) => {
    const key = `${tripId}|${selectedDate}|${heure}`;
    const vehicleId = pickVehicleBySlot[key] ?? "";
    if (!vehicleId) {
      toast.error("Choisissez un véhicule.");
      return;
    }
    if (planningSlotKey != null) return;
    setPlanningSlotKey(key);
    try {
      await createPlannedTripAssignment(companyId, agencyId, {
        tripId,
        date: selectedDate,
        heure,
        vehicleId,
      });
      const plate = plateLabel(vehicleId);
      toast.success(`✔ Véhicule assigné : ${plate} — en attente de validation logistique.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Échec de l’enregistrement.");
    } finally {
      setPlanningSlotKey(null);
    }
  };

  const handleSaveVehicleEdit = async (assignmentId: string) => {
    if (!editVehicleId.trim()) {
      toast.error("Choisissez un véhicule.");
      return;
    }
    setSavingEdit(true);
    try {
      await updatePlannedTripAssignmentVehicle(companyId, agencyId, assignmentId, editVehicleId.trim());
      toast.success("Véhicule mis à jour (toujours en attente de validation logistique).");
      setEditingAssignmentId(null);
      setEditVehicleId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d’enregistrer.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleValidate = async (assignmentId: string) => {
    if (validatingAssignmentId != null) return;
    setValidatingAssignmentId(assignmentId);
    try {
      await validateTripAssignment(companyId, agencyId, assignmentId);
      toast.success("Affectation validée — visible à l’embarquement.");
    } catch {
      toast.error("Impossible de valider.");
    } finally {
      setValidatingAssignmentId(null);
    }
  };

  if (!companyId || !agencyId) {
    return (
      <StandardLayoutWrapper>
        <p className="text-gray-600 dark:text-gray-300">Agence ou compagnie manquante.</p>
      </StandardLayoutWrapper>
    );
  }

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-5xl">
      <PageHeader
        title="Planification"
        subtitle="Associez chaque départ à un véhicule disponible dans la ville de l’agence. La logistique valide avant embarquement."
        icon={CalendarRange}
      />

      <SectionCard title="Paramètres">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600 dark:text-gray-300">Date</span>
            <input
              type="date"
              className="rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-gray-900 dark:text-white"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </label>
          <div className="text-sm text-gray-600 dark:text-gray-300">
            {loadingAgency ? "Chargement agence…" : `Véhicules disponibles à ${agencyCity || "—"}`}
          </div>
        </div>
        {!canPlan && !canValidate && (
          <p className="mt-3 text-amber-700 dark:text-amber-300 text-sm">
            Votre rôle ne permet pas de planifier ni de valider sur cette page.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Véhicules disponibles">
        {loadingVehicles ? (
          <p className="text-gray-500">Chargement…</p>
        ) : vehicles.length === 0 ? (
          <p className="text-gray-500">Aucun véhicule disponible pour cette ville.</p>
        ) : (
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
            {vehicles.map((v) => (
              <li
                key={v.id}
                className="flex items-center gap-2 rounded-lg border border-gray-100 dark:border-slate-600 px-3 py-2 bg-gray-50/80 dark:bg-slate-800/50"
              >
                <Truck className="w-4 h-4 shrink-0 opacity-70" />
                <span>
                  {(v.plateNumber ?? v.id).toString()}
                  {typeof v.capacity === "number" ? ` — ${v.capacity} places` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Créneaux et affectations">
        {slots.length === 0 ? (
          <p className="text-gray-500">Aucun départ prévu ce jour-là dans les trajets hebdomadaires.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200 dark:border-slate-600">
                  <th className="py-2 pr-2">Trajet</th>
                  <th className="py-2 pr-2">Heure</th>
                  <th className="py-2 pr-2">Véhicule</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => {
                  const slotKey = `${s.tripId}|${selectedDate}|${s.heure}`;
                  const existing = assignmentBySlotKey.get(slotKey);
                  const pickKey = slotKey;
                  const isEditingThis = existing != null && editingAssignmentId === existing.id;
                  const assignedPlate = existing ? plateLabel(existing.vehicleId) : "";
                  return (
                    <tr key={slotKey} className="border-b border-gray-100 dark:border-slate-700/80">
                      <td className="py-3 pr-2">
                        {s.departure} → {s.arrival}
                      </td>
                      <td className="py-3 pr-2 font-medium">{s.heure}</td>
                      <td className="py-3 pr-2">
                        {existing && !isEditingThis ? (
                          <span className="text-sm text-gray-800 dark:text-gray-200">
                            ✔ Véhicule assigné :{" "}
                            <span className="font-medium tabular-nums">{assignedPlate}</span>
                            {existing.status === "validated" ? (
                              <span className="ml-2 text-xs font-normal text-emerald-700 dark:text-emerald-300">
                                (validé logistique)
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        {existing && isEditingThis ? (
                          <select
                            className="max-w-[220px] rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-gray-900 dark:text-white"
                            value={editVehicleId}
                            onChange={(e) => setEditVehicleId(e.target.value)}
                          >
                            <option value="">Choisir…</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.plateNumber ?? v.id}
                                {typeof v.capacity === "number" ? ` (${v.capacity} pl.)` : ""}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {!existing && canPlan ? (
                          <select
                            className="max-w-[220px] rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1 text-gray-900 dark:text-white disabled:opacity-50"
                            disabled={planningSlotKey != null}
                            value={pickVehicleBySlot[pickKey] ?? ""}
                            onChange={(e) =>
                              setPickVehicleBySlot((prev) => ({ ...prev, [pickKey]: e.target.value }))
                            }
                          >
                            <option value="">Choisir…</option>
                            {vehicles.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.plateNumber ?? v.id}
                                {typeof v.capacity === "number" ? ` (${v.capacity} pl.)` : ""}
                              </option>
                            ))}
                          </select>
                        ) : null}
                        {!existing && !canPlan ? <span className="text-gray-400">—</span> : null}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                          {!existing && canPlan && (
                            <ActionButton
                              size="sm"
                              variant="primary"
                              disabled={planningSlotKey != null}
                              onClick={() => void handlePlan(s.tripId, s.heure)}
                            >
                              {planningSlotKey === slotKey ? "Envoi…" : "Planifier"}
                            </ActionButton>
                          )}
                          {existing?.status === "planned" && canPlan && !isEditingThis && (
                            <ActionButton
                              size="sm"
                              variant="secondary"
                              disabled={planningSlotKey != null}
                              onClick={() => {
                                setEditingAssignmentId(existing.id);
                                setEditVehicleId(existing.vehicleId);
                              }}
                            >
                              Modifier
                            </ActionButton>
                          )}
                          {existing?.status === "planned" && canPlan && isEditingThis && (
                            <>
                              <ActionButton
                                size="sm"
                                variant="primary"
                                disabled={savingEdit}
                                onClick={() => void handleSaveVehicleEdit(existing.id)}
                              >
                                {savingEdit ? "…" : "Enregistrer"}
                              </ActionButton>
                              <ActionButton
                                size="sm"
                                variant="secondary"
                                disabled={savingEdit}
                                onClick={() => {
                                  setEditingAssignmentId(null);
                                  setEditVehicleId("");
                                }}
                              >
                                Annuler
                              </ActionButton>
                            </>
                          )}
                          {existing?.status === "planned" && canValidate && (
                            <ActionButton
                              size="sm"
                              variant="secondary"
                              disabled={validatingAssignmentId != null}
                              onClick={() => void handleValidate(existing.id)}
                            >
                              {validatingAssignmentId === existing.id ? "Validation…" : "Valider (logistique)"}
                            </ActionButton>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default TripPlanningPage;
