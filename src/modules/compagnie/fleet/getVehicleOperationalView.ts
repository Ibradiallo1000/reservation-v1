/**
 * Lecture unifiée de l’état opérationnel d’un véhicule : priorité à vehicleLiveState,
 * repli sur doc véhicule + trajet actif si besoin.
 */
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { TRIP_INSTANCE_COLLECTION, TRIP_INSTANCE_STATUT_METIER } from "../tripInstances/tripInstanceTypes";
import type { TripInstanceStatutMetier } from "../tripInstances/tripInstanceTypes";
import {
  deriveVehicleStateFromTripInstance,
  isVehicleCoherentWithTripInstance,
  vehicleLiveStateRef,
  type TripInstanceInputForVehicleSync,
  type VehicleLiveStateDoc,
} from "./syncVehicleWithTripInstance";

export type VehicleOperationalView = {
  vehicleId: string;
  companyId: string;
  /** Statut terrain aligné sur le trajet (source de vérité). */
  statusVehicule: string;
  currentAgencyId: string | null;
  destinationAgencyId: string | null;
  lastKnownAgencyId: string | null;
  tripInstanceId: string | null;
  statutMetier: TripInstanceStatutMetier | string | null;
  isReturnToOrigin: boolean;
  /** true si le doc véhicule correspond au trajet courant (quand trajet connu). */
  coherentWithTrip: boolean;
  /** provenance de la vue */
  source: "liveState" | "vehiclePlusTrip" | "vehicleOnly";
};

function tripShapeFromLive(l: VehicleLiveStateDoc): TripInstanceInputForVehicleSync {
  const ret = !!l.isReturnToOrigin;
  return {
    statutMetier: (l.statutMetier ?? TRIP_INSTANCE_STATUT_METIER.PLANIFIE) as TripInstanceStatutMetier,
    destinationAgencyId: l.destinationAgencyId,
    agencyId: null,
    isReturnToOrigin: ret,
    retourOrigine: ret,
  };
}

/**
 * Vue opérationnelle pour une UI (guichet, flotte, escale).
 * Préférer cette fonction aux champs `operationalStatus` / `currentTripId` (hors maintenance).
 */
export async function getVehicleOperationalView(
  companyId: string,
  vehicleId: string
): Promise<VehicleOperationalView | null> {
  const vid = String(vehicleId ?? "").trim();
  const cid = String(companyId ?? "").trim();
  if (!vid || !cid) return null;

  const liveSnap = await getDoc(vehicleLiveStateRef(cid, vid));
  if (liveSnap.exists()) {
    const l = liveSnap.data() as VehicleLiveStateDoc;
    const vSnap = await getDoc(doc(db, "companies", cid, "vehicles", vid));
    const vd = vSnap.exists()
      ? (vSnap.data() as {
          statusVehicule?: string;
          currentAgencyId?: string | null;
          destinationAgencyId?: string | null;
        })
      : {};
    const tripShape = tripShapeFromLive(l);
    tripShape.agencyId =
      (await resolveOriginAgencyFromTrip(cid, l.tripInstanceId)) ??
      (String((vd as { currentAgencyId?: string }).currentAgencyId ?? "").trim() || undefined);

    const agencyForTrip = tripShape.agencyId ?? l.lastKnownAgencyId ?? undefined;
    const coherent =
      !vSnap.exists() ||
      !l.tripInstanceId ||
      isVehicleCoherentWithTripInstance(
        {
          statusVehicule: vd.statusVehicule,
          currentAgencyId: vd.currentAgencyId,
          destinationAgencyId: vd.destinationAgencyId,
        },
        {
          statutMetier: tripShape.statutMetier,
          destinationAgencyId: l.destinationAgencyId,
          agencyId: agencyForTrip,
          isReturnToOrigin: tripShape.isReturnToOrigin,
          retourOrigine: tripShape.retourOrigine,
        }
      );

    return {
      vehicleId: vid,
      companyId: cid,
      statusVehicule: String(l.statusVehicule ?? "disponible").toLowerCase(),
      currentAgencyId: l.currentAgencyId ?? null,
      destinationAgencyId: l.destinationAgencyId ?? null,
      lastKnownAgencyId: l.lastKnownAgencyId ?? null,
      tripInstanceId: l.tripInstanceId ?? null,
      statutMetier: l.statutMetier ?? null,
      isReturnToOrigin: !!l.isReturnToOrigin,
      coherentWithTrip: coherent,
      source: "liveState",
    };
  }

  const vRef = doc(db, "companies", cid, "vehicles", vid);
  const vSnap = await getDoc(vRef);
  if (!vSnap.exists()) return null;
  const vd = vSnap.data() as {
    statusVehicule?: string;
    currentAgencyId?: string | null;
    destinationAgencyId?: string | null;
    lastKnownAgencyId?: string | null;
  };

  const activeTrip = await findActiveTripForVehicle(cid, vid);
  if (activeTrip) {
    const tripShape: TripInstanceInputForVehicleSync = {
      statutMetier: activeTrip.statutMetier,
      destinationAgencyId: activeTrip.destinationAgencyId,
      agencyId: activeTrip.agencyId,
      isReturnToOrigin: activeTrip.isReturnToOrigin,
      retourOrigine: activeTrip.retourOrigine,
    };
    const expected = deriveVehicleStateFromTripInstance(tripShape);
    const coherent = expected
      ? isVehicleCoherentWithTripInstance(
          {
            statusVehicule: vd.statusVehicule,
            currentAgencyId: vd.currentAgencyId,
            destinationAgencyId: vd.destinationAgencyId,
          },
          tripShape
        )
      : true;

    return {
      vehicleId: vid,
      companyId: cid,
      statusVehicule: String(expected?.statusVehicule ?? vd.statusVehicule ?? "disponible").toLowerCase(),
      currentAgencyId: expected?.currentAgencyId ?? vd.currentAgencyId ?? null,
      destinationAgencyId: expected?.destinationAgencyId ?? vd.destinationAgencyId ?? null,
      lastKnownAgencyId: expected?.lastKnownAgencyId ?? vd.lastKnownAgencyId ?? null,
      tripInstanceId: activeTrip.id,
      statutMetier: activeTrip.statutMetier ?? null,
      isReturnToOrigin: !!(activeTrip.isReturnToOrigin || activeTrip.retourOrigine),
      coherentWithTrip: coherent,
      source: "vehiclePlusTrip",
    };
  }

  return {
    vehicleId: vid,
    companyId: cid,
    statusVehicule: String(vd.statusVehicule ?? "disponible").toLowerCase(),
    currentAgencyId: vd.currentAgencyId ?? null,
    destinationAgencyId: vd.destinationAgencyId ?? null,
    lastKnownAgencyId: vd.lastKnownAgencyId ?? null,
    tripInstanceId: null,
    statutMetier: null,
    isReturnToOrigin: false,
    coherentWithTrip: true,
    source: "vehicleOnly",
  };
}

async function resolveOriginAgencyFromTrip(
  companyId: string,
  tripInstanceId: string | null
): Promise<string | undefined> {
  const tid = String(tripInstanceId ?? "").trim();
  if (!tid) return undefined;
  const snap = await getDoc(doc(db, "companies", companyId, TRIP_INSTANCE_COLLECTION, tid));
  if (!snap.exists()) return undefined;
  const d = snap.data() as { agencyId?: string };
  return String(d.agencyId ?? "").trim() || undefined;
}

type TripLite = TripInstanceInputForVehicleSync & {
  id: string;
  agencyId?: string;
  retourOrigine?: boolean;
};

async function findActiveTripForVehicle(companyId: string, vehicleId: string): Promise<TripLite | null> {
  const col = collection(db, "companies", companyId, TRIP_INSTANCE_COLLECTION);
  const activeStatuts: TripInstanceStatutMetier[] = [
    TRIP_INSTANCE_STATUT_METIER.EMBARQUEMENT_EN_COURS,
    TRIP_INSTANCE_STATUT_METIER.EMBARQUEMENT_TERMINE,
    TRIP_INSTANCE_STATUT_METIER.VALIDATION_AGENCE_REQUISE,
    TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT,
    TRIP_INSTANCE_STATUT_METIER.RETOUR_ORIGINE,
  ];
  const q = query(col, where("vehicleId", "==", vehicleId), limit(25));
  const snap = await getDocs(q);
  let best: TripLite | null = null;
  for (const d of snap.docs) {
    const raw = d.data() as TripLite;
    const sm = String(raw.statutMetier ?? "").trim() as TripInstanceStatutMetier;
    if (!activeStatuts.includes(sm)) continue;
    if (!best) {
      best = { ...raw, id: d.id, agencyId: raw.agencyId };
      continue;
    }
    const rank = (s: string) =>
      s === TRIP_INSTANCE_STATUT_METIER.EN_TRANSIT || s === TRIP_INSTANCE_STATUT_METIER.RETOUR_ORIGINE ? 2 : 1;
    if (rank(sm) > rank(String(best.statutMetier ?? ""))) {
      best = { ...raw, id: d.id, agencyId: raw.agencyId };
    }
  }
  return best;
}
