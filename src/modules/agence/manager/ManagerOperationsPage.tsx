import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  collection, doc, query, where, onSnapshot, getDocs, getDoc, limit,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { RESERVATION_STATUT_QUERY_BOARDABLE } from "@/utils/reservationStatusUtils";
import { useAuth } from "@/contexts/AuthContext";
import { format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { Bus, Truck, MapPin, Loader2, X } from "lucide-react";
import {
  StandardLayoutWrapper, PageHeader, SectionCard, MetricCard, StatusBadge, EmptyState, table, tableRowClassName, typography, ActionButton,
} from "@/ui";
import { listAffectationsByAgency } from "@/modules/compagnie/fleet/affectationService";
import { AFFECTATION_STATUS } from "@/modules/compagnie/fleet/affectationTypes";
import {
  listVehiclesAvailableInCity,
  assignVehicle,
  confirmDepartureAffectation,
  cancelAffectation,
} from "@/modules/compagnie/fleet/vehiclesService";
import { getAgencyCityFromDoc } from "@/modules/agence/utils/agencyCity";
import { OPERATIONAL_STATUS, TECHNICAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const weekdayFR = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

type ReservationDoc = {
  id: string; montant?: number; seatsGo?: number; depart?: string;
  arrivee?: string; heure?: string; date?: string; statut?: string;
  statutEmbarquement?: string; vehiclePlate?: string; driverName?: string;
};

type DepartureStatus = "boarding" | "ready" | "departed" | "delayed" | "cancelled";

function deriveDepartureStatus(d: {
  closed: boolean; embarked: number; booked: number; heure: string;
  delayThresholdMinutes?: number;
}): DepartureStatus {
  if (d.closed && d.embarked === 0 && d.booked === 0) return "cancelled";
  if (d.closed) return "departed";

  const threshold = d.delayThresholdMinutes ?? 30;
  const now = new Date();
  const [h, m] = d.heure.split(":").map(Number);
  const scheduled = new Date();
  scheduled.setHours(h || 0, m || 0, 0, 0);

  if (now > new Date(scheduled.getTime() + threshold * 60_000) && !d.closed) return "delayed";
  if (d.embarked > 0) return "boarding";
  return "ready";
}

type StatusVariant = "success" | "pending" | "danger" | "neutral" | "info";
const STATUS_CONFIG: Record<DepartureStatus, { label: string; status: StatusVariant }> = {
  boarding:  { label: "Embarquement", status: "info" },
  ready:     { label: "Prêt",         status: "success" },
  departed:  { label: "Parti",       status: "neutral" },
  delayed:   { label: "En retard",   status: "danger" },
  cancelled: { label: "Annulé",      status: "danger" },
};

export default function ManagerOperationsPage() {
  const { user, company } = useAuth() as any;
  const delayThreshold: number = (company as any)?.delayThresholdMinutes ?? 30;
  const companyId = user?.companyId ?? "";
  const agencyId = user?.agencyId ?? "";
  const [selectedDate, setSelectedDate] = useState(() => toLocalISO(new Date()));

  const [reservations, setReservations] = useState<ReservationDoc[]>([]);
  const [weeklyTrips, setWeeklyTrips] = useState<Array<{ id: string; departure: string; arrival: string; horaires?: Record<string, string[]> }>>([]);
  const [boardingClosures, setBoardingClosures] = useState<Set<string>>(new Set());
  const [fleetStats, setFleetStats] = useState({ auGarage: 0, affectes: 0, enRoute: 0, enApproche: 0 });
  const [affectations, setAffectations] = useState<Array<{ id: string; agencyId: string; vehicleId: string; vehiclePlate: string; vehicleModel: string; status: string; departureCity: string; arrivalCity: string; departureTime: any; driverName?: string; driverPhone?: string; convoyeurName?: string; convoyeurPhone?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [assignModalRow, setAssignModalRow] = useState<{ key: string; tripId: string; departure: string; arrival: string; heure: string } | null>(null);
  const [assignVehicleId, setAssignVehicleId] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ tripId: "", driverName: "", driverPhone: "", convoyeurName: "", convoyeurPhone: "" });
  const [assignSaving, setAssignSaving] = useState(false);
  const [actioningKey, setActioningKey] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [agencyCity, setAgencyCity] = useState("");

  useEffect(() => {
    if (!companyId || !agencyId) { setLoading(false); return; }
    const unsubs: Array<() => void> = [];

    unsubs.push(onSnapshot(
      query(collection(db, `companies/${companyId}/agences/${agencyId}/reservations`),
        where("date", "==", selectedDate), where("statut", "in", [...RESERVATION_STATUT_QUERY_BOARDABLE, "validé"])),
      (s) => setReservations(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))),
    ));
    unsubs.push(onSnapshot(
      collection(db, `companies/${companyId}/agences/${agencyId}/boardingClosures`),
      (s) => setBoardingClosures(new Set(s.docs.map((d) => d.id))),
    ));

    getDocs(collection(db, `companies/${companyId}/agences/${agencyId}/weeklyTrips`)).then((s) => {
      setWeeklyTrips(s.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    listAffectationsByAgency(companyId, agencyId).then((list) => {
      setAffectations(list.map((a: any) => ({ id: a.id, agencyId: agencyId, vehicleId: a.vehicleId, vehiclePlate: a.vehiclePlate ?? "", vehicleModel: a.vehicleModel ?? "", status: a.status ?? "", departureCity: a.departureCity ?? "", arrivalCity: a.arrivalCity ?? "", departureTime: a.departureTime, driverName: a.driverName, driverPhone: a.driverPhone, convoyeurName: a.convoyeurName, convoyeurPhone: a.convoyeurPhone })));
    }).catch(() => setAffectations([]));

    setLoading(false);
    return () => unsubs.forEach((u) => u());
  }, [companyId, agencyId, selectedDate]);

  useEffect(() => {
    if (!companyId || !agencyId) return;
    getDoc(doc(db, `companies/${companyId}/agences/${agencyId}`))
      .then((snap) => {
        const data = snap.exists() ? (snap.data() as { city?: string; villeNorm?: string; ville?: string }) : null;
        setAgencyCity(getAgencyCityFromDoc(data));
      })
      .catch(() => setAgencyCity(""));
  }, [companyId, agencyId]);

  const loadFleetStats = useCallback(async () => {
    if (!companyId || !agencyId || !agencyCity) return;
    try {
      const [vehiclesResult, affectationsList] = await Promise.all([
        listVehiclesAvailableInCity(companyId, agencyCity),
        listAffectationsByAgency(companyId, agencyId),
      ]);
      const vehicles = vehiclesResult.vehicles;
      const agencyCityNorm = agencyCity.trim().toLowerCase();
      const auGarage = vehicles.filter(
        (v: any) =>
          (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.GARAGE &&
          ((v.currentCity ?? "") as string).trim().toLowerCase() === agencyCityNorm &&
          !(v as any).isArchived
      ).length;
      const affectes = affectationsList.filter(
        (a: any) =>
          a.status === AFFECTATION_STATUS.AFFECTE &&
          ((a.departureCity ?? "") as string).trim().toLowerCase() === agencyCityNorm
      ).length;
      const enRoute = affectationsList.filter(
        (a: any) =>
          a.status === AFFECTATION_STATUS.DEPART_CONFIRME &&
          ((a.departureCity ?? "") as string).trim().toLowerCase() === agencyCityNorm
      ).length;
      const enApproche = affectationsList.filter(
        (a: any) =>
          a.status === AFFECTATION_STATUS.DEPART_CONFIRME &&
          ((a.arrivalCity ?? "") as string).trim().toLowerCase() === agencyCityNorm
      ).length;
      setFleetStats({ auGarage, affectes, enRoute, enApproche });
    } catch {
      setFleetStats({ auGarage: 0, affectes: 0, enRoute: 0, enApproche: 0 });
    }
  }, [companyId, agencyId, agencyCity]);

  useEffect(() => {
    void loadFleetStats();
  }, [loadFleetStats]);

  const dayNameForSelected = useMemo(
    () => weekdayFR(new Date(selectedDate + "T12:00:00")),
    [selectedDate]
  );

  const weeklyTripsForDay = useMemo(
    () => weeklyTrips.filter((t) => (t.horaires?.[dayNameForSelected]?.length ?? 0) > 0),
    [weeklyTrips, dayNameForSelected]
  );

  const departuresRaw = useMemo(() => {
    const list: Array<{
      key: string; tripId: string; departure: string; arrival: string; heure: string;
      booked: number; embarked: number; absent: number; capacity: number;
      closed: boolean; vehicle: string; driver: string; status: DepartureStatus;
    }> = [];

    weeklyTripsForDay.forEach((t) => {
      (t.horaires?.[dayNameForSelected] ?? []).forEach((heure) => {
        const key = `${t.departure}_${t.arrival}_${heure}_${selectedDate}`.replace(/\s+/g, "-");
        const resForSlot = reservations.filter(
          (r) => r.date === selectedDate && r.depart === t.departure && r.arrivee === t.arrival && r.heure === heure,
        );
        const booked = resForSlot.reduce((a, r) => a + (r.seatsGo ?? 1), 0);
        const embarked = resForSlot.reduce(
          (a, r) => a + (r.statutEmbarquement === "embarqué" ? (r.seatsGo ?? 1) : 0), 0);
        const absent = resForSlot.reduce(
          (a, r) => a + (r.statutEmbarquement === "absent" ? (r.seatsGo ?? 1) : 0), 0);
        const vehiclePlate = resForSlot.find((r) => r.vehiclePlate)?.vehiclePlate ?? "";
        const driverName = resForSlot.find((r) => r.driverName)?.driverName ?? "";
        const closed = boardingClosures.has(key);

        const status = deriveDepartureStatus({ closed, embarked, booked, heure, delayThresholdMinutes: delayThreshold });

        list.push({ key, tripId: t.id, departure: t.departure, arrival: t.arrival, heure, booked, embarked, absent, capacity: 50, closed, vehicle: vehiclePlate, driver: driverName, status });
      });
    });
    return list.sort((a, b) => a.heure.localeCompare(b.heure));
  }, [weeklyTripsForDay, dayNameForSelected, selectedDate, reservations, boardingClosures]);

  const keysWithDepartConfirmed = useMemo(() => {
    const set = new Set<string>();
    for (const a of affectations) {
      if (a.status !== AFFECTATION_STATUS.DEPART_CONFIRME) continue;
      const dt = a.departureTime;
      let datePart = "";
      let timePart = "";
      if (typeof dt === "string") {
        datePart = dt.slice(0, 10);
        timePart = (dt.slice(11, 16) || dt.slice(11, 13) + ":00").trim();
      } else if (dt && typeof dt === "object" && "seconds" in dt) {
        const date = new Date((dt as any).seconds * 1000);
        datePart = toLocalISO(date);
        timePart = format(date, "HH:mm");
      }
      if (datePart !== selectedDate) continue;
      const key = `${(a.departureCity || "").trim()}_${(a.arrivalCity || "").trim()}_${timePart}_${selectedDate}`.replace(/\s+/g, "-");
      set.add(key);
    }
    return set;
  }, [affectations, selectedDate]);

  const departures = useMemo(
    () => departuresRaw.filter((d) => !keysWithDepartConfirmed.has(d.key)),
    [departuresRaw, keysWithDepartConfirmed]
  );

  const affectationByRowKey = useMemo(() => {
    const map: Record<string, typeof affectations[0]> = {};
    for (const d of departures) {
      for (const a of affectations) {
        if (a.status !== AFFECTATION_STATUS.AFFECTE && a.status !== AFFECTATION_STATUS.DEPART_CONFIRME) continue;
        if ((a.departureCity || "").trim().toLowerCase() !== (d.departure || "").trim().toLowerCase()) continue;
        if ((a.arrivalCity || "").trim().toLowerCase() !== (d.arrival || "").trim().toLowerCase()) continue;
        const dt = a.departureTime;
        let datePart = "";
        let timePart = "";
        if (typeof dt === "string") {
          datePart = dt.slice(0, 10);
          timePart = (dt.slice(11, 16) || dt.slice(11, 13) + ":00").trim();
        } else if (dt && typeof dt === "object" && "seconds" in dt) {
          const date = new Date((dt as any).seconds * 1000);
          datePart = toLocalISO(date);
          timePart = format(date, "HH:mm");
        }
        const wantTime = (d.heure || "").trim();
        if (datePart === selectedDate && (timePart === wantTime || !wantTime || !timePart)) {
          map[d.key] = a;
          break;
        }
      }
    }
    return map;
  }, [affectations, departures, selectedDate]);

  const [availableVehicles, setAvailableVehicles] = useState<Array<{ id: string; plateNumber: string; model: string }>>([]);
  const [availableVehiclesLoading, setAvailableVehiclesLoading] = useState(false);

  const loadAvailableVehicles = useCallback(async () => {
    if (!companyId || !agencyCity) return;
    setAvailableVehiclesLoading(true);
    try {
      const { vehicles: list } = await listVehiclesAvailableInCity(companyId, agencyCity);
      const activeIds = new Set(
        affectations.filter((a) => a.status === AFFECTATION_STATUS.AFFECTE || a.status === AFFECTATION_STATUS.DEPART_CONFIRME).map((a) => a.vehicleId)
      );
      const filtered = list.filter((v: any) => !activeIds.has(v.id));
      setAvailableVehicles(filtered.map((v: any) => ({ id: v.id, plateNumber: v.plateNumber ?? "", model: v.model ?? "" })));
    } catch {
      setAvailableVehicles([]);
    } finally {
      setAvailableVehiclesLoading(false);
    }
  }, [companyId, agencyCity, affectations]);

  useEffect(() => {
    if (assignModalRow) void loadAvailableVehicles();
  }, [assignModalRow, loadAvailableVehicles]);

  const handleAssignVehicle = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !agencyId || !assignModalRow || !assignVehicleId || !agencyCity) return;
    setAssignSaving(true);
    setOpError(null);
    try {
      const departureTime = `${assignModalRow.departure.replace(/\s+/g, "-")}_${assignModalRow.arrival.replace(/\s+/g, "-")}_${assignModalRow.heure}_${selectedDate}`;
      await assignVehicle(
        companyId,
        agencyId,
        assignVehicleId,
        agencyCity,
        {
          tripId: assignForm.tripId.trim() || departureTime,
          departureCity: assignModalRow.departure,
          arrivalCity: assignModalRow.arrival,
          departureTime: new Date(`${selectedDate}T${assignModalRow.heure}:00`).toISOString().slice(0, 16),
          driverName: assignForm.driverName.trim() || undefined,
          driverPhone: assignForm.driverPhone.trim() || undefined,
          convoyeurName: assignForm.convoyeurName.trim() || undefined,
          convoyeurPhone: assignForm.convoyeurPhone.trim() || undefined,
          assignedBy: (user as any)?.uid ?? "",
        },
        (user as any)?.uid ?? "",
        (user as any)?.role ?? "chefAgence",
        { weeklyTripId: assignModalRow.tripId || null }
      );
      setAssignModalRow(null);
      setAssignVehicleId(null);
      setAssignForm({ tripId: "", driverName: "", driverPhone: "", convoyeurName: "", convoyeurPhone: "" });
      listAffectationsByAgency(companyId, agencyId).then((list) => {
        setAffectations(list.map((a: any) => ({ id: a.id, agencyId: agencyId, vehicleId: a.vehicleId, vehiclePlate: a.vehiclePlate ?? "", vehicleModel: a.vehicleModel ?? "", status: a.status ?? "", departureCity: a.departureCity ?? "", arrivalCity: a.arrivalCity ?? "", departureTime: a.departureTime, driverName: a.driverName, driverPhone: a.driverPhone, convoyeurName: a.convoyeurName, convoyeurPhone: a.convoyeurPhone })));
      });
      await loadFleetStats();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Erreur affectation.");
    } finally {
      setAssignSaving(false);
    }
  }, [companyId, agencyId, agencyCity, assignModalRow, assignVehicleId, assignForm, selectedDate, user, loadFleetStats]);

  const handleConfirmDeparture = useCallback(async (affectationId: string, agencyIdAff: string, rowKey: string) => {
    if (!companyId || !user?.uid) return;
    setActioningKey(rowKey);
    setOpError(null);
    try {
      await confirmDepartureAffectation(companyId, agencyIdAff, affectationId, (user as any).uid, (user as any).role ?? "chefAgence");
      listAffectationsByAgency(companyId, agencyId).then((list) => {
        setAffectations(list.map((a: any) => ({ id: a.id, agencyId: agencyId, vehicleId: a.vehicleId, vehiclePlate: a.vehiclePlate ?? "", vehicleModel: a.vehicleModel ?? "", status: a.status ?? "", departureCity: a.departureCity ?? "", arrivalCity: a.arrivalCity ?? "", departureTime: a.departureTime, driverName: a.driverName, driverPhone: a.driverPhone, convoyeurName: a.convoyeurName, convoyeurPhone: a.convoyeurPhone })));
      });
      await loadFleetStats();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Erreur confirmation départ.");
    } finally {
      setActioningKey(null);
    }
  }, [companyId, agencyId, user, loadFleetStats]);

  const handleCancelAffectation = useCallback(async (affectationId: string, agencyIdAff: string, rowKey: string) => {
    if (!companyId || !user?.uid) return;
    setActioningKey(rowKey);
    setOpError(null);
    try {
      await cancelAffectation(companyId, agencyIdAff, affectationId, (user as any).uid, (user as any).role ?? "chefAgence");
      listAffectationsByAgency(companyId, agencyId).then((list) => {
        setAffectations(list.map((a: any) => ({ id: a.id, agencyId: agencyId, vehicleId: a.vehicleId, vehiclePlate: a.vehiclePlate ?? "", vehicleModel: a.vehicleModel ?? "", status: a.status ?? "", departureCity: a.departureCity ?? "", arrivalCity: a.arrivalCity ?? "", departureTime: a.departureTime, driverName: a.driverName, driverPhone: a.driverPhone, convoyeurName: a.convoyeurName, convoyeurPhone: a.convoyeurPhone })));
      });
      await loadFleetStats();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Erreur annulation.");
    } finally {
      setActioningKey(null);
    }
  }, [companyId, agencyId, user, loadFleetStats]);

  if (loading) return <StandardLayoutWrapper><p className={typography.muted}>Chargement…</p></StandardLayoutWrapper>;

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Opérations"
        subtitle={`${format(new Date(), "EEEE d MMMM yyyy", { locale: fr })} — Vue lecture seule`}
      />

      {/* Fleet overview — synchronisé véhicules + affectations */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard label="Au garage" value={fleetStats.auGarage} icon={Truck} />
        <MetricCard label="Affectés" value={fleetStats.affectes} icon={Bus} />
        <MetricCard label="En route" value={fleetStats.enRoute} icon={MapPin} />
        <MetricCard label="En approche" value={fleetStats.enApproche} icon={Bus} />
      </div>

      {/* Date controls + Departures table */}
      <SectionCard title="Départs du jour" icon={Bus} noPad>
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-slate-200">
          <span className="text-sm text-slate-600">Date :</span>
          <button
            type="button"
            onClick={() => setSelectedDate(toLocalISO(new Date()))}
            className="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700"
          >
            Aujourd&apos;hui
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate(toLocalISO(addDays(new Date(), 1)))}
            className="text-sm px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700"
          >
            Demain
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value || selectedDate)}
            className="text-sm border border-slate-300 rounded px-2 py-1.5 text-slate-700"
          />
          <span className="text-sm text-slate-500">{format(new Date(selectedDate + "T12:00:00"), "EEEE d MMMM yyyy", { locale: fr })}</span>
        </div>
        {departures.length === 0 ? (
          <EmptyState message={`Aucun départ planifié pour cette date.`} />
        ) : (
          <div className={table.wrapper}>
            <table className={table.base}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Itinéraire</th>
                  <th className={table.th}>Heure</th>
                  <th className={table.thRight}>Réservés</th>
                  <th className={table.thRight}>Embarqués</th>
                  <th className={table.thRight}>Absents</th>
                  <th className={table.thRight}>Remplissage</th>
                  <th className={table.th}>Statut</th>
                  <th className={table.th}>Véhicule</th>
                  <th className={table.th}>Chauffeur</th>
                  <th className={table.th}>Affectation</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {departures.map((d) => {
                  const pct = d.capacity ? Math.round((d.embarked / d.capacity) * 100) : 0;
                  const sc = STATUS_CONFIG[d.status];
                  const aff = affectationByRowKey[d.key];
                  const vehicleDisplay = aff ? `${aff.vehiclePlate || "—"} / ${aff.vehicleModel || "—"}` : (d.vehicle || "—");
                  const driverDisplay = aff ? (aff.driverName || "—") : (d.driver || "—");
                  const isActioning = actioningKey === d.key;
                  return (
                    <tr key={d.key} className={tableRowClassName()}>
                      <td className={table.td}>{d.departure} → {d.arrival}</td>
                      <td className={table.td}>{d.heure}</td>
                      <td className={table.tdRight}>{d.booked}</td>
                      <td className={table.tdRight}>{d.embarked}</td>
                      <td className={table.tdRight}>{d.absent}</td>
                      <td className={table.tdRight}>
                        <span className={pct < 30 ? "text-red-600 font-medium" : pct < 70 ? "text-amber-600" : "text-emerald-600 font-medium"}>
                          {pct}%
                        </span>
                      </td>
                      <td className={table.td}>
                        <StatusBadge status={sc.status}>{sc.label}</StatusBadge>
                      </td>
                      <td className={table.td}>{vehicleDisplay}</td>
                      <td className={table.td}>{driverDisplay}</td>
                      <td className={table.td}>
                        {!aff ? (
                          <button
                            type="button"
                            onClick={() => setAssignModalRow({ key: d.key, tripId: d.tripId, departure: d.departure, arrival: d.arrival, heure: d.heure })}
                            className="text-sm px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-700"
                          >
                            Affecter un véhicule
                          </button>
                        ) : aff.status === AFFECTATION_STATUS.AFFECTE ? (
                          <div className="flex flex-wrap gap-1 items-center">
                            <span className="text-xs text-slate-600">{aff.vehiclePlate} / {aff.vehicleModel}</span>
                            <button
                              type="button"
                              onClick={() => handleConfirmDeparture(aff.id, aff.agencyId, d.key)}
                              disabled={isActioning}
                              className="text-xs px-2 py-0.5 rounded bg-blue-100 text-blue-800 hover:bg-blue-200 disabled:opacity-50"
                            >
                              {isActioning ? "…" : "Confirmer départ"}
                            </button>
                            <a href="/agence/fleet/operations" className="text-xs px-2 py-0.5 rounded border border-slate-300 hover:bg-slate-50 text-slate-700">
                              Modifier affectation
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCancelAffectation(aff.id, aff.agencyId, d.key)}
                              disabled={isActioning}
                              className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Annuler affectation
                            </button>
                          </div>
                        ) : aff.status === AFFECTATION_STATUS.DEPART_CONFIRME ? (
                          <span className="text-xs text-slate-600">{aff.vehiclePlate} / {aff.vehicleModel} — En transit</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {opError && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          {opError}
        </div>
      )}

      {/* Modal Affecter un véhicule */}
      {assignModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Affecter un véhicule</h3>
              <button type="button" onClick={() => { setAssignModalRow(null); setAssignVehicleId(null); setAssignForm({ tripId: "", driverName: "", driverPhone: "", convoyeurName: "", convoyeurPhone: "" }); }} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="px-4 py-2 text-sm text-gray-600">
              {assignModalRow.departure} → {assignModalRow.arrival} • {assignModalRow.heure}
            </p>
            <form onSubmit={handleAssignVehicle} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Véhicule</label>
                  {availableVehiclesLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Chargement…</div>
                  ) : (
                    <select
                      value={assignVehicleId ?? ""}
                      onChange={(e) => setAssignVehicleId(e.target.value || null)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      required
                    >
                      <option value="">— Choisir —</option>
                      {availableVehicles.map((v) => (
                        <option key={v.id} value={v.id}>{v.plateNumber} — {v.model}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Chauffeur (optionnel)</label>
                  <input type="text" value={assignForm.driverName} onChange={(e) => setAssignForm((f) => ({ ...f, driverName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Nom" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tél. chauffeur</label>
                  <input type="text" value={assignForm.driverPhone} onChange={(e) => setAssignForm((f) => ({ ...f, driverPhone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Téléphone" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Convoyeur (optionnel)</label>
                  <input type="text" value={assignForm.convoyeurName} onChange={(e) => setAssignForm((f) => ({ ...f, convoyeurName: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Nom" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tél. convoyeur</label>
                  <input type="text" value={assignForm.convoyeurPhone} onChange={(e) => setAssignForm((f) => ({ ...f, convoyeurPhone: e.target.value }))} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Téléphone" />
                </div>
              </div>
              <div className="flex gap-2 p-4 border-t">
                <button type="button" onClick={() => { setAssignModalRow(null); setAssignVehicleId(null); }} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50">Annuler</button>
                <button type="submit" disabled={assignSaving || !assignVehicleId} className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{assignSaving ? "…" : "Affecter"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
