import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  QueryConstraint,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  FUEL_LOGS_COLLECTION,
  type FuelLogCreateInput,
  type FuelLogDoc,
} from "./fuelLogsTypes";

function fuelLogsRef(companyId: string) {
  return collection(db, "companies", companyId, FUEL_LOGS_COLLECTION);
}

export async function createFuelLog(
  companyId: string,
  input: FuelLogCreateInput
): Promise<string> {
  const ref = doc(fuelLogsRef(companyId));
  const liters = Number(input.liters);
  const price = Number(input.price);
  const odometer = Number(input.odometer);
  if (!Number.isFinite(liters) || liters <= 0) throw new Error("Litres invalides.");
  if (!Number.isFinite(price) || price <= 0) throw new Error("Prix invalide.");
  if (!Number.isFinite(odometer) || odometer < 0) throw new Error("Kilométrage invalide.");

  await setDoc(ref, {
    vehicleId: input.vehicleId,
    liters,
    price,
    station: input.station.trim(),
    odometer,
    date: input.date,
    driverId: input.driverId,
    createdBy: input.createdBy,
    createdAt: Timestamp.now(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function listFuelLogs(
  companyId: string,
  options?: { vehicleId?: string; limitCount?: number }
): Promise<(FuelLogDoc & { id: string })[]> {
  const constraints: QueryConstraint[] = [];
  if (options?.vehicleId) constraints.push(where("vehicleId", "==", options.vehicleId));
  constraints.push(orderBy("date", "desc"));
  constraints.push(limit(options?.limitCount ?? 100));
  const q = query(fuelLogsRef(companyId), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as FuelLogDoc & { id: string }));
}

