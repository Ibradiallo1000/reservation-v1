import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";

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
