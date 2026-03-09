import type { Timestamp } from "firebase/firestore";

export const FUEL_LOGS_COLLECTION = "fuelLogs";

export interface FuelLogDoc {
  vehicleId: string;
  liters: number;
  price: number;
  station: string;
  odometer: number;
  date: Timestamp;
  driverId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface FuelLogCreateInput {
  vehicleId: string;
  liters: number;
  price: number;
  station: string;
  odometer: number;
  date: Timestamp;
  driverId: string;
  createdBy: string;
}

