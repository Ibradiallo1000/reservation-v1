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
