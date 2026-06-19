import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  bookSeatsOnTripInstanceInTransaction,
  buildTripInstanceId,
  getOrCreateTripInstanceForSlot,
  tripInstanceRef,
} from "@/modules/compagnie/tripInstances/tripInstanceService";

export type TripStatus = "OPEN" | "CLOSED" | "DEPARTED";

export type DepartureWorkflowDoc = {
  companyId: string;
  agencyId: string;
  tripInstanceId: string;
  tripAssignmentId?: string | null;
  tripKey?: string | null;
  trajetId?: string | null;
  departure: string;
  arrival: string;
  date: string;
  heure: string;
  tripStatus: TripStatus;
  reservationsCount: number;
  boardedPassengersCount: number;
  absentPassengersCount: number;
  pendingPassengersCount: number;
  lateBoardingCount: number;
  boardingClosedAt: unknown | null;
  boardingClosedBy: string | null;
  departureConfirmedAt: unknown | null;
  departureConfirmedBy: string | null;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  driverId?: string | null;
  driverName?: string | null;
  schemaVersion: 1;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ReportNextDeparture = {
  weeklyTripId: string;
  tripInstanceId: string;
  departure: string;
  arrival: string;
  date: string;
  heure: string;
};

export type ReportableAbsentReservation = {
  id: string;
  reservationDocId?: string;
  firestoreId?: string;
  nomClient?: string;
  telephone?: string;
  depart?: string;
  arrivee?: string;
  arrival?: string;
  date?: unknown;
  heure?: string;
  canal?: string;
  montant?: number;
  statut?: string;
  status?: string;
  statutEmbarquement?: string;
  boardingStatus?: string;
  trajetId?: string;
  tripInstanceId?: string;
  referenceCode?: string;
  qrCode?: string;
  publicToken?: string;
  seatsGo?: number;
  agencyId?: string;
  companyId?: string;
  compagnieId?: string;
  originStopOrder?: number | null;
  destinationStopOrder?: number | null;
  originStopId?: string | null;
  destinationStopId?: string | null;
};

export function departureWorkflowRef(companyId: string, agencyId: string, tripInstanceId: string) {
  return doc(db, "companies", companyId, "agences", agencyId, "departures", tripInstanceId);
}

function reservationDocId(row: { id: string; reservationDocId?: string; firestoreId?: string }): string {
  return String(row.reservationDocId ?? row.firestoreId ?? row.id ?? "").trim();
}

function effectiveBoardingStatus(row: {
  boardingStatus?: string;
  statutEmbarquement?: string;
}): "boarded" | "no_show" | "pending" {
  const boardingStatus = String(row.boardingStatus ?? "").toLowerCase();
  if (boardingStatus === "boarded") return "boarded";
  if (boardingStatus === "no_show") return "no_show";
  const statut = String(row.statutEmbarquement ?? "").toLowerCase();
  if (statut === "embarqué" || statut === "embarque") return "boarded";
  if (statut === "absent") return "no_show";
  return "pending";
}

function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function loadWeeklyTripForReport(params: {
  companyId: string;
  agencyId: string;
  trajetId?: string | null;
  departure: string;
  arrival: string;
}): Promise<{ id: string; data: Record<string, any> }> {
  const baseId = String(params.trajetId ?? "").trim();
  if (baseId) {
    const snap = await getDoc(
      doc(db, "companies", params.companyId, "agences", params.agencyId, "weeklyTrips", baseId)
    );
    if (snap.exists()) return { id: snap.id, data: snap.data() as Record<string, any> };
  }

  const weeklyRef = collection(db, "companies", params.companyId, "agences", params.agencyId, "weeklyTrips");
  const weeklySnap = await getDocs(weeklyRef);
  const match = weeklySnap.docs
    .map((d) => ({ id: d.id, data: d.data() as Record<string, any> }))
    .find((t) => {
      const active = t.data.active !== false;
      const dep = String(t.data.departure ?? "").trim();
      const arr = String(t.data.arrival ?? "").trim();
      return active && dep === params.departure && arr === params.arrival;
    });

  if (!match) throw new Error("Trajet hebdomadaire introuvable pour le report.");
  return match;
}

export async function resolveNextReportDeparture(params: {
  companyId: string;
  agencyId: string;
  trajetId?: string | null;
  departure: string;
  arrival: string;
  date: string;
  heure: string;
}): Promise<ReportNextDeparture> {
  const weekly = await loadWeeklyTripForReport(params);
  const start = new Date(`${params.date}T${params.heure || "00:00"}:00`);

  for (let add = 0; add < 14; add += 1) {
    const d = new Date(start);
    d.setDate(d.getDate() + add);
    const dayName = d.toLocaleDateString("fr-FR", { weekday: "long" }).toLowerCase();
    const hours: string[] = Array.isArray(weekly.data.horaires?.[dayName])
      ? [...weekly.data.horaires[dayName]].map(String).sort()
      : [];
    if (hours.length === 0) continue;

    if (add === 0) {
      const after = hours.find((h) => h > params.heure);
      if (!after) continue;
      const date = params.date;
      return {
        weeklyTripId: weekly.id,
        tripInstanceId: buildTripInstanceId(weekly.id, date, after),
        departure: params.departure,
        arrival: params.arrival,
        date,
        heure: after,
      };
    }

    const date = toLocalISO(d);
    const heure = hours[0];
    return {
      weeklyTripId: weekly.id,
      tripInstanceId: buildTripInstanceId(weekly.id, date, heure),
      departure: params.departure,
      arrival: params.arrival,
      date,
      heure,
    };
  }

  throw new Error("Aucun prochain départ disponible pour ce trajet.");
}

export async function ensureDepartureDocument(params: {
  companyId: string;
  agencyId: string;
  tripInstanceId: string;
  tripAssignmentId?: string | null;
  tripKey?: string | null;
  trajetId?: string | null;
  departure: string;
  arrival: string;
  date: string;
  heure: string;
  vehicleId?: string | null;
  vehicleLabel?: string | null;
  driverId?: string | null;
  driverName?: string | null;
}): Promise<void> {
  const ref = departureWorkflowRef(params.companyId, params.agencyId, params.tripInstanceId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists()) return;

    tx.set(ref, {
      companyId: params.companyId,
      agencyId: params.agencyId,
      tripInstanceId: params.tripInstanceId,
      tripAssignmentId: params.tripAssignmentId ?? null,
      tripKey: params.tripKey ?? null,
      trajetId: params.trajetId ?? null,
      departure: params.departure,
      arrival: params.arrival,
      date: params.date,
      heure: params.heure,
      tripStatus: "OPEN",
      reservationsCount: 0,
      boardedPassengersCount: 0,
      absentPassengersCount: 0,
      pendingPassengersCount: 0,
      lateBoardingCount: 0,
      boardingClosedAt: null,
      boardingClosedBy: null,
      departureConfirmedAt: null,
      departureConfirmedBy: null,
      vehicleId: params.vehicleId ?? null,
      vehicleLabel: params.vehicleLabel ?? null,
      driverId: params.driverId ?? null,
      driverName: params.driverName ?? null,
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    } satisfies Omit<DepartureWorkflowDoc, "createdAt" | "updatedAt"> & {
      createdAt: ReturnType<typeof serverTimestamp>;
      updatedAt: ReturnType<typeof serverTimestamp>;
    });
  });
}

export async function closeDepartureBoarding(params: {
  companyId: string;
  agencyId: string;
  tripInstanceId: string;
  userId: string;
  reservations: Array<{
    id: string;
    reservationDocId?: string;
    firestoreId?: string;
    boardingStatus?: string;
    statutEmbarquement?: string;
  }>;
}): Promise<{
  boardedCount: number;
  absentCount: number;
  pendingConvertedCount: number;
}> {
  if (params.reservations.length > 400) {
    throw new Error("Trop de réservations à clôturer en une seule transaction.");
  }

  const departureRef = departureWorkflowRef(params.companyId, params.agencyId, params.tripInstanceId);
  const pendingRows = params.reservations.filter((row) => effectiveBoardingStatus(row) === "pending");
  const boardedCount = params.reservations.filter((row) => effectiveBoardingStatus(row) === "boarded").length;
  const existingAbsentCount = params.reservations.filter((row) => effectiveBoardingStatus(row) === "no_show").length;
  const pendingConvertedCount = pendingRows.length;
  const absentCount = existingAbsentCount + pendingConvertedCount;

  await runTransaction(db, async (tx) => {
    const departureSnap = await tx.get(departureRef);
    if (!departureSnap.exists()) throw new Error("Départ introuvable.");
    const departure = departureSnap.data() as Partial<DepartureWorkflowDoc>;
    if (departure.tripStatus !== "OPEN") {
      throw new Error("Ce départ n'est plus ouvert.");
    }

    tx.update(departureRef, {
      tripStatus: "CLOSED",
      boardingClosedAt: serverTimestamp(),
      boardingClosedBy: params.userId,
      boardedPassengersCount: boardedCount,
      absentPassengersCount: absentCount,
      pendingPassengersCount: 0,
      updatedAt: serverTimestamp(),
    });

    for (const row of pendingRows) {
      const id = reservationDocId(row);
      if (!id) continue;
      const resRef = doc(db, "companies", params.companyId, "agences", params.agencyId, "reservations", id);
      tx.update(resRef, {
        boardingStatus: "no_show",
        statutEmbarquement: "absent",
        controleurId: params.userId,
        checkInTime: null,
      });
    }
  });

  return {
    boardedCount,
    absentCount,
    pendingConvertedCount,
  };
}

export async function confirmDeparture(params: {
  companyId: string;
  agencyId: string;
  tripInstanceId: string;
  userId: string;
  boardedPassengersCount: number;
  absentPassengersCount: number;
}): Promise<void> {
  const departureRef = departureWorkflowRef(params.companyId, params.agencyId, params.tripInstanceId);

  await runTransaction(db, async (tx) => {
    const departureSnap = await tx.get(departureRef);
    if (!departureSnap.exists()) throw new Error("Départ introuvable.");
    const departure = departureSnap.data() as Partial<DepartureWorkflowDoc>;
    if (departure.tripStatus !== "CLOSED") {
      throw new Error("L'embarquement doit être clôturé avant de valider le départ.");
    }

    tx.update(departureRef, {
      tripStatus: "DEPARTED",
      departureConfirmedAt: serverTimestamp(),
      departureConfirmedBy: params.userId,
      boardedPassengersCount: params.boardedPassengersCount,
      absentPassengersCount: params.absentPassengersCount,
      pendingPassengersCount: 0,
      updatedAt: serverTimestamp(),
    });
  });
}

export async function reportFinalAbsentReservations(params: {
  companyId: string;
  agencyId: string;
  tripInstanceId: string;
  userId: string;
  trajetId?: string | null;
  departure: string;
  arrival: string;
  date: string;
  heure: string;
  seatCapacity?: number | null;
  reservations: ReportableAbsentReservation[];
}): Promise<{
  reportedCount: number;
  skippedCount: number;
  nextDeparture: ReportNextDeparture;
}> {
  const nextDeparture = await resolveNextReportDeparture({
    companyId: params.companyId,
    agencyId: params.agencyId,
    trajetId: params.trajetId ?? null,
    departure: params.departure,
    arrival: params.arrival,
    date: params.date,
    heure: params.heure,
  });

  const weekly = await loadWeeklyTripForReport({
    companyId: params.companyId,
    agencyId: params.agencyId,
    trajetId: nextDeparture.weeklyTripId,
    departure: params.departure,
    arrival: params.arrival,
  });
  const seatCap = Math.max(
    1,
    Number(
      params.seatCapacity ??
        weekly.data.places ??
        weekly.data.seats ??
        weekly.data.capacitySeats ??
        30
    ) || 30
  );
  const tripInstance = await getOrCreateTripInstanceForSlot(params.companyId, {
    agencyId: params.agencyId,
    departureCity: params.departure,
    arrivalCity: params.arrival,
    date: nextDeparture.date,
    departureTime: nextDeparture.heure,
    weeklyTripId: nextDeparture.weeklyTripId,
    seatCapacity: seatCap,
    capacitySeats: seatCap,
    price: Number(weekly.data.price) > 0 ? Number(weekly.data.price) : null,
    routeId: String(weekly.data.routeId ?? "").trim() || null,
    createdBy: params.userId,
  });
  const nextTripInstanceId = tripInstance.id;

  let reportedCount = 0;
  let skippedCount = 0;
  const reservationsRef = collection(
    db,
    "companies",
    params.companyId,
    "agences",
    params.agencyId,
    "reservations"
  );

  for (const source of params.reservations) {
    const sourceReservationId = reservationDocId(source);
    if (!sourceReservationId) {
      skippedCount += 1;
      continue;
    }
    if (source.boardingStatus !== "no_show" || source.statutEmbarquement !== "absent") {
      skippedCount += 1;
      continue;
    }

    const existingReport = await getDocs(
      query(reservationsRef, where("sourceReservationId", "==", sourceReservationId), limit(1))
    );
    if (!existingReport.empty) {
      skippedCount += 1;
      continue;
    }

    const reportReservationId = `${sourceReservationId}__report__${nextTripInstanceId}`.replace(/[\/#?]/g, "_");
    const reportRef = doc(reservationsRef, reportReservationId);
    const logRef = doc(collection(db, "companies", params.companyId, "agences", params.agencyId, "boardingLogs"));
    const tripRef = tripInstanceRef(params.companyId, nextTripInstanceId);
    const seats = Math.max(1, Number(source.seatsGo ?? 1) || 1);

    const created = await runTransaction(db, async (tx) => {
      const departureSnap = await tx.get(
        departureWorkflowRef(params.companyId, params.agencyId, params.tripInstanceId)
      );
      if (!departureSnap.exists()) throw new Error("Départ introuvable.");
      const departure = departureSnap.data() as Partial<DepartureWorkflowDoc>;
      if (departure.tripStatus !== "DEPARTED") {
        throw new Error("Le report est autorisé uniquement après validation du départ.");
      }

      const existingSnap = await tx.get(reportRef);
      if (existingSnap.exists()) return false;

      const tripSnap = await tx.get(tripRef);
      bookSeatsOnTripInstanceInTransaction(tx, tripRef, tripSnap, seats, {
        originStopOrder: source.originStopOrder ?? undefined,
        destinationStopOrder: source.destinationStopOrder ?? undefined,
        depart: source.depart ?? params.departure,
        arrivee: source.arrivee ?? source.arrival ?? params.arrival,
      });

      const now = serverTimestamp();
      const referenceBase = String(source.referenceCode ?? sourceReservationId).trim();
      tx.set(reportRef, {
        companyId: params.companyId,
        compagnieId: params.companyId,
        agencyId: params.agencyId,
        depart: source.depart ?? params.departure,
        arrivee: source.arrivee ?? source.arrival ?? params.arrival,
        arrival: source.arrival ?? source.arrivee ?? params.arrival,
        trajetId: nextDeparture.weeklyTripId,
        tripInstanceId: nextTripInstanceId,
        date: nextDeparture.date,
        heure: nextDeparture.heure,
        nomClient: source.nomClient ?? "",
        telephone: source.telephone ?? "",
        seatsGo: seats,
        seatsReturn: 0,
        montant: 0,
        canal: "report",
        status: "confirme",
        statut: "confirme",
        boardingStatus: "pending",
        statutEmbarquement: "en_attente",
        controleurId: null,
        checkInTime: null,
        dropoffStatus: "pending",
        journeyStatus: "booked",
        sourceReservationId,
        reportedFromTripInstanceId: params.tripInstanceId,
        reportedAt: now,
        reportedBy: params.userId,
        originStopOrder: source.originStopOrder ?? null,
        destinationStopOrder: source.destinationStopOrder ?? null,
        originStopId: source.originStopId ?? null,
        destinationStopId: source.destinationStopId ?? null,
        referenceCode: `R-${referenceBase}-${nextDeparture.date.replace(/-/g, "")}-${nextDeparture.heure.replace(":", "")}`,
        qrCode: reportReservationId,
        createdAt: now,
        createdBy: params.userId,
        createdByUid: params.userId,
      });

      tx.set(logRef, {
        action: "REPORT_CREATED",
        reservationId: reportReservationId,
        sourceReservationId,
        tripInstanceId: nextTripInstanceId,
        reportedFromTripInstanceId: params.tripInstanceId,
        createdBy: params.userId,
        createdAt: now,
      });

      return true;
    });

    if (created) reportedCount += 1;
    else skippedCount += 1;
  }

  return {
    reportedCount,
    skippedCount,
    nextDeparture: {
      ...nextDeparture,
      tripInstanceId: nextTripInstanceId,
    },
  };
}
