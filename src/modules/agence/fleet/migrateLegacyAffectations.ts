// src/modules/agence/fleet/migrateLegacyAffectations.ts
// Phase 3: Read legacy agences/{agencyId}/affectations, create/update fleetVehicles, mark migrated.
// Firebase Spark compatible — run from client (e.g. Fleet page "Migrer" button) or one-off script.
import {
  collection,
  getDocs,
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { FleetVehicleDoc } from "./types";

const MIGRATED_FLAG = "migratedToFleetAt";

export interface LegacyAffectationDoc {
  busNumber?: string;
  immatriculation?: string;
  chauffeur?: string;
  chefEmbarquement?: string;
  tripId?: string | null;
  date?: string;
  heure?: string;
  [key: string]: unknown;
}

export interface MigrateResult {
  companyId: string;
  agencyId: string;
  affectationId: string;
  created: boolean;
  vehicleId: string;
  error?: string;
}

/**
 * Migrate one legacy affectation to fleetVehicles.
 * Does not delete the legacy doc; adds migratedToFleetAt timestamp to it if you want to mark it.
 */
export async function migrateOneAffectation(
  companyId: string,
  agencyId: string,
  affectationId: string,
  capacity: number = 50
): Promise<MigrateResult> {
  const legacyRef = doc(db, `companies/${companyId}/agences/${agencyId}/affectations/${affectationId}`);
  const snap = await getDoc(legacyRef);
  if (!snap.exists()) {
    return {
      companyId,
      agencyId,
      affectationId,
      created: false,
      vehicleId: "",
      error: "Affectation introuvable",
    };
  }
  const d = snap.data() as LegacyAffectationDoc;
  if ((d as Record<string, unknown>)[MIGRATED_FLAG]) {
    return {
      companyId,
      agencyId,
      affectationId,
      created: false,
      vehicleId: "",
      error: "Déjà migrée",
    };
  }

  const now = serverTimestamp();
  const fleetPayload: FleetVehicleDoc = {
    plateNumber: d.busNumber || d.immatriculation || affectationId,
    internalCode: d.busNumber || d.immatriculation || affectationId,
    capacity,
    status: "assigned",
    currentAgencyId: agencyId,
    currentTripId: d.tripId ?? null,
    currentDeparture: null,
    currentArrival: null,
    currentDate: d.date ?? null,
    currentHeure: d.heure ?? null,
    lastMovementAt: now,
    chauffeurName: d.chauffeur ?? "",
    convoyeurName: d.chefEmbarquement ?? "",
    createdAt: now,
    updatedAt: now,
    migratedFromAffectation: true,
  };

  const fleetRef = doc(collection(db, `companies/${companyId}/fleetVehicles`));
  await setDoc(fleetRef, { ...fleetPayload, id: fleetRef.id });

  await setDoc(legacyRef, { ...d, [MIGRATED_FLAG]: new Date().toISOString() }, { merge: true });

  return {
    companyId,
    agencyId,
    affectationId,
    created: true,
    vehicleId: fleetRef.id,
  };
}

/**
 * List all legacy affectations for a company (all agencies).
 */
export async function listLegacyAffectations(
  companyId: string
): Promise<Array<{ agencyId: string; affectationId: string; data: LegacyAffectationDoc }>> {
  const agencesSnap = await getDocs(collection(db, `companies/${companyId}/agences`));
  const out: Array<{ agencyId: string; affectationId: string; data: LegacyAffectationDoc }> = [];
  for (const ag of agencesSnap.docs) {
    const affectationsSnap = await getDocs(
      collection(db, `companies/${companyId}/agences/${ag.id}/affectations`)
    );
    affectationsSnap.docs.forEach((d) => {
      out.push({
        agencyId: ag.id,
        affectationId: d.id,
        data: d.data() as LegacyAffectationDoc,
      });
    });
  }
  return out;
}

/**
 * Migrate all non-migrated legacy affectations for a company.
 */
export async function migrateAllLegacyAffectations(
  companyId: string,
  capacityDefault: number = 50
): Promise<MigrateResult[]> {
  const list = await listLegacyAffectations(companyId);
  const results: MigrateResult[] = [];
  for (const { agencyId, affectationId, data } of list) {
    if ((data as Record<string, unknown>)[MIGRATED_FLAG]) continue;
    try {
      const r = await migrateOneAffectation(companyId, agencyId, affectationId, capacityDefault);
      results.push(r);
    } catch (e) {
      results.push({
        companyId,
        agencyId,
        affectationId,
        created: false,
        vehicleId: "",
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}
