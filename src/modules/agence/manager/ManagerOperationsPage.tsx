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
import { shipmentsRef } from "@/modules/logistics/domain/firestorePaths";
import { listAffectationsByAgency, listAffectationsByCompany } from "@/modules/compagnie/fleet/affectationService";
import { AFFECTATION_STATUS } from "@/modules/compagnie/fleet/affectationTypes";
import {
  listVehiclesAvailableInCity,
  listVehicles,
  assignVehicle,
  confirmDepartureAffectation,
  confirmArrivalAffectation,
  cancelAffectation,
} from "@/modules/compagnie/fleet/vehiclesService";
import { getAgencyCityFromDoc } from "@/modules/agence/utils/agencyCity";
import { OPERATIONAL_STATUS, TECHNICAL_STATUS } from "@/modules/compagnie/fleet/vehicleTransitions";
import { getPhoneRuleFromCountry, sanitizeLocalPhone } from "@/utils/phoneCountryRules";

function toLocalISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const weekdayFR = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();

type ReservationDoc = {
  id: string; montant?: number; seatsGo?: number; depart?: string;
  arrivee?: string; heure?: string; date?: string; statut?: string;
  statutEmbarquement?: string; vehiclePlate?: string; driverName?: string;
};

type IncomingOperationalMetrics = {
  booked: number;
  embarked: number;
  absent: number;
  parcels: number;
};

type CrewOption = {
  id: string;
  name: string;
  lastName?: string;
  firstName?: string;
  phone?: string;
  crewRole?: "driver" | "convoyeur";
  isAvailable?: boolean;
  assignedVehicleId?: string;
};

function toNameCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function splitName(fullName: string): { lastName: string; firstName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return {
    lastName: toNameCase(parts[0] ?? ""),
    firstName: toNameCase(parts.slice(1).join(" ")),
  };
}

function normalizeTimeToHHMM(value: string): string {
  const m = value.trim().match(/(\d{1,2})[:hH]?(\d{0,2})/);
  if (!m) return "";
  return `${String(Number(m[1] ?? 0)).padStart(2, "0")}:${String(Number(m[2] ?? 0)).padStart(2, "0")}`;
}

function extractDepartureSlot(value: any): { date: string; time: string } {
  if (typeof value === "string") {
    const date = value.slice(0, 10);
    const rawTime = value.length >= 16 ? value.slice(11, 16) : "";
    return { date, time: normalizeTimeToHHMM(rawTime) };
  }
  if (value && typeof value === "object" && "seconds" in value) {
    const date = new Date((value as any).seconds * 1000);
    return { date: toLocalISO(date), time: format(date, "HH:mm") };
  }
  return { date: "", time: "" };
}

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
  const phoneRule = useMemo(() => getPhoneRuleFromCountry((company as any)?.pays), [company]);
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
  const [assignForm, setAssignForm] = useState({
    tripId: "",
    driverId: "",
    driverLastName: "",
    driverFirstName: "",
    driverPhone: "",
    convoyeurId: "",
    convoyeurLastName: "",
    convoyeurFirstName: "",
    convoyeurPhone: "",
  });
  const [assignSaving, setAssignSaving] = useState(false);
  const [actioningKey, setActioningKey] = useState<string | null>(null);
  const [opError, setOpError] = useState<string | null>(null);
  const [agencyCity, setAgencyCity] = useState("");
  const [incomingTransit, setIncomingTransit] = useState<Array<{ id: string; agencyId: string; vehicleId: string; vehiclePlate: string; vehicleModel: string; departureCity: string; arrivalCity: string; departureTime: any; driverName?: string }>>([]);
  const [incomingMetricsByAffectation, setIncomingMetricsByAffectation] = useState<Record<string, IncomingOperationalMetrics>>({});
  const [cancelModal, setCancelModal] = useState<{
    affectationId: string;
    agencyIdAff: string;
    rowKey: string;
    routeLabel: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

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

  const loadIncomingTransit = useCallback(async () => {
    if (!companyId || !agencyCity) {
      setIncomingTransit([]);
      return;
    }
    try {
      const all = await listAffectationsByCompany(companyId);
      const cityNorm = agencyCity.trim().toLowerCase();
      const incoming = all
        .filter(
          (a: any) =>
            a.status === AFFECTATION_STATUS.DEPART_CONFIRME &&
            String(a.arrivalCity ?? "").trim().toLowerCase() === cityNorm
        )
        .map((a: any) => ({
          id: a.id,
          agencyId: a.agencyId ?? "",
          vehicleId: a.vehicleId ?? "",
          vehiclePlate: a.vehiclePlate ?? "",
          vehicleModel: a.vehicleModel ?? "",
          departureCity: a.departureCity ?? "",
          arrivalCity: a.arrivalCity ?? "",
          departureTime: a.departureTime,
          driverName: a.driverName ?? "",
        }));
      setIncomingTransit(incoming);
    } catch {
      setIncomingTransit([]);
    }
  }, [companyId, agencyCity]);

  useEffect(() => {
    void loadIncomingTransit();
  }, [loadIncomingTransit]);

  const loadIncomingOperationalMetrics = useCallback(async () => {
    if (!companyId || !agencyId || incomingTransit.length === 0) {
      setIncomingMetricsByAffectation({});
      return;
    }
    try {
      const reservationBucket = new Map<string, ReservationDoc[]>();
      const uniqueAgencyDateKeys = new Set<string>();
      for (const a of incomingTransit) {
        const slot = extractDepartureSlot(a.departureTime);
        if (!a.agencyId || !slot.date) continue;
        uniqueAgencyDateKeys.add(`${a.agencyId}__${slot.date}`);
      }

      await Promise.all(
        Array.from(uniqueAgencyDateKeys).map(async (key) => {
          const [originAgencyId, date] = key.split("__");
          const snap = await getDocs(
            query(
              collection(db, `companies/${companyId}/agences/${originAgencyId}/reservations`),
              where("date", "==", date),
              limit(1500)
            )
          );
          reservationBucket.set(
            key,
            snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
          );
        })
      );

      const shipmentsSnap = await getDocs(
        query(
          shipmentsRef(db, companyId),
          where("destinationAgencyId", "==", agencyId),
          where("currentStatus", "==", "IN_TRANSIT"),
          limit(2000)
        )
      );
      const parcelsByVehicle = new Map<string, number>();
      shipmentsSnap.docs.forEach((d) => {
        const data = d.data() as { vehicleId?: string };
        const vehicleId = String(data.vehicleId ?? "").trim();
        if (!vehicleId) return;
        parcelsByVehicle.set(vehicleId, (parcelsByVehicle.get(vehicleId) ?? 0) + 1);
      });

      const next: Record<string, IncomingOperationalMetrics> = {};
      for (const a of incomingTransit) {
        const slot = extractDepartureSlot(a.departureTime);
        const bucketKey = `${a.agencyId}__${slot.date}`;
        const resList = reservationBucket.get(bucketKey) ?? [];
        const bookedRows = resList.filter(
          (r) =>
            String(r.depart ?? "").trim().toLowerCase() === String(a.departureCity ?? "").trim().toLowerCase() &&
            String(r.arrivee ?? "").trim().toLowerCase() === String(a.arrivalCity ?? "").trim().toLowerCase() &&
            normalizeTimeToHHMM(String(r.heure ?? "")) === slot.time
        );
        const booked = bookedRows.reduce((sum, r) => sum + (r.seatsGo ?? 1), 0);
        const embarked = bookedRows.reduce((sum, r) => sum + (r.statutEmbarquement === "embarqué" ? (r.seatsGo ?? 1) : 0), 0);
        const absent = bookedRows.reduce((sum, r) => sum + (r.statutEmbarquement === "absent" ? (r.seatsGo ?? 1) : 0), 0);
        const parcels = parcelsByVehicle.get(String(a.vehicleId ?? "").trim()) ?? 0;
        next[a.id] = { booked, embarked, absent, parcels };
      }
      setIncomingMetricsByAffectation(next);
    } catch {
      setIncomingMetricsByAffectation({});
    }
  }, [companyId, agencyId, incomingTransit]);

  useEffect(() => {
    void loadIncomingOperationalMetrics();
  }, [loadIncomingOperationalMetrics]);

  const loadFleetStats = useCallback(async () => {
    if (!companyId || !agencyId || !agencyCity) return;
    try {
      const [allVehicles, affectationsList] = await Promise.all([
        listVehicles(companyId, 1200),
        listAffectationsByAgency(companyId, agencyId),
      ]);
      const nextVehicleNumberById: Record<string, string> = {};
      for (const v of allVehicles as any[]) {
        const id = String(v?.id ?? "").trim();
        if (!id) continue;
        const vehicleNumber = String(v?.busNumber ?? v?.fleetNumber ?? "").trim();
        if (vehicleNumber) nextVehicleNumberById[id] = vehicleNumber;
      }
      setVehicleNumberById(nextVehicleNumberById);
      const agencyCityNorm = agencyCity.trim().toLowerCase();
      const activeAffectations = affectationsList.filter(
        (a: any) => a.status === AFFECTATION_STATUS.AFFECTE || a.status === AFFECTATION_STATUS.DEPART_CONFIRME
      );
      const activeVehicleIds = new Set<string>(
        activeAffectations.map((a: any) => String(a.vehicleId ?? "").trim()).filter(Boolean)
      );

      const garageVehicleIds = new Set<string>(
        allVehicles
          .filter(
            (v: any) =>
              (v.operationalStatus ?? OPERATIONAL_STATUS.GARAGE) === OPERATIONAL_STATUS.GARAGE &&
              (v.technicalStatus ?? TECHNICAL_STATUS.NORMAL) === TECHNICAL_STATUS.NORMAL &&
              ((v.currentCity ?? "") as string).trim().toLowerCase() === agencyCityNorm &&
              !(v as any).isArchived
          )
          .map((v: any) => String(v.id ?? "").trim())
          .filter(Boolean)
      );
      for (const id of activeVehicleIds) garageVehicleIds.delete(id);
      const auGarage = garageVehicleIds.size;

      const affectes = new Set(
        activeAffectations
          .filter(
            (a: any) =>
              a.status === AFFECTATION_STATUS.AFFECTE &&
              ((a.departureCity ?? "") as string).trim().toLowerCase() === agencyCityNorm
          )
          .map((a: any) => String(a.vehicleId ?? "").trim())
          .filter(Boolean)
      ).size;

      const enRoute = new Set(
        activeAffectations
          .filter(
            (a: any) =>
              a.status === AFFECTATION_STATUS.DEPART_CONFIRME &&
              ((a.departureCity ?? "") as string).trim().toLowerCase() === agencyCityNorm
          )
          .map((a: any) => String(a.vehicleId ?? "").trim())
          .filter(Boolean)
      ).size;

      const enApproche = new Set(
        activeAffectations
          .filter(
            (a: any) =>
              a.status === AFFECTATION_STATUS.DEPART_CONFIRME &&
              ((a.arrivalCity ?? "") as string).trim().toLowerCase() === agencyCityNorm
          )
          .map((a: any) => String(a.vehicleId ?? "").trim())
          .filter(Boolean)
      ).size;

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

  const formatDepartureTimeLabel = useCallback((value: any) => {
    if (typeof value === "string") {
      if (value.length >= 16) return value.slice(0, 16).replace("T", " ");
      return value;
    }
    if (value && typeof value === "object" && "seconds" in value) {
      const date = new Date((value as any).seconds * 1000);
      return format(date, "dd/MM/yyyy HH:mm");
    }
    return "—";
  }, []);

  const [availableVehicles, setAvailableVehicles] = useState<
    Array<{
      id: string;
      plateNumber: string;
      model: string;
      defaultDriverName?: string;
      defaultDriverPhone?: string;
      defaultConvoyeurName?: string;
      defaultConvoyeurPhone?: string;
    }>
  >([]);
  const [availableVehiclesLoading, setAvailableVehiclesLoading] = useState(false);
  const [crewOptions, setCrewOptions] = useState<CrewOption[]>([]);
  const [vehicleNumberById, setVehicleNumberById] = useState<Record<string, string>>({});

  const loadAvailableVehicles = useCallback(async () => {
    if (!companyId || !agencyCity) return;
    setAvailableVehiclesLoading(true);
    try {
      const { vehicles: list } = await listVehiclesAvailableInCity(companyId, agencyCity, { agencyId });
      const activeIds = new Set(
        affectations.filter((a) => a.status === AFFECTATION_STATUS.AFFECTE || a.status === AFFECTATION_STATUS.DEPART_CONFIRME).map((a) => a.vehicleId)
      );
      const filtered = list.filter((v: any) => !activeIds.has(v.id));
      setAvailableVehicles(
        filtered.map((v: any) => ({
          id: v.id,
          plateNumber: v.plateNumber ?? "",
          model: v.model ?? "",
          defaultDriverName: v.defaultDriverName ?? "",
          defaultDriverPhone: v.defaultDriverPhone ?? "",
          defaultConvoyeurName: v.defaultConvoyeurName ?? "",
          defaultConvoyeurPhone: v.defaultConvoyeurPhone ?? "",
        }))
      );
    } catch {
      setAvailableVehicles([]);
    } finally {
      setAvailableVehiclesLoading(false);
    }
  }, [companyId, agencyCity, affectations, agencyId]);

  useEffect(() => {
    if (!companyId) return;
    getDocs(collection(db, `companies/${companyId}/personnel`))
      .then((snap) => {
        const options = snap.docs
          .map((d) => {
            const data = d.data() as {
              fullName?: string;
              lastName?: string;
              firstName?: string;
              phone?: string;
              active?: boolean;
              role?: string;
              crewRole?: "driver" | "convoyeur";
              isAvailable?: boolean;
              assignedVehicleId?: string;
            };
            if (data.active === false || data.isAvailable === false) return null;
            const mappedCrewRole = data.crewRole ?? (data.role === "agentCourrier" ? "convoyeur" : data.role === "agency_fleet_controller" ? "driver" : undefined);
            if (!mappedCrewRole) return null;
            const parsedFromFull = splitName(data.fullName ?? "");
            const lastName = toNameCase((data.lastName ?? "").trim() || parsedFromFull.lastName);
            const firstName = toNameCase((data.firstName ?? "").trim() || parsedFromFull.firstName);
            const name = [lastName, firstName].filter(Boolean).join(" ").trim();
            if (!name || !lastName) return null;
            return {
              id: d.id,
              name,
              lastName,
              firstName,
              phone: (data.phone ?? "").trim(),
              crewRole: mappedCrewRole,
              isAvailable: (data.isAvailable ?? true) === true,
              assignedVehicleId: data.assignedVehicleId ?? "",
            } as CrewOption;
          })
          .filter((x): x is CrewOption => x != null)
          .sort((a, b) => a.name.localeCompare(b.name));
        setCrewOptions(options);
      })
      .catch(() => setCrewOptions([]));
  }, [companyId]);

  const driverOptions = useMemo(
    () => crewOptions.filter((c) => c.crewRole === "driver"),
    [crewOptions]
  );

  const convoyeurOptions = useMemo(
    () => crewOptions.filter((c) => c.crewRole === "convoyeur"),
    [crewOptions]
  );

  useEffect(() => {
    if (assignModalRow) void loadAvailableVehicles();
  }, [assignModalRow, loadAvailableVehicles]);

  useEffect(() => {
    if (!assignVehicleId) return;
    const selected = availableVehicles.find((v) => v.id === assignVehicleId);
    if (!selected) return;
    const driverByVehicle = driverOptions.find((c) => c.assignedVehicleId === assignVehicleId);
    const convoyeurByVehicle = convoyeurOptions.find((c) => c.assignedVehicleId === assignVehicleId);
    const driverFromDefault = splitName(selected.defaultDriverName ?? "");
    const convoyeurFromDefault = splitName(selected.defaultConvoyeurName ?? "");
    setAssignForm((f) => ({
      ...f,
      driverId: f.driverId || driverByVehicle?.id || "",
      driverLastName: f.driverLastName || driverByVehicle?.lastName || driverFromDefault.lastName || "",
      driverFirstName: f.driverFirstName || driverByVehicle?.firstName || driverFromDefault.firstName || "",
      driverPhone: f.driverPhone || sanitizeLocalPhone(driverByVehicle?.phone || selected.defaultDriverPhone || "", phoneRule),
      convoyeurId: f.convoyeurId || convoyeurByVehicle?.id || "",
      convoyeurLastName: f.convoyeurLastName || convoyeurByVehicle?.lastName || convoyeurFromDefault.lastName || "",
      convoyeurFirstName: f.convoyeurFirstName || convoyeurByVehicle?.firstName || convoyeurFromDefault.firstName || "",
      convoyeurPhone: f.convoyeurPhone || sanitizeLocalPhone(convoyeurByVehicle?.phone || selected.defaultConvoyeurPhone || "", phoneRule),
    }));
  }, [assignVehicleId, availableVehicles, driverOptions, convoyeurOptions, phoneRule]);

  const selectedVehicleAuto = useMemo(() => {
    if (!assignVehicleId) return null;
    const selected = availableVehicles.find((v) => v.id === assignVehicleId);
    if (!selected) return null;
    const driverByVehicle = driverOptions.find((c) => c.assignedVehicleId === assignVehicleId);
    const convoyeurByVehicle = convoyeurOptions.find((c) => c.assignedVehicleId === assignVehicleId);
    const driverFromDefault = splitName(selected.defaultDriverName ?? "");
    const convoyeurFromDefault = splitName(selected.defaultConvoyeurName ?? "");
    const driverLastName = driverByVehicle?.lastName || driverFromDefault.lastName || "";
    const driverFirstName = driverByVehicle?.firstName || driverFromDefault.firstName || "";
    const driverPhone = sanitizeLocalPhone(driverByVehicle?.phone || selected.defaultDriverPhone || "", phoneRule);
    const convoyeurLastName = convoyeurByVehicle?.lastName || convoyeurFromDefault.lastName || "";
    const convoyeurFirstName = convoyeurByVehicle?.firstName || convoyeurFromDefault.firstName || "";
    const convoyeurPhone = sanitizeLocalPhone(convoyeurByVehicle?.phone || selected.defaultConvoyeurPhone || "", phoneRule);
    return {
      driverLastName,
      driverFirstName,
      driverPhone,
      convoyeurLastName,
      convoyeurFirstName,
      convoyeurPhone,
    };
  }, [assignVehicleId, availableVehicles, driverOptions, convoyeurOptions, phoneRule]);

  const handleAssignVehicle = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyId || !agencyId || !assignModalRow || !assignVehicleId || !agencyCity) return;
    setAssignSaving(true);
    setOpError(null);
    try {
      const effectiveDriverLastName = assignForm.driverLastName || selectedVehicleAuto?.driverLastName || "";
      const effectiveDriverFirstName = assignForm.driverFirstName || selectedVehicleAuto?.driverFirstName || "";
      const effectiveDriverPhone = assignForm.driverPhone || selectedVehicleAuto?.driverPhone || "";
      const effectiveConvoyeurLastName = assignForm.convoyeurLastName || selectedVehicleAuto?.convoyeurLastName || "";
      const effectiveConvoyeurFirstName = assignForm.convoyeurFirstName || selectedVehicleAuto?.convoyeurFirstName || "";
      const effectiveConvoyeurPhone = assignForm.convoyeurPhone || selectedVehicleAuto?.convoyeurPhone || "";
      const driverName = [toNameCase(effectiveDriverLastName), toNameCase(effectiveDriverFirstName)].filter(Boolean).join(" ").trim();
      const convoyeurName = [toNameCase(effectiveConvoyeurLastName), toNameCase(effectiveConvoyeurFirstName)].filter(Boolean).join(" ").trim();
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
          driverName: driverName || undefined,
          driverPhone: effectiveDriverPhone.trim() || undefined,
          convoyeurName: convoyeurName || undefined,
          convoyeurPhone: effectiveConvoyeurPhone.trim() || undefined,
          assignedBy: (user as any)?.uid ?? "",
        },
        (user as any)?.uid ?? "",
        (user as any)?.role ?? "chefAgence",
        { weeklyTripId: assignModalRow.tripId || null }
      );
      setAssignModalRow(null);
      setAssignVehicleId(null);
      setAssignForm({
        tripId: "",
        driverId: "",
        driverLastName: "",
        driverFirstName: "",
        driverPhone: "",
        convoyeurId: "",
        convoyeurLastName: "",
        convoyeurFirstName: "",
        convoyeurPhone: "",
      });
      listAffectationsByAgency(companyId, agencyId).then((list) => {
        setAffectations(list.map((a: any) => ({ id: a.id, agencyId: agencyId, vehicleId: a.vehicleId, vehiclePlate: a.vehiclePlate ?? "", vehicleModel: a.vehicleModel ?? "", status: a.status ?? "", departureCity: a.departureCity ?? "", arrivalCity: a.arrivalCity ?? "", departureTime: a.departureTime, driverName: a.driverName, driverPhone: a.driverPhone, convoyeurName: a.convoyeurName, convoyeurPhone: a.convoyeurPhone })));
      });
      await loadFleetStats();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Erreur affectation.");
    } finally {
      setAssignSaving(false);
    }
  }, [companyId, agencyId, agencyCity, assignModalRow, assignVehicleId, assignForm, selectedDate, user, loadFleetStats, selectedVehicleAuto]);

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
      await loadIncomingTransit();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Erreur confirmation départ.");
    } finally {
      setActioningKey(null);
    }
  }, [companyId, agencyId, user, loadFleetStats, loadIncomingTransit]);

  const handleConfirmArrival = useCallback(async (affectationId: string, agencyIdAff: string, rowKey: string) => {
    if (!companyId || !agencyCity || !user?.uid) return;
    setActioningKey(rowKey);
    setOpError(null);
    try {
      await confirmArrivalAffectation(
        companyId,
        agencyIdAff,
        affectationId,
        agencyCity,
        (user as any).uid,
        (user as any).role ?? "chefAgence",
        agencyId
      );
      await loadIncomingTransit();
      await loadFleetStats();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Erreur confirmation arrivée.");
    } finally {
      setActioningKey(null);
    }
  }, [companyId, agencyCity, user, loadIncomingTransit, loadFleetStats]);

  const handleCancelAffectation = useCallback(async (
    affectationId: string,
    agencyIdAff: string,
    rowKey: string,
    reason?: string
  ) => {
    if (!companyId || !user?.uid) return;
    setActioningKey(rowKey);
    setOpError(null);
    try {
      await cancelAffectation(
        companyId,
        agencyIdAff,
        affectationId,
        (user as any).uid,
        (user as any).role ?? "chefAgence",
        reason
      );
      listAffectationsByAgency(companyId, agencyId).then((list) => {
        setAffectations(list.map((a: any) => ({ id: a.id, agencyId: agencyId, vehicleId: a.vehicleId, vehiclePlate: a.vehiclePlate ?? "", vehicleModel: a.vehicleModel ?? "", status: a.status ?? "", departureCity: a.departureCity ?? "", arrivalCity: a.arrivalCity ?? "", departureTime: a.departureTime, driverName: a.driverName, driverPhone: a.driverPhone, convoyeurName: a.convoyeurName, convoyeurPhone: a.convoyeurPhone })));
      });
      await loadFleetStats();
      await loadIncomingTransit();
    } catch (err) {
      setOpError(err instanceof Error ? err.message : "Erreur annulation.");
    } finally {
      setActioningKey(null);
    }
  }, [companyId, agencyId, user, loadFleetStats, loadIncomingTransit]);

  if (loading) return <StandardLayoutWrapper><p className={typography.muted}>Chargement…</p></StandardLayoutWrapper>;

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Opérations"
        subtitle={`${format(new Date(), "EEEE d MMMM yyyy", { locale: fr })} — pilotage des départs et de la flotte`}
      />

      {/* Fleet overview — synchronisé véhicules + affectations */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <MetricCard
          label="Au garage"
          hint="Vehicules GARAGE + NORMAL en ville."
          value={fleetStats.auGarage}
          icon={Truck}
          decorative
        />
        <MetricCard
          label="Affectés"
          hint="Deja affectes, depart non confirme."
          value={fleetStats.affectes}
          icon={Bus}
          decorative
        />
        <MetricCard
          label="En route"
          hint="Depart confirme depuis l'agence."
          value={fleetStats.enRoute}
          icon={MapPin}
          decorative
        />
        <MetricCard
          label="En approche"
          hint="Vehicules en transit vers cette agence."
          value={fleetStats.enApproche}
          icon={Bus}
          decorative
        />
      </div>

      {/* Date controls + Departures table */}
      <SectionCard title="Plan de départs" icon={Bus} noPad>
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
            <table className={`${table.base} min-w-[1150px]`}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Itinéraire</th>
                  <th className={table.th}>Heure</th>
                  <th className={`${table.th} text-center`}>Réservés</th>
                  <th className={`${table.th} text-center`}>Embarqués</th>
                  <th className={`${table.th} text-center`}>Absents</th>
                  <th className={`${table.th} text-center`}>Remplissage</th>
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
                  const vehicleNumber = aff ? (vehicleNumberById[aff.vehicleId] ?? "") : "";
                  const vehicleDisplay = vehicleNumber ? `Bus #${vehicleNumber}` : (aff ? `${aff.vehiclePlate || "—"}` : (d.vehicle || "—"));
                  const driverDisplay = aff ? (aff.driverName || "—") : (d.driver || "—");
                  const isActioning = actioningKey === d.key;
                  return (
                    <tr key={d.key} className={tableRowClassName()}>
                      <td className={table.td}>{d.departure} → {d.arrival}</td>
                      <td className={table.td}>{d.heure}</td>
                      <td className={`${table.td} text-center font-medium tabular-nums`}>{d.booked}</td>
                      <td className={`${table.td} text-center font-medium tabular-nums`}>{d.embarked}</td>
                      <td className={`${table.td} text-center font-medium tabular-nums`}>{d.absent}</td>
                      <td className={`${table.td} text-center font-medium tabular-nums`}>
                        <span className={pct < 30 ? "text-red-600 font-medium" : pct < 70 ? "text-amber-600" : "text-emerald-600 font-medium"}>
                          {pct}%
                        </span>
                      </td>
                      <td className={table.td}>
                        <StatusBadge status={sc.status}>{sc.label}</StatusBadge>
                      </td>
                      <td className={`${table.td} whitespace-nowrap`}>
                        <span className="inline-flex max-w-[150px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          {vehicleDisplay}
                        </span>
                      </td>
                      <td className={`${table.td} max-w-[160px]`}>
                        <span className="block truncate whitespace-nowrap font-medium text-slate-700">{driverDisplay}</span>
                      </td>
                      <td className={`${table.td} min-w-[260px]`}>
                        {!aff ? (
                          <button
                            type="button"
                            onClick={() => setAssignModalRow({ key: d.key, tripId: d.tripId, departure: d.departure, arrival: d.arrival, heure: d.heure })}
                            className="inline-flex items-center rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                          >
                            Affecter un véhicule
                          </button>
                        ) : aff.status === AFFECTATION_STATUS.AFFECTE ? (
                          <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
                            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              En attente de depart
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmDeparture(aff.id, aff.agencyId, d.key)}
                              disabled={isActioning}
                              className="inline-flex items-center rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isActioning ? "…" : "Confirmer départ"}
                            </button>
                            <a
                              href="/agence/fleet/operations"
                              className="inline-flex items-center rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              Modifier affectation
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                setCancelModal({
                                  affectationId: aff.id,
                                  agencyIdAff: aff.agencyId,
                                  rowKey: d.key,
                                  routeLabel: `${d.departure} → ${d.arrival} (${d.heure})`,
                                });
                                setCancelReason("");
                              }}
                              disabled={isActioning}
                              className="inline-flex items-center rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              Annuler depart
                            </button>
                            </div>
                          </div>
                        ) : aff.status === AFFECTATION_STATUS.DEPART_CONFIRME ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                            En transit
                          </span>
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

      <SectionCard title="Véhicules en approche (à confirmer)" icon={MapPin} noPad>
        {incomingTransit.length === 0 ? (
          <EmptyState message="Aucun véhicule en approche pour votre agence." />
        ) : (
          <div className={table.wrapper}>
            <table className={`${table.base} min-w-[900px]`}>
              <thead className={table.head}>
                <tr>
                  <th className={table.th}>Itinéraire</th>
                  <th className={table.th}>Départ confirmé</th>
                  <th className={table.th}>Véhicule</th>
                  <th className={table.th}>Chauffeur</th>
                  <th className={`${table.th} text-center`}>Passagers</th>
                  <th className={`${table.th} text-center`}>Colis</th>
                  <th className={table.th}>Action destination</th>
                </tr>
              </thead>
              <tbody className={table.body}>
                {incomingTransit.map((a) => {
                  const rowKey = `arrive-${a.id}`;
                  const isActioning = actioningKey === rowKey;
                  const vehicleNumber = vehicleNumberById[a.vehicleId] ?? "";
                  const m = incomingMetricsByAffectation[a.id] ?? { booked: 0, embarked: 0, absent: 0, parcels: 0 };
                  return (
                    <tr key={a.id} className={tableRowClassName()}>
                      <td className={table.td}>{a.departureCity} → {a.arrivalCity}</td>
                      <td className={table.td}>{formatDepartureTimeLabel(a.departureTime)}</td>
                      <td className={table.td}>
                        {vehicleNumber ? `Bus #${vehicleNumber}` : `${a.vehiclePlate || "—"} / ${a.vehicleModel || "—"}`}
                      </td>
                      <td className={table.td}>{a.driverName || "—"}</td>
                      <td className={`${table.td} text-center`}>
                        <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                          <span title="Réservés">R:{m.booked}</span>
                          <span title="Embarqués">E:{m.embarked}</span>
                          <span title="Absents">A:{m.absent}</span>
                        </div>
                      </td>
                      <td className={`${table.td} text-center`}>
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                          {m.parcels}
                        </span>
                      </td>
                      <td className={table.td}>
                        <button
                          type="button"
                          onClick={() => void handleConfirmArrival(a.id, a.agencyId, rowKey)}
                          disabled={isActioning}
                          className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isActioning ? "..." : "Confirmer arrivée"}
                        </button>
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

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="border-b p-4">
              <h3 className="text-base font-semibold text-slate-900">Confirmer l'annulation du départ</h3>
              <p className="mt-1 text-xs text-slate-500">{cancelModal.routeLabel}</p>
            </div>
            <div className="space-y-2 p-4">
              <label className="block text-sm font-medium text-slate-700" htmlFor="cancel-reason">
                Motif d'annulation
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                placeholder="Ex: insecurite, incident technique, route fermee..."
              />
            </div>
            <div className="flex gap-2 border-t p-4">
              <button
                type="button"
                onClick={() => {
                  setCancelModal(null);
                  setCancelReason("");
                }}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                disabled={actioningKey === cancelModal.rowKey}
              >
                Retour
              </button>
              <button
                type="button"
                onClick={async () => {
                  const reason = cancelReason.trim();
                  if (reason.length < 3) {
                    setOpError("Merci de renseigner un motif d'annulation (au moins 3 caracteres).");
                    return;
                  }
                  await handleCancelAffectation(cancelModal.affectationId, cancelModal.agencyIdAff, cancelModal.rowKey, reason);
                  setCancelModal(null);
                  setCancelReason("");
                }}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                disabled={actioningKey === cancelModal.rowKey}
              >
                {actioningKey === cancelModal.rowKey ? "..." : "Confirmer annulation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Affecter un véhicule */}
      {assignModalRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Affecter un véhicule</h3>
              <button
                type="button"
                onClick={() => {
                  setAssignModalRow(null);
                  setAssignVehicleId(null);
                  setAssignForm({
                    tripId: "",
                    driverId: "",
                    driverLastName: "",
                    driverFirstName: "",
                    driverPhone: "",
                    convoyeurId: "",
                    convoyeurLastName: "",
                    convoyeurFirstName: "",
                    convoyeurPhone: "",
                  });
                }}
                className="p-1 rounded hover:bg-gray-100"
              >
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
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="text-sm font-medium text-slate-700 mb-2">Chauffeur (auto)</div>
                  <div className="text-sm text-slate-900">
                    {([assignForm.driverLastName || selectedVehicleAuto?.driverLastName, assignForm.driverFirstName || selectedVehicleAuto?.driverFirstName]
                      .filter(Boolean)
                      .join(" ")
                      .trim()) || "Non défini"}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {(assignForm.driverPhone || selectedVehicleAuto?.driverPhone || "Téléphone non défini")}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                  <div className="text-sm font-medium text-slate-700 mb-2">Convoyeur (auto)</div>
                  <div className="text-sm text-slate-900">
                    {([assignForm.convoyeurLastName || selectedVehicleAuto?.convoyeurLastName, assignForm.convoyeurFirstName || selectedVehicleAuto?.convoyeurFirstName]
                      .filter(Boolean)
                      .join(" ")
                      .trim()) || "Non défini"}
                  </div>
                  <div className="text-xs text-slate-600 mt-1">
                    {(assignForm.convoyeurPhone || selectedVehicleAuto?.convoyeurPhone || "Téléphone non défini")}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 p-4 border-t">
                <button
                  type="button"
                  onClick={() => {
                    setAssignModalRow(null);
                    setAssignVehicleId(null);
                    setAssignForm({
                      tripId: "",
                      driverId: "",
                      driverLastName: "",
                      driverFirstName: "",
                      driverPhone: "",
                      convoyeurId: "",
                      convoyeurLastName: "",
                      convoyeurFirstName: "",
                      convoyeurPhone: "",
                    });
                  }}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-50"
                >
                  Annuler
                </button>
                <button type="submit" disabled={assignSaving || !assignVehicleId} className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">{assignSaving ? "…" : "Affecter"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </StandardLayoutWrapper>
  );
}
