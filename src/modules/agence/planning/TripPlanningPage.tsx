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
import { canAssignVehicle, deriveOperationStatus } from "@/modules/compagnie/fleet/vehicleOperationStateMachine";
import {
  acquirePlanningSlotLock,
  assignmentTimeRangesOverlap,
  cancelPlannedTripAssignment,
  createPlannedTripAssignment,
  DEFAULT_TRIP_DURATION_MINUTES,
  releasePlanningSlotLock,
  subscribeTripAssignmentsForDate,
  subscribeTripAssignmentsFromDate,
  tripAssignmentDocId,
  updatePlannedTripAssignmentVehicle,
  validateTripAssignment,
  type TripAssignmentDoc,
} from "./tripAssignmentService";
import { recomputeCompanyPlanningStats } from "./planningStatsService";
import { StandardLayoutWrapper, PageHeader, SectionCard, ActionButton } from "@/ui";
import { CalendarRange, Loader2, Truck } from "lucide-react";
import DatePicker from "react-datepicker";
import { fr } from "date-fns/locale";
import "react-datepicker/dist/react-datepicker.css";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type WeeklyTripRow = {
  id: string;
  departure: string;
  arrival: string;
  horaires: Record<string, string[]>;
  active: boolean;
  /** Minutes — conflits véhicule (chevauchement avec d’autres départs). */
  tripDurationMinutes?: number;
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

function normHeure(h: string): string {
  return String(h ?? "").trim();
}

function slotKey(tripId: string, date: string, heure: string): string {
  return `${tripId}|${date}|${normHeure(heure)}`;
}

function parseSlotKey(key: string): { tripId: string; date: string; heure: string } | null {
  const i = key.indexOf("|");
  if (i < 0) return null;
  const j = key.indexOf("|", i + 1);
  if (j < 0) return null;
  return { tripId: key.slice(0, i), date: key.slice(i + 1, j), heure: key.slice(j + 1) };
}

function durationForAssignment(
  a: TripAssignmentDoc & { id: string },
  tripDurationByTripId: Record<string, number>
): number {
  if (typeof a.tripDurationMinutes === "number" && a.tripDurationMinutes > 0) {
    return Math.min(24 * 60, Math.floor(a.tripDurationMinutes));
  }
  const fromWeekly = tripDurationByTripId[a.tripId];
  return typeof fromWeekly === "number" && fromWeekly > 0 ? fromWeekly : DEFAULT_TRIP_DURATION_MINUTES;
}

/** Véhicule déjà utilisé sur une plage [départ, départ+durée) qui chevauche le créneau ciblé. */
function vehicleBusyOverlapElsewhere(
  vehicleId: string,
  currentKey: string,
  date: string,
  heure: string,
  tripId: string,
  rows: Array<TripAssignmentDoc & { id: string }>,
  tripDurationByTripId: Record<string, number>
): boolean {
  const h = normHeure(heure);
  const durSelf =
    tripDurationByTripId[tripId] ??
    DEFAULT_TRIP_DURATION_MINUTES;
  for (const a of rows) {
    if (a.status !== "planned" && a.status !== "validated") continue;
    if (a.date !== date) continue;
    if (a.vehicleId !== vehicleId) continue;
    const k = slotKey(a.tripId, a.date, a.heure);
    if (k === currentKey) continue;
    const dOther = durationForAssignment(a, tripDurationByTripId);
    if (assignmentTimeRangesOverlap(date, h, durSelf, { ...a, tripDurationMinutes: dOther })) {
      return true;
    }
  }
  return false;
}

function busTitle(v: VehicleDoc & { id: string }): string {
  const raw = String((v as { busNumber?: string; fleetNumber?: string }).busNumber ?? v.fleetNumber ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits) {
    const n = Math.min(999, Math.max(0, parseInt(digits, 10) || 0));
    return `Bus ${String(n).padStart(3, "0")}`;
  }
  return "Bus";
}

function slotRowStatus(existing: (TripAssignmentDoc & { id: string }) | undefined): "non" | "partiel" | "complet" {
  if (!existing) return "non";
  if (existing.status === "validated") return "complet";
  return "partiel";
}

const TripPlanningPage: React.FC = () => {
  const { user } = useAuth() as {
    user?: { uid?: string; companyId?: string; agencyId?: string; role?: string | string[] };
  };
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const uid = user?.uid ?? "";

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
  const [futureAssignments, setFutureAssignments] = useState<Array<TripAssignmentDoc & { id: string }>>([]);
  const [futureAssignmentsCapped, setFutureAssignmentsCapped] = useState(false);
  const [loadingAgency, setLoadingAgency] = useState(true);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [pickVehicleBySlot, setPickVehicleBySlot] = useState<Record<string, string>>({});
  const [focusedSlotKey, setFocusedSlotKey] = useState<string | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [editingSlotKey, setEditingSlotKey] = useState<string | null>(null);
  const [editVehicleId, setEditVehicleId] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [planningSlotKey, setPlanningSlotKey] = useState<string | null>(null);
  const [validatingAssignmentId, setValidatingAssignmentId] = useState<string | null>(null);
  const [cancellingAssignmentId, setCancellingAssignmentId] = useState<string | null>(null);
  const [recomputingStats, setRecomputingStats] = useState(false);
  const [syncingState, setSyncingState] = useState(false);

  const todayIso = useMemo(() => toLocalISODate(new Date()), []);
  const dayName = useMemo(() => weekdayFRFromIso(selectedDate), [selectedDate]);
  const [isMobileViewport, setIsMobileViewport] = useState(false);

  const selectedDateObj = useMemo(() => {
    const parts = selectedDate.split("-");
    const y = Number(parts[0] ?? 0);
    const m = Number(parts[1] ?? 0);
    const d = Number(parts[2] ?? 0);
    if (!y || !m || !d) return null;
    const dt = new Date(y, m - 1, d);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }, [selectedDate]);

  useEffect(() => {
    const update = () => setIsMobileViewport(window.innerWidth < 768);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
      m.set(slotKey(a.tripId, a.date, a.heure), a);
    });
    return m;
  }, [assignments]);

  const mergedAssignmentRows = useMemo(() => {
    const byId = new Map<string, TripAssignmentDoc & { id: string }>();
    assignments.forEach((a) => byId.set(a.id, a));
    futureAssignments.forEach((a) => byId.set(a.id, a));
    return Array.from(byId.values());
  }, [assignments, futureAssignments]);

  const tripDurationByTripId = useMemo(() => {
    const m: Record<string, number> = {};
    weeklyTrips.forEach((t) => {
      if (typeof t.tripDurationMinutes === "number" && t.tripDurationMinutes > 0) {
        m[t.id] = Math.min(24 * 60, Math.floor(t.tripDurationMinutes));
      } else {
        m[t.id] = DEFAULT_TRIP_DURATION_MINUTES;
      }
    });
    return m;
  }, [weeklyTrips]);

  const tripLabelByTripId = useMemo(() => {
    const map = new Map<string, { departure: string; arrival: string }>();
    weeklyTrips.forEach((t) => {
      map.set(t.id, { departure: t.departure, arrival: t.arrival });
    });
    return map;
  }, [weeklyTrips]);

  const assignmentContextById = useMemo(() => {
    const map = new Map<string, string>();
    mergedAssignmentRows.forEach((a) => {
      const tr = tripLabelByTripId.get(a.tripId);
      const dep = tr?.departure ?? "";
      const arr = tr?.arrival ?? "";
      const ctx = dep && arr ? `${dep} -> ${arr} ${a.heure}` : `${a.heure}`;
      map.set(a.id, ctx.trim());
    });
    return map;
  }, [mergedAssignmentRows, tripLabelByTripId]);

  const capacityByVehicleId = useMemo(() => {
    const m = new Map<string, number>();
    vehicles.forEach((v) => {
      if (typeof v.capacity === "number" && v.capacity > 0) m.set(v.id, v.capacity);
    });
    return m;
  }, [vehicles]);

  const plateByVehicleId = useMemo(() => {
    const m = new Map<string, string>();
    vehicles.forEach((v) => m.set(v.id, String(v.plateNumber ?? v.id)));
    return m;
  }, [vehicles]);

  const plateLabel = useCallback(
    (vehicleId: string) => plateByVehicleId.get(vehicleId) ?? vehicleId,
    [plateByVehicleId]
  );

  const daySlotStats = useMemo(() => {
    let non = 0;
    let partiel = 0;
    let complet = 0;
    for (const s of slots) {
      const sk = slotKey(s.tripId, selectedDate, s.heure);
      const ex = assignmentBySlotKey.get(sk);
      const st = slotRowStatus(ex);
      if (st === "non") non++;
      else if (st === "partiel") partiel++;
      else complet++;
    }
    return { non, partiel, complet, total: slots.length };
  }, [slots, selectedDate, assignmentBySlotKey]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    const unsub = subscribeTripAssignmentsFromDate(
      companyId,
      agencyId,
      todayIso,
      ({ rows, capped }) => {
        setFutureAssignments(rows);
        setFutureAssignmentsCapped(capped);
      },
      () => {
        setFutureAssignments([]);
        setFutureAssignmentsCapped(false);
      }
    );
    return () => unsub();
  }, [companyId, agencyId, todayIso]);

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
          const rawDur = Number(
            data.tripDurationMinutes ?? data.durationMinutes ?? data.dureeMinutes ?? data.dureeTrajetMinutes
          );
          const tripDurationMinutes =
            Number.isFinite(rawDur) && rawDur > 0 ? Math.min(24 * 60, Math.floor(rawDur)) : undefined;
          return {
            id: d.id,
            departure: String(data.departure ?? ""),
            arrival: String(data.arrival ?? ""),
            horaires: (data.horaires as Record<string, string[]>) ?? {},
            active: data.active !== false,
            tripDurationMinutes,
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
    setEditingSlotKey(null);
    setFocusedSlotKey(null);
  }, [selectedDate]);

  const clearEdit = useCallback(() => {
    setEditingAssignmentId(null);
    setEditVehicleId("");
    setEditingSlotKey(null);
  }, []);

  const onVehicleCardClick = useCallback(
    (vehicleId: string, skForConflict: string | null, tripId: string, heure: string, allowVehicleId?: string) => {
      if (editingAssignmentId && editingSlotKey) {
        if (
          vehicleBusyOverlapElsewhere(
            vehicleId,
            editingSlotKey,
            selectedDate,
            heure,
            tripId,
            mergedAssignmentRows,
            tripDurationByTripId
          ) &&
          !(allowVehicleId && vehicleId === allowVehicleId)
        ) {
          toast.error("Ce bus est déjà pris sur une plage horaire qui chevauche ce départ.");
          return;
        }
        setEditVehicleId(vehicleId);
        return;
      }
      const targetSlotKey = focusedSlotKey;
      if (!targetSlotKey) {
        toast.error("Veuillez d’abord sélectionner un créneau");
        return;
      }
      const sk = skForConflict ?? targetSlotKey;
      const parsed = parseSlotKey(sk);
      if (!parsed) return;
      if (
        vehicleBusyOverlapElsewhere(
          vehicleId,
          sk,
          selectedDate,
          parsed.heure,
          parsed.tripId,
          mergedAssignmentRows,
          tripDurationByTripId
        )
      ) {
        toast.error("Ce bus est déjà pris sur une plage horaire qui chevauche ce départ.");
        return;
      }
      setPickVehicleBySlot((prev) => ({ ...prev, [targetSlotKey!]: vehicleId }));
      toast.message("Véhicule sélectionné pour ce départ.");
    },
    [
      editingAssignmentId,
      editingSlotKey,
      focusedSlotKey,
      mergedAssignmentRows,
      selectedDate,
      tripDurationByTripId,
    ]
  );

  const handlePlan = async (tripId: string, heure: string) => {
    const key = slotKey(tripId, selectedDate, heure);
    const vehicleId = pickVehicleBySlot[key] ?? "";
    if (!vehicleId) {
      toast.error("Choisissez un véhicule en cliquant une carte.");
      return;
    }
    if (!uid) {
      toast.error("Session invalide — reconnectez-vous.");
      return;
    }
    if (planningSlotKey != null) return;
    const lockId = tripAssignmentDocId(tripId, selectedDate, normHeure(heure));
    setPlanningSlotKey(key);
    const payload = {
      companyId,
      agencyId,
      tripId,
      date: selectedDate,
      heure,
      vehicleId,
    };
    console.log("[TripPlanningPage] createPlannedTripAssignment payload", payload);
    try {
      setSyncingState(true);
      try {
        await acquirePlanningSlotLock(companyId, agencyId, lockId, uid);
      } catch (e) {
        console.error("[TripPlanningPage] acquirePlanningSlotLock error", e);
        throw e;
      }
      try {
        await createPlannedTripAssignment(companyId, agencyId, {
          tripId,
          date: selectedDate,
          heure,
          vehicleId,
        });
        console.log("[TripPlanningPage] createPlannedTripAssignment success", { assignmentId: lockId });
        setAssignments((prev) => {
          const optimistic: TripAssignmentDoc & { id: string } = {
            id: lockId,
            tripId,
            date: selectedDate,
            heure,
            vehicleId,
            agencyId,
            status: "planned",
            createdAt: new Date() as unknown as import("firebase/firestore").Timestamp,
            updatedAt: new Date() as unknown as import("firebase/firestore").Timestamp,
          };
          const exists = prev.some((a) => a.id === lockId);
          if (exists) return prev.map((a) => (a.id === lockId ? { ...a, ...optimistic } : a));
          return [optimistic, ...prev];
        });
        toast.success("Trajet planifié");
      } finally {
        await releasePlanningSlotLock(companyId, agencyId, lockId, uid);
      }
    } catch (e) {
      console.error("[TripPlanningPage] createPlannedTripAssignment error", e);
      toast.error(e instanceof Error ? e.message : "Échec de l’enregistrement.");
    } finally {
      setPlanningSlotKey(null);
      setTimeout(() => setSyncingState(false), 1200);
    }
  };

  const handleSaveVehicleEdit = async (assignmentId: string) => {
    if (!editVehicleId.trim()) {
      toast.error("Choisissez un véhicule (carte).");
      return;
    }
    if (!uid) {
      toast.error("Session invalide — reconnectez-vous.");
      return;
    }
    setSavingEdit(true);
    try {
      setSyncingState(true);
      await acquirePlanningSlotLock(companyId, agencyId, assignmentId, uid);
      try {
        await updatePlannedTripAssignmentVehicle(companyId, agencyId, assignmentId, editVehicleId.trim());
        toast.success("Véhicule mis à jour (toujours en attente de validation logistique).");
        clearEdit();
      } finally {
        await releasePlanningSlotLock(companyId, agencyId, assignmentId, uid);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d’enregistrer.");
    } finally {
      setSavingEdit(false);
      setTimeout(() => setSyncingState(false), 1200);
    }
  };

  const handleCancelPlanned = async (assignmentId: string) => {
    if (!uid) {
      toast.error("Session invalide — reconnectez-vous.");
      return;
    }
    if (cancellingAssignmentId != null) return;
    const ok = window.confirm("Annuler cette planification ? Le créneau repassera sans véhicule.");
    if (!ok) return;
    setCancellingAssignmentId(assignmentId);
    try {
      setSyncingState(true);
      await acquirePlanningSlotLock(companyId, agencyId, assignmentId, uid);
      try {
        await cancelPlannedTripAssignment(companyId, agencyId, assignmentId);
        toast.success("Affectation annulée.");
        clearEdit();
      } finally {
        await releasePlanningSlotLock(companyId, agencyId, assignmentId, uid);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d’annuler.");
    } finally {
      setCancellingAssignmentId(null);
      setTimeout(() => setSyncingState(false), 1200);
    }
  };

  const handleRecomputePlanningStats = async () => {
    if (!companyId) return;
    setRecomputingStats(true);
    try {
      await recomputeCompanyPlanningStats(companyId);
      toast.success("Agrégats planification recalculés.");
    } catch {
      toast.error("Échec du recalcul. Réessayez ou contactez le support.");
    } finally {
      setRecomputingStats(false);
    }
  };

  const handleValidate = async (assignmentId: string) => {
    if (validatingAssignmentId != null) return;
    setValidatingAssignmentId(assignmentId);
    try {
      setSyncingState(true);
      await validateTripAssignment(companyId, agencyId, assignmentId);
      toast.success("Affectation validée — visible à l’embarquement.");
    } catch {
      toast.error("Impossible de valider.");
    } finally {
      setValidatingAssignmentId(null);
      setTimeout(() => setSyncingState(false), 1200);
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
      {futureAssignmentsCapped && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="planning-capped-title"
        >
          <div className="max-w-md rounded-xl border border-amber-200 bg-white p-6 shadow-xl dark:border-amber-800 dark:bg-slate-900">
            <h2 id="planning-capped-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Données planification incomplètes
            </h2>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              La liste des affectations à venir est tronquée (limite temps réel). Tant que ce message est affiché, la
              planification n’est pas fiable à 100&nbsp;% — un autre opérateur peut voir un sous-ensemble différent.
            </p>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">
              Lancez un <strong>recalcul des agrégats</strong> (document <code className="text-xs">planningStats</code>)
              pour réparer les totaux, ou réduisez le volume (filtre date / support).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                type="button"
                variant="primary"
                disabled={recomputingStats || !companyId}
                onClick={() => void handleRecomputePlanningStats()}
                className="inline-flex items-center gap-2"
              >
                {recomputingStats ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Recalcul…
                  </>
                ) : (
                  "Recalculer les agrégats"
                )}
              </ActionButton>
            </div>
          </div>
        </div>
      )}
      <PageHeader
        title="Planification"
        subtitle="Associez chaque départ à un véhicule dans la ville de l’agence. La logistique valide avant embarquement."
        icon={CalendarRange}
      />

      <SectionCard
        title="Paramètres"
        right={
          <label className="inline-flex items-center gap-2 text-sm">
            <span className="text-gray-600 dark:text-gray-300 font-medium">Date</span>
            <DatePicker
              selected={selectedDateObj}
              onChange={(d) => {
                if (!d) return;
                const yyyy = d.getFullYear();
                const mm = String(d.getMonth() + 1).padStart(2, "0");
                const dd = String(d.getDate()).padStart(2, "0");
                setSelectedDate(`${yyyy}-${mm}-${dd}`);
              }}
              dateFormat="dd/MM/yyyy"
              locale={fr}
              withPortal={isMobileViewport}
              portalId="root-portal"
              shouldCloseOnSelect
              popperPlacement="bottom-end"
              popperClassName="z-[100]"
              className="w-[120px] rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-gray-900 dark:text-white transition-shadow focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </label>
        }
      >
        {syncingState && (
          <p className="text-xs text-emerald-700 dark:text-emerald-300">Synchronisation en cours…</p>
        )}
        {!canPlan && !canValidate && (
          <p className="mt-3 text-amber-700 dark:text-amber-300 text-sm">
            Votre rôle ne permet pas de planifier ni de valider sur cette page.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Créneaux et affectations">
        {slots.length === 0 ? (
          <p className="text-gray-500">Aucun départ prévu ce jour-là dans les trajets hebdomadaires.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 mb-4 text-sm">
              <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-slate-600 px-3 py-1 text-gray-700 dark:text-gray-200">
                <strong className="mr-1">{daySlotStats.non}</strong> sans véhicule{daySlotStats.non === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-1 text-amber-950 dark:text-amber-100">
                <strong className="mr-1">{daySlotStats.partiel}</strong> en attente validation
                {daySlotStats.partiel === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-1 text-emerald-950 dark:text-emerald-100">
                <strong className="mr-1">{daySlotStats.complet}</strong> confirmé{daySlotStats.complet === 1 ? "" : "s"}
              </span>
              <span className="text-gray-500 dark:text-gray-400 self-center">
                · {daySlotStats.total} créneau{daySlotStats.total > 1 ? "x" : ""}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-gray-200 dark:border-slate-600">
                    <th className="py-2 pr-2">Trajet</th>
                    <th className="py-2 pr-2">Heure</th>
                    <th className="py-2 pr-2">État</th>
                    <th className="py-2 pr-2">Véhicule</th>
                    <th className="py-2 pr-2">Places</th>
                    <th className="py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {slots.map((s) => {
                    const sk = slotKey(s.tripId, selectedDate, s.heure);
                    const existing = assignmentBySlotKey.get(sk);
                    const isEditingThis = existing != null && editingAssignmentId === existing.id;
                    const assignedPlate = existing ? plateLabel(existing.vehicleId) : "";
                    const cap = existing ? capacityByVehicleId.get(existing.vehicleId) : undefined;
                    const expected = existing?.liveStatus?.expectedCount;
                    const rowState = slotRowStatus(existing);
                    const rowFocused =
                      (focusedSlotKey === sk && !existing && canPlan) || (isEditingThis && editingSlotKey === sk);
                    return (
                      <tr
                        key={sk}
                        className={cn(
                          "border-b border-gray-100 dark:border-slate-700/80 transition-colors",
                          rowFocused && "bg-emerald-50/70 dark:bg-emerald-950/20",
                          !existing && canPlan && "cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50"
                        )}
                        onClick={() => {
                          if (!existing && canPlan) {
                            setFocusedSlotKey(sk);
                            clearEdit();
                          }
                        }}
                      >
                        <td className="py-3 pr-2">
                          {s.departure} → {s.arrival}
                        </td>
                        <td className="py-3 pr-2 font-medium">{s.heure}</td>
                        <td className="py-3 pr-2">
                          {rowState === "non" && (
                            <span className="text-gray-500 dark:text-gray-400 text-xs font-medium">Sans véhicule</span>
                          )}
                          {rowState === "partiel" && (
                            <span className="inline-flex rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 px-2 py-0.5 text-xs font-semibold">
                              En attente validation
                            </span>
                          )}
                          {rowState === "complet" && (
                            <span className="inline-flex rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 px-2 py-0.5 text-xs font-semibold">
                              Confirmé
                            </span>
                          )}
                        </td>
                        <td className="py-3 pr-2">
                          {existing && !isEditingThis ? (
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-wrap">
                              <span className="text-gray-800 dark:text-gray-200">
                                <span className="font-medium tabular-nums">{assignedPlate}</span>
                              </span>
                              {existing.status === "planned" && (
                                <span className="inline-flex w-fit items-center rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 px-2.5 py-0.5 text-xs font-semibold">
                                  Planifié
                                </span>
                              )}
                              {existing.status === "validated" && (
                                <span className="inline-flex w-fit items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-900 dark:text-emerald-100 px-2.5 py-0.5 text-xs font-semibold">
                                  Validé logistique
                                </span>
                              )}
                            </div>
                          ) : null}
                          {existing && isEditingThis ? (
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              Nouveau bus :{" "}
                              <span className="font-semibold tabular-nums">
                                {editVehicleId.trim() ? plateLabel(editVehicleId) : "—"}
                              </span>
                              <span className="block text-xs mt-1 text-gray-500">Choisissez une carte ci-dessus.</span>
                            </p>
                          ) : null}
                          {!existing && canPlan ? (
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                              {pickVehicleBySlot[sk] ? (
                                <>
                                  Véhicule sélectionné :{" "}
                                  <span className="font-semibold tabular-nums">{plateLabel(pickVehicleBySlot[sk])}</span>
                                </>
                              ) : (
                                <span className="text-gray-400">Aucun véhicule sélectionné</span>
                              )}
                            </p>
                          ) : null}
                          {!existing && !canPlan ? <span className="text-gray-400">—</span> : null}
                        </td>
                        <td className="py-3 pr-2 align-top text-gray-700 dark:text-gray-200 tabular-nums text-sm">
                          {existing && typeof expected === "number" ? (
                            <span>
                              {expected}
                              {typeof cap === "number" ? ` / ${cap}` : " / —"}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="py-3">
                          <div
                            className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {!existing && canPlan && (
                              <ActionButton
                                size="sm"
                                variant="primary"
                                disabled={planningSlotKey != null}
                                onClick={() => void handlePlan(s.tripId, s.heure)}
                                className="inline-flex items-center gap-2 min-w-[7rem] justify-center"
                              >
                                {planningSlotKey === sk ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                    Envoi…
                                  </>
                                ) : (
                                  "Planifier"
                                )}
                              </ActionButton>
                            )}
                            {(existing?.status === "planned" || existing?.status === "validated") &&
                              canPlan &&
                              !isEditingThis && (
                              <>
                                {existing.status === "planned" && (
                                  <ActionButton
                                    size="sm"
                                    variant="secondary"
                                    disabled={planningSlotKey != null || cancellingAssignmentId != null}
                                    onClick={() => {
                                      setEditingAssignmentId(existing.id);
                                      setEditingSlotKey(sk);
                                      setEditVehicleId(existing.vehicleId);
                                      setFocusedSlotKey(null);
                                    }}
                                  >
                                    Modifier
                                  </ActionButton>
                                )}
                                <ActionButton
                                  size="sm"
                                  variant="secondary"
                                  disabled={
                                    planningSlotKey != null ||
                                    cancellingAssignmentId != null ||
                                    validatingAssignmentId != null
                                  }
                                  onClick={() => void handleCancelPlanned(existing.id)}
                                >
                                  {cancellingAssignmentId === existing.id ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                                      Annulation…
                                    </>
                                  ) : (
                                    "Annuler planification"
                                  )}
                                </ActionButton>
                              </>
                            )}
                            {existing?.status === "planned" && canPlan && isEditingThis && (
                              <>
                                <ActionButton
                                  size="sm"
                                  variant="primary"
                                  disabled={savingEdit}
                                  onClick={() => void handleSaveVehicleEdit(existing.id)}
                                >
                                  {savingEdit ? (
                                    <>
                                      <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                                      …
                                    </>
                                  ) : (
                                    "Enregistrer"
                                  )}
                                </ActionButton>
                                <ActionButton
                                  size="sm"
                                  variant="secondary"
                                  disabled={savingEdit}
                                  onClick={() => {
                                    clearEdit();
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
                                {validatingAssignmentId === existing.id ? (
                                  <>
                                    <Loader2 className="w-4 h-4 animate-spin inline mr-1" />
                                    Validation…
                                  </>
                                ) : (
                                  "Valider (logistique)"
                                )}
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
          </>
        )}
      </SectionCard>

      <SectionCard title="Véhicules disponibles">
        {loadingVehicles ? (
          <div className="flex items-center gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Chargement…
          </div>
        ) : vehicles.length === 0 ? (
          <p className="text-gray-500">Aucun véhicule disponible pour cette ville.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
            {vehicles.map((v) => {
              const pickedPlan =
                focusedSlotKey != null && (pickVehicleBySlot[focusedSlotKey] ?? "") === v.id && !editingAssignmentId;
              const pickedEdit = editingAssignmentId && editVehicleId === v.id;
              const picked = pickedPlan || pickedEdit;

              let editCtx: { sk: string; tripId: string; heure: string; allowVid?: string } | null = null;
              if (editingAssignmentId && editingSlotKey) {
                const ex = assignmentBySlotKey.get(editingSlotKey);
                const p = parseSlotKey(editingSlotKey);
                if (ex) editCtx = { sk: editingSlotKey, tripId: ex.tripId, heure: ex.heure, allowVid: ex.vehicleId };
                else if (p) editCtx = { sk: editingSlotKey, tripId: p.tripId, heure: p.heure };
              }

              const disabledCard =
                editingAssignmentId && editCtx
                  ? vehicleBusyOverlapElsewhere(
                      v.id,
                      editCtx.sk,
                      selectedDate,
                      editCtx.heure,
                      editCtx.tripId,
                      mergedAssignmentRows,
                      tripDurationByTripId
                    ) && !(editCtx.allowVid && v.id === editCtx.allowVid)
                  : focusedSlotKey
                    ? (() => {
                        const fp = parseSlotKey(focusedSlotKey);
                        return fp
                          ? vehicleBusyOverlapElsewhere(
                              v.id,
                              focusedSlotKey,
                              selectedDate,
                              fp.heure,
                              fp.tripId,
                              mergedAssignmentRows,
                              tripDurationByTripId
                            )
                          : false;
                      })()
                    : false;
              const alreadyPlannedForAnother =
                String((v as any).currentAssignmentId ?? "").trim().length > 0 &&
                String((v as any).currentAssignmentId ?? "").trim() !== (editingAssignmentId ?? "");
              const operationStatus = deriveOperationStatus(v);
              const allowedByCurrentEdit =
                operationStatus === "planned" &&
                String((v as any).currentAssignmentId ?? "").trim() === (editingAssignmentId ?? "");
              const nonOperationallyAssignable = !canAssignVehicle(v) && !allowedByCurrentEdit;
              const vehicleNotAssignable = alreadyPlannedForAnother || nonOperationallyAssignable;
              const finalDisabled = disabledCard || vehicleNotAssignable;

              return (
                <button
                  key={v.id}
                  type="button"
                  disabled={finalDisabled}
                  onClick={() => {
                    if (finalDisabled) return;
                    if (editCtx) onVehicleCardClick(v.id, editCtx.sk, editCtx.tripId, editCtx.heure, editCtx.allowVid);
                    else if (focusedSlotKey) {
                      const fp = parseSlotKey(focusedSlotKey);
                      if (fp) onVehicleCardClick(v.id, focusedSlotKey, fp.tripId, fp.heure);
                    } else {
                      onVehicleCardClick(v.id, null, "", "");
                    }
                  }}
                  className={cn(
                    "w-full min-h-[46px] text-left rounded-lg border border-gray-200 bg-gray-50 px-3 py-2",
                    "flex items-center gap-2.5 transition-colors hover:bg-gray-100 cursor-pointer",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500",
                    finalDisabled && "opacity-45 cursor-not-allowed",
                    picked && "ring-2 ring-green-500 bg-green-50 border-green-200 shadow-sm"
                  )}
                  title={alreadyPlannedForAnother ? "Déjà planifié" : undefined}
                >
                  <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white">
                    <Truck className="w-3.5 h-3.5 text-gray-700" />
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold text-gray-900 leading-none">
                    {busTitle(v)} <span className="text-gray-400">—</span>{" "}
                    <span className="font-medium tabular-nums text-gray-700">{v.plateNumber ?? v.id}</span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      operationStatus === "idle" && "bg-green-100 text-green-700",
                      operationStatus === "planned" && "bg-orange-100 text-orange-700",
                      operationStatus === "boarding" && "bg-amber-100 text-amber-700",
                      operationStatus === "in_transit" && "bg-blue-100 text-blue-700",
                      operationStatus === "arrived" && "bg-slate-100 text-slate-700"
                    )}
                  >
                    {operationStatus === "idle"
                      ? "Disponible"
                      : operationStatus === "planned"
                        ? "Déjà planifié"
                        : operationStatus === "boarding"
                          ? "Embarquement"
                          : operationStatus === "in_transit"
                            ? "En transit"
                            : "Arrivé"}
                  </span>
                  {operationStatus === "planned" && String((v as any).currentAssignmentId ?? "").trim() && (
                    <span className="hidden md:inline truncate text-[10px] text-gray-500">
                      {assignmentContextById.get(String((v as any).currentAssignmentId ?? "").trim()) ?? "Planifié"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default TripPlanningPage;
