/**
 * Synchronisation colis ↔ instance de trajet (transportStatus).
 * Déclenché côté app quand le tripInstance change (ex. départ réel).
 * Ne modifie pas la finance.
 *
 * Modèle à deux phases (évite double vérité durable) :
 * 1) Proposition arrivée : `transportStatus = ARRIVED` + `needsValidation = true` — `currentStatus` reste `IN_TRANSIT`.
 * 2) Validation agent : `confirmShipmentArrivalValidation` → `currentStatus = ARRIVED` + `needsValidation = false`.
 * Le départ peut aligner `currentStatus` CREATED→IN_TRANSIT quand l’agence d’origine du trip correspond (physique au départ).
 */

import { doc, getDoc, runTransaction } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import {
  TRIP_INSTANCE_COLLECTION,
  type TripInstanceDoc,
} from "@/modules/compagnie/tripInstances/tripInstanceTypes";
import { canShipmentTransition } from "../domain/logisticsStateMachine";
import type { Shipment, ShipmentTransportStatus } from "../domain/shipment.types";
import { shipmentRef } from "../domain/firestorePaths";
import { getShipmentsByTripInstance } from "./shipmentTransportService";

function normTripId(id: unknown): string {
  return id != null ? String(id).trim() : "";
}

/**
 * PENDING → IN_TRANSIT et ASSIGNED → ARRIVED interdits ; ASSIGNED → IN_TRANSIT autorisé.
 */
function canProposeTransportInTransit(sh: Shipment, expectedTripId: string): boolean {
  const ts = sh.transportStatus as ShipmentTransportStatus | undefined;
  if (ts === "IN_TRANSIT" || ts === "ARRIVED") return false;
  if (ts === "PENDING_ASSIGNMENT") return false;
  if (ts === "ASSIGNED") return normTripId(sh.tripInstanceId) === expectedTripId;
  if (ts == null) return normTripId(sh.tripInstanceId) === expectedTripId;
  return false;
}

/**
 * Seulement IN_TRANSIT → ARRIVED (proposition contrôle), pas depuis PENDING ni ASSIGNED.
 */
function canProposeTransportArrived(sh: Shipment): boolean {
  return sh.transportStatus === "IN_TRANSIT";
}

/**
 * Appeler quand le trajet réel est parti (équivalent STARTED / en route).
 * Dans ce projet : statut tripInstance = `departed`.
 * Met transportStatus = IN_TRANSIT ; si le colis est encore CREATED à l’agence d’origine du trip, aligne currentStatus → IN_TRANSIT.
 */
export async function onTripInstanceStarted(companyId: string, tripInstanceId: string): Promise<void> {
  const tid = normTripId(tripInstanceId);
  if (!tid) return;

  console.info("[tripInstanceShipmentSync] onTripInstanceStarted", { companyId, tripInstanceId: tid });

  const tripSnap = await getDoc(doc(db, "companies", companyId, TRIP_INSTANCE_COLLECTION, tid));
  if (!tripSnap.exists()) {
    console.warn("[tripInstanceShipmentSync] onTripInstanceStarted: trip instance introuvable", tid);
    return;
  }
  const tripAgencyId = String((tripSnap.data() as { agencyId?: string }).agencyId ?? "");

  const shipments = await getShipmentsByTripInstance(companyId, tid);
  let updated = 0;

  for (const s of shipments) {
    try {
      const changed = await runTransaction(db, async (tx) => {
        const sRef = shipmentRef(db, companyId, s.shipmentId);
        const snap = await tx.get(sRef);
        if (!snap.exists()) return false;
        const sh = snap.data() as Shipment;

        if (!canProposeTransportInTransit(sh, tid)) return false;

        const patch: Record<string, unknown> = { transportStatus: "IN_TRANSIT" };

        if (
          sh.currentStatus === "CREATED" &&
          tripAgencyId &&
          sh.originAgencyId === tripAgencyId &&
          canShipmentTransition("CREATED", "IN_TRANSIT")
        ) {
          patch.currentStatus = "IN_TRANSIT";
          patch.currentAgencyId = sh.originAgencyId;
        }

        tx.update(sRef, patch);
        return true;
      });
      if (changed) {
        updated += 1;
        console.info("[tripInstanceShipmentSync] shipment transport → IN_TRANSIT", {
          shipmentId: s.shipmentId,
          tripInstanceId: tid,
        });
      }
    } catch (e) {
      console.warn("[tripInstanceShipmentSync] onTripInstanceStarted shipment skip", s.shipmentId, e);
    }
  }

  console.info("[tripInstanceShipmentSync] onTripInstanceStarted done", {
    tripInstanceId: tid,
    candidates: shipments.length,
    updated,
  });
}

/**
 * Arrivée du trajet à une agence : proposition d’arrivée (pas validation agent).
 * transportStatus → ARRIVED, needsValidation → true. Ne modifie pas currentStatus.
 */
export async function onTripInstanceArrivedAtAgency(
  companyId: string,
  tripInstanceId: string,
  agencyId: string
): Promise<void> {
  const tid = normTripId(tripInstanceId);
  const aid = normTripId(agencyId);
  if (!tid || !aid) return;

  console.info("[tripInstanceShipmentSync] onTripInstanceArrivedAtAgency", {
    companyId,
    tripInstanceId: tid,
    agencyId: aid,
  });

  const shipments = (await getShipmentsByTripInstance(companyId, tid)).filter(
    (s) => s.destinationAgencyId === aid
  );
  let updated = 0;

  for (const s of shipments) {
    try {
      const changed = await runTransaction(db, async (tx) => {
        const sRef = shipmentRef(db, companyId, s.shipmentId);
        const snap = await tx.get(sRef);
        if (!snap.exists()) return false;
        const sh = snap.data() as Shipment;

        if (!canProposeTransportArrived(sh)) return false;

        tx.update(sRef, {
          transportStatus: "ARRIVED",
          needsValidation: true,
        });
        return true;
      });
      if (changed) {
        updated += 1;
        console.info("[tripInstanceShipmentSync] shipment transport → ARRIVED (needsValidation)", {
          shipmentId: s.shipmentId,
          tripInstanceId: tid,
          agencyId: aid,
        });
      }
    } catch (e) {
      console.warn("[tripInstanceShipmentSync] onTripInstanceArrivedAtAgency skip", s.shipmentId, e);
    }
  }

  console.info("[tripInstanceShipmentSync] onTripInstanceArrivedAtAgency done", {
    tripInstanceId: tid,
    agencyId: aid,
    candidates: shipments.length,
    updated,
  });
}

/**
 * Fallback garanti quand le trip est clôturé côté transport (`status = arrived`) :
 * enchaîne `onTripInstanceArrivedAtAgency` pour chaque agence identifiable.
 *
 * Ordre : `agenciesInvolved` (dédoublonné) si non vide, sinon `agencyId` du document.
 * Si aucune agence : `console.warn` explicite (risque file arrivages vide).
 *
 * Limite connue (phase 4) : escales intermédiaires sans `agenciesInvolved` complet —
 * utiliser plus tard `currentLocationAgencyId` + événements par arrêt.
 */
export async function onTripInstanceArrivedAuto(companyId: string, tripInstanceId: string): Promise<void> {
  const tid = normTripId(tripInstanceId);
  if (!tid) return;

  console.info("[tripInstanceShipmentSync] onTripInstanceArrivedAuto", { companyId, tripInstanceId: tid });

  const tripSnap = await getDoc(doc(db, "companies", companyId, TRIP_INSTANCE_COLLECTION, tid));
  if (!tripSnap.exists()) {
    console.warn("[tripInstanceShipmentSync] onTripInstanceArrivedAuto: instance introuvable", {
      companyId,
      tripInstanceId: tid,
    });
    return;
  }

  const d = tripSnap.data() as TripInstanceDoc;
  const agencies: string[] = [];
  if (Array.isArray(d.agenciesInvolved) && d.agenciesInvolved.length > 0) {
    for (const x of d.agenciesInvolved) {
      const id = String(x ?? "").trim();
      if (id && !agencies.includes(id)) agencies.push(id);
    }
  }
  const primary = String(d.agencyId ?? "").trim();
  if (agencies.length === 0 && primary) agencies.push(primary);

  if (agencies.length === 0) {
    console.warn(
      "[tripInstanceShipmentSync] TRIP ARRIVED: aucune agence identifiable — onTripInstanceArrivedAtAgency non appelé (file arrivages peut rester vide). Renseigner agencyId ou agenciesInvolved sur le tripInstance.",
      { companyId, tripInstanceId: tid }
    );
    return;
  }

  for (const aid of agencies) {
    await onTripInstanceArrivedAtAgency(companyId, tid, aid);
  }

  console.info("[tripInstanceShipmentSync] onTripInstanceArrivedAuto done", {
    tripInstanceId: tid,
    agencies,
  });
}
