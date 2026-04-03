import type { Firestore, Transaction } from "firebase/firestore";
import { addDoc, collection, doc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  TRIP_INSTANCE_STATUT_METIER,
  type TripInstanceStatutMetier,
} from "../tripInstances/tripInstanceTypes";

function companyVehicleRef(companyId: string, vehicleId: string) {
  return doc(db, "companies", companyId, "vehicles", vehicleId);
}

export function vehicleLiveStateRef(companyId: string, vehicleId: string) {
  return doc(db, "companies", companyId, "vehicleLiveState", vehicleId);
}

/** Vue matérialisée (même transaction que le doc véhicule) pour lectures rapides. */
export type VehicleLiveStateDoc = {
  companyId: string;
  vehicleId: string;
  tripInstanceId: string | null;
  statutMetier?: string | null;
  statusVehicule: string;
  currentAgencyId: string | null;
  destinationAgencyId: string | null;
  lastKnownAgencyId: string | null;
  isReturnToOrigin?: boolean;
  updatedAt?: unknown;
};

export type VehicleDerivedFromTrip = {
  statusVehicule: "disponible" | "affecte" | "en_transit" | "en_maintenance";
  currentAgencyId: string | null;
  /** Miroir agence destination du mouvement en cours (retour origine → agencyId). */
  destinationAgencyId: string | null;
  lastKnownAgencyId: string | null;
};

export type TripInstanceInputForVehicleSync = {
  statutMetier?: TripInstanceStatutMetier | string | null;
  destinationAgencyId?: string | null;
  agencyId?: string | null;
  isReturnToOrigin?: boolean | null;
  /** @deprecated utiliser isReturnToOrigin */
  retourOrigine?: boolean | null;
};

function returnToOriginFlag(t: TripInstanceInputForVehicleSync): boolean {
  return t.isReturnToOrigin === true || t.retourOrigine === true;
}

function logicalDestinationAgencyId(
  t: TripInstanceInputForVehicleSync,
  origin: string | null,
  destConfigured: string | null
): string | null {
  if (returnToOriginFlag(t) && origin) return origin;
  return destConfigured;
}

function normalizeAgencyId(v: unknown): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

/**
 * Dérive l'état véhicule attendu à partir du trajet (source de vérité = statutMetier + flags retour).
 */
export function deriveVehicleStateFromTripInstance(
  ti: TripInstanceInputForVehicleSync
): VehicleDerivedFromTrip | null {
  const smRaw = String(ti.statutMetier ?? "").trim();
  const sm = (smRaw || TRIP_INSTANCE_STATUT_METIER.PLANIFIE) as TripInstanceStatutMetier;

  const originAgencyId = String(ti.agencyId ?? "").trim() || null;
  const destinationAgencyIdConfig = String(ti.destinationAgencyId ?? "").trim() || null;
  const logicalDest = logicalDestinationAgencyId(ti, originAgencyId, destinationAgencyIdConfig);

  if (sm === TRIP_INSTANCE_STATUT_METIER.PLANIFIE) {
    return {
      statusVehicule: "disponible",
      currentAgencyId: originAgencyId,
      destinationAgencyId: null,
      lastKnownAgencyId: originAgencyId,
    };
  }

  if (sm === TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT || sm === TRIP_INSTANCE_STATUT_METIER.RETOUR_ORIGINE) {
    return {
      statusVehicule: "en_transit",
      currentAgencyId: null,
      destinationAgencyId: logicalDest,
      lastKnownAgencyId: originAgencyId ?? logicalDest,
    };
  }

  if (sm === TRIP_INSTANCE_STATUT_METIER.TERMINE) {
    const atAgency = returnToOriginFlag(ti)
      ? originAgencyId
      : destinationAgencyIdConfig ?? originAgencyId;
    return {
      statusVehicule: "disponible",
      currentAgencyId: atAgency,
      destinationAgencyId: null,
      lastKnownAgencyId: atAgency,
    };
  }

  return {
    statusVehicule: "affecte",
    currentAgencyId: originAgencyId,
    destinationAgencyId: logicalDest,
    lastKnownAgencyId: originAgencyId,
  };
}

function vehicleMatchesTrip(
  vd: { statusVehicule?: string; currentAgencyId?: string | null; destinationAgencyId?: string | null },
  expected: VehicleDerivedFromTrip
): boolean {
  const st = String(vd.statusVehicule ?? "").toLowerCase();
  if (st !== expected.statusVehicule) return false;
  if (normalizeAgencyId(vd.currentAgencyId) !== normalizeAgencyId(expected.currentAgencyId)) return false;
  if (normalizeAgencyId(vd.destinationAgencyId) !== normalizeAgencyId(expected.destinationAgencyId)) return false;
  return true;
}

/**
 * Vérifie la cohérence véhicule ↔ trajet (état courant avant transition).
 */
export function isVehicleCoherentWithTripInstance(
  vehicleData: { statusVehicule?: string; currentAgencyId?: string | null; destinationAgencyId?: string | null },
  tripData: TripInstanceInputForVehicleSync
): boolean {
  const expected = deriveVehicleStateFromTripInstance(tripData);
  if (!expected) return false;
  return vehicleMatchesTrip(vehicleData, expected);
}

/**
 * Dans une transaction : applique la dérivation depuis le trajet (après mise à jour du doc tripInstance).
 */
export function applyVehicleSyncFromTripInstanceInTransaction(
  tx: Transaction,
  companyId: string,
  vehicleId: string,
  tripInstance: TripInstanceInputForVehicleSync,
  tripInstanceId: string
): void {
  const vid = String(vehicleId ?? "").trim();
  if (!vid) return;
  const expected = deriveVehicleStateFromTripInstance(tripInstance);
  if (!expected) return;
  const vRef = companyVehicleRef(companyId, vid);
  const sm = String(tripInstance.statutMetier ?? "").trim() || null;
  const livePayload: VehicleLiveStateDoc = {
    companyId,
    vehicleId: vid,
    tripInstanceId: String(tripInstanceId ?? "").trim() || null,
    statutMetier: sm,
    statusVehicule: expected.statusVehicule,
    currentAgencyId: expected.currentAgencyId,
    destinationAgencyId: expected.destinationAgencyId,
    lastKnownAgencyId: expected.lastKnownAgencyId,
    isReturnToOrigin: !!(tripInstance.isReturnToOrigin || tripInstance.retourOrigine),
    updatedAt: serverTimestamp(),
  };
  tx.set(
    vRef,
    {
      statusVehicule: expected.statusVehicule,
      currentAgencyId: expected.currentAgencyId,
      destinationAgencyId: expected.destinationAgencyId,
      lastKnownAgencyId: expected.lastKnownAgencyId,
      lastMovementAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  tx.set(vehicleLiveStateRef(companyId, vid), livePayload, { merge: true });
}

function systemErrorsCol(companyId: string) {
  return collection(db, "companies", companyId, "systemErrors");
}

/**
 * Détecte une incohérence véhicule / tripInstance : journal critique + trace Firestore, sans correction du véhicule.
 */
export async function detectAndReconcileVehicleWithTripInstance(
  companyId: string,
  tripInstanceId: string,
  firestore: Firestore = db
): Promise<{ ok: boolean; reconciled: boolean; reason?: string }> {
  const tiRef = doc(firestore, "companies", companyId, "tripInstances", tripInstanceId);
  const tiSnap = await getDoc(tiRef);
  if (!tiSnap.exists()) return { ok: false, reconciled: false, reason: "trip_missing" };
  const ti = tiSnap.data() as TripInstanceInputForVehicleSync & { vehicleId?: string | null; tripId?: string };
  const vid = String(ti.vehicleId ?? "").trim();
  if (!vid) return { ok: true, reconciled: false };
  const vRef = doc(firestore, "companies", companyId, "vehicles", vid);
  const vSnap = await getDoc(vRef);
  if (!vSnap.exists()) return { ok: false, reconciled: false, reason: "vehicle_missing" };
  const vd = vSnap.data() as {
    statusVehicule?: string;
    currentAgencyId?: string | null;
    destinationAgencyId?: string | null;
  };
  const tripShape: TripInstanceInputForVehicleSync = {
    statutMetier: ti.statutMetier,
    destinationAgencyId: ti.destinationAgencyId,
    agencyId: ti.agencyId,
    isReturnToOrigin: ti.isReturnToOrigin,
    retourOrigine: ti.retourOrigine,
  };
  if (isVehicleCoherentWithTripInstance(vd, tripShape)) return { ok: true, reconciled: false };

  const payload = {
    type: "vehicle_trip_instance_mismatch",
    severity: "critical",
    companyId,
    tripInstanceId,
    tripId: String(ti.tripId ?? tripInstanceId),
    vehicleId: vid,
    tripStatutMetier: ti.statutMetier ?? null,
    vehicleStatusVehicule: vd.statusVehicule ?? null,
    tripSnapshot: {
      statutMetier: ti.statutMetier ?? null,
      agencyId: ti.agencyId ?? null,
      destinationAgencyId: ti.destinationAgencyId ?? null,
      isReturnToOrigin: ti.isReturnToOrigin ?? null,
    },
    vehicleSnapshot: {
      statusVehicule: vd.statusVehicule ?? null,
      currentAgencyId: vd.currentAgencyId ?? null,
      destinationAgencyId: vd.destinationAgencyId ?? null,
    },
    createdAt: serverTimestamp(),
  };

  console.error("[fleet-sync] CRITICAL: incohérence véhicule / tripInstance (aucune correction automatique)", payload);

  try {
    await addDoc(systemErrorsCol(companyId), payload);
  } catch (e) {
    console.error("[fleet-sync] Écriture systemErrors impossible", e);
  }

  return { ok: true, reconciled: false, reason: "mismatch_logged" };
}
