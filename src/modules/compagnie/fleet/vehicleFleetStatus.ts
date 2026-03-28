/**
 * Statut métier simplifié véhicule (Phase 1 normalisation).
 * Conservé en complément des champs legacy (status, operationalStatus, technicalStatus).
 */
import { VEHICLE_STATUS, type VehicleStatus } from "./vehicleTypes";
import { OPERATIONAL_STATUS, type OperationalStatus } from "./vehicleTransitions";
import { TECHNICAL_STATUS, type TechnicalStatus } from "./vehicleTransitions";

export const VEHICLE_FLEET_STATUS = {
  DISPONIBLE: "disponible",
  EN_TRANSIT: "en_transit",
  MAINTENANCE: "maintenance",
} as const;

export type VehicleFleetStatus = (typeof VEHICLE_FLEET_STATUS)[keyof typeof VEHICLE_FLEET_STATUS];

export const VEHICLE_FLEET_STATUS_VALUES: readonly VehicleFleetStatus[] = [
  VEHICLE_FLEET_STATUS.DISPONIBLE,
  VEHICLE_FLEET_STATUS.EN_TRANSIT,
  VEHICLE_FLEET_STATUS.MAINTENANCE,
];

export function isValidFleetStatus(value: string | null | undefined): value is VehicleFleetStatus {
  return VEHICLE_FLEET_STATUS_VALUES.includes(value as VehicleFleetStatus);
}

export function assertValidFleetStatus(value: string | null | undefined): VehicleFleetStatus {
  if (!isValidFleetStatus(value)) {
    throw new Error(
      `Statut véhicule invalide : « ${String(value)} ». Valeurs autorisées : ${VEHICLE_FLEET_STATUS_VALUES.join(", ")}.`
    );
  }
  return value;
}

/** Mappe une valeur brute (Firestore / formulaires / legacy) vers l’un des 3 statuts. */
export function normalizeFleetStatusInput(raw: unknown): VehicleFleetStatus {
  const s = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (
    s === "disponible" ||
    s === "garage" ||
    s === "available" ||
    s === "libre" ||
    s === "en_service" ||
    s === "affecte" ||
    s === "affecté"
  ) {
    return VEHICLE_FLEET_STATUS.DISPONIBLE;
  }
  if (
    s === "en_transit" ||
    s === "transit" ||
    s === "route" ||
    String(raw ?? "").toUpperCase() === VEHICLE_STATUS.EN_TRANSIT
  ) {
    return VEHICLE_FLEET_STATUS.EN_TRANSIT;
  }
  if (
    s === "maintenance" ||
    s === "en_maintenance" ||
    s === "accidente" ||
    s === "accidenté" ||
    s === "hors_service" ||
    s === "hors-service" ||
    String(raw ?? "").toUpperCase() === VEHICLE_STATUS.EN_MAINTENANCE ||
    String(raw ?? "").toUpperCase() === VEHICLE_STATUS.ACCIDENTE ||
    String(raw ?? "").toUpperCase() === VEHICLE_STATUS.HORS_SERVICE
  ) {
    return VEHICLE_FLEET_STATUS.MAINTENANCE;
  }

  return VEHICLE_FLEET_STATUS.DISPONIBLE;
}

/**
 * Déduit fleetStatus à partir des champs déjà présents sur le document.
 * Priorité : technique non NORMAL → maintenance ; EN_TRANSIT → en_transit ; sinon disponible.
 */
export function inferFleetStatus(data: Record<string, unknown>): VehicleFleetStatus {
  if (data.fleetStatus != null && isValidFleetStatus(String(data.fleetStatus))) {
    return String(data.fleetStatus) as VehicleFleetStatus;
  }

  const tech = String(data.technicalStatus ?? "").toUpperCase() as TechnicalStatus;
  if (tech && tech !== TECHNICAL_STATUS.NORMAL) {
    return VEHICLE_FLEET_STATUS.MAINTENANCE;
  }

  const op = String(data.operationalStatus ?? "").toUpperCase() as OperationalStatus;
  if (op === OPERATIONAL_STATUS.EN_TRANSIT) {
    return VEHICLE_FLEET_STATUS.EN_TRANSIT;
  }

  const st = String(data.status ?? "").trim();
  const fleetFromLegacy = normalizeFleetStatusInput(st);
  if (fleetFromLegacy === VEHICLE_FLEET_STATUS.EN_TRANSIT || fleetFromLegacy === VEHICLE_FLEET_STATUS.MAINTENANCE) {
    return fleetFromLegacy;
  }

  return VEHICLE_FLEET_STATUS.DISPONIBLE;
}

/** Champs legacy à persister pour rester alignés avec fleetStatus (écriture). */
export function fleetStatusToLegacyFirestoreFields(fs: VehicleFleetStatus): {
  status: VehicleStatus;
  technicalStatus: TechnicalStatus;
  operationalStatus: OperationalStatus;
  fleetStatus: VehicleFleetStatus;
} {
  if (fs === VEHICLE_FLEET_STATUS.EN_TRANSIT) {
    return {
      fleetStatus: fs,
      status: VEHICLE_STATUS.EN_TRANSIT,
      technicalStatus: TECHNICAL_STATUS.NORMAL,
      operationalStatus: OPERATIONAL_STATUS.EN_TRANSIT,
    };
  }
  if (fs === VEHICLE_FLEET_STATUS.MAINTENANCE) {
    return {
      fleetStatus: fs,
      status: VEHICLE_STATUS.EN_MAINTENANCE,
      technicalStatus: TECHNICAL_STATUS.MAINTENANCE,
      operationalStatus: OPERATIONAL_STATUS.GARAGE,
    };
  }
  return {
    fleetStatus: fs,
    status: VEHICLE_STATUS.GARAGE,
    technicalStatus: TECHNICAL_STATUS.NORMAL,
    operationalStatus: OPERATIONAL_STATUS.GARAGE,
  };
}

/** Applique fleetStatus en préservant AFFECTE si le véhicule est déjà affecté (pas encore parti). */
/** Mappe un statut legacy (VEHICLE_STATUS) vers fleetStatus (écriture / sync). */
export function legacyVehicleStatusToFleetStatus(status: string | undefined | null): VehicleFleetStatus {
  const u = String(status ?? "").trim();
  if (u === VEHICLE_STATUS.EN_TRANSIT) return VEHICLE_FLEET_STATUS.EN_TRANSIT;
  if (
    u === VEHICLE_STATUS.EN_MAINTENANCE ||
    u === VEHICLE_STATUS.ACCIDENTE ||
    u === VEHICLE_STATUS.HORS_SERVICE
  ) {
    return VEHICLE_FLEET_STATUS.MAINTENANCE;
  }
  return VEHICLE_FLEET_STATUS.DISPONIBLE;
}

export function fleetStatusToLegacyFirestoreFieldsRespectingAffectation(
  fs: VehicleFleetStatus,
  priorOperational: OperationalStatus | undefined
): {
  status: VehicleStatus;
  technicalStatus: TechnicalStatus;
  operationalStatus: OperationalStatus;
  fleetStatus: VehicleFleetStatus;
} {
  if (fs === VEHICLE_FLEET_STATUS.EN_TRANSIT) {
    return fleetStatusToLegacyFirestoreFields(fs);
  }
  if (fs === VEHICLE_FLEET_STATUS.MAINTENANCE) {
    return fleetStatusToLegacyFirestoreFields(fs);
  }
  if (priorOperational === OPERATIONAL_STATUS.AFFECTE) {
    return {
      fleetStatus: VEHICLE_FLEET_STATUS.DISPONIBLE,
      status: VEHICLE_STATUS.EN_SERVICE,
      technicalStatus: TECHNICAL_STATUS.NORMAL,
      operationalStatus: OPERATIONAL_STATUS.AFFECTE,
    };
  }
  return fleetStatusToLegacyFirestoreFields(VEHICLE_FLEET_STATUS.DISPONIBLE);
}
