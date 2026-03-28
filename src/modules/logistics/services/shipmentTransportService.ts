/**
 * Rattachement des colis au transport (tripInstance) — logique serveur / données uniquement (pas d’UI).
 * Réaffectation autorisée (correction bus) avec audit et ajustement parcelCount sur les instances.
 */

import { getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { shipmentRef, shipmentsRef } from "../domain/firestorePaths";
import type { Shipment } from "../domain/shipment.types";
import {
  decrementParcelCount,
  incrementParcelCount,
} from "@/modules/compagnie/tripInstances/tripInstanceService";

export type AssignShipmentToTripInstanceOptions = {
  /** User id pour audit lors d’une réaffectation (recommandé). */
  reassignedBy?: string;
};

/**
 * Colis considérés en attente d’affectation à un départ : pas d’instance, et statut transport absent / PENDING.
 * Exclut les anciens documents déjà liés à un tripInstanceId mais sans transportStatus (déjà sur un bus).
 */
function isPendingTransportAssignment(s: Shipment): boolean {
  const ts = s.transportStatus;
  const statusPending = ts == null || ts === "PENDING_ASSIGNMENT";
  if (!statusPending) return false;
  const hasTrip = s.tripInstanceId != null && String(s.tripInstanceId).trim() !== "";
  if (hasTrip) return false;
  return true;
}

/**
 * Associe un colis à une instance de trajet et passe transportStatus à ASSIGNED.
 * — Première affectation : incrémente parcelCount sur la nouvelle instance.
 * — Réaffectation (autre instance) : décrémente l’ancienne, incrémente la nouvelle, trace previousTripInstanceId / reassignedAt / reassignedBy.
 * — Idempotent si même tripInstanceId (corrige seulement transportStatus si besoin, sans toucher aux compteurs).
 *
 * @param companyId — requis (chemin Firestore companies/{companyId}/…/shipments)
 */
export async function assignShipmentToTripInstance(
  companyId: string,
  shipmentId: string,
  tripInstanceId: string,
  options?: AssignShipmentToTripInstanceOptions
): Promise<void> {
  const tid = String(tripInstanceId).trim();
  if (!tid) throw new Error("tripInstanceId invalide.");

  console.info("[shipmentTransportService] assignShipmentToTripInstance", {
    companyId,
    shipmentId,
    tripInstanceId: tid,
    reassignedBy: options?.reassignedBy,
  });

  const ref = shipmentRef(db, companyId, shipmentId);
  /** Après transaction : ajustements parcelCount sur instances (hors tx Firestore). */
  let parcelDelta: { from: string | null; to: string | null } = { from: null, to: null };

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Envoi introuvable.");

    const data = snap.data() as Shipment;
    const prev = data.tripInstanceId != null ? String(data.tripInstanceId).trim() : "";

    if (prev === tid) {
      const ts = data.transportStatus;
      if (ts !== "ASSIGNED") {
        tx.update(ref, { transportStatus: "ASSIGNED" });
      }
      parcelDelta = { from: null, to: null };
      return;
    }

    if (!prev) {
      tx.update(ref, {
        tripInstanceId: tid,
        transportStatus: "ASSIGNED",
      });
      parcelDelta = { from: null, to: tid };
      return;
    }

    // Réaffectation : autorisée (correction terrain)
    tx.update(ref, {
      tripInstanceId: tid,
      transportStatus: "ASSIGNED",
      previousTripInstanceId: prev,
      reassignedAt: serverTimestamp(),
      ...(options?.reassignedBy != null && options.reassignedBy !== ""
        ? { reassignedBy: options.reassignedBy }
        : {}),
    });
    parcelDelta = { from: prev, to: tid };
  });

  if (parcelDelta.from && parcelDelta.to) {
    decrementParcelCount(companyId, parcelDelta.from, 1).catch(() => {});
    incrementParcelCount(companyId, parcelDelta.to, 1).catch(() => {});
    return;
  }
  if (parcelDelta.to) {
    incrementParcelCount(companyId, parcelDelta.to, 1).catch(() => {});
  }
}

/**
 * Colis en attente d’affectation à un départ (tripInstance), pour une agence d’origine.
 * Inclut : transportStatus absent, ou `PENDING_ASSIGNMENT` (y compris données legacy sans champ).
 * Exclut : colis déjà pourvus d’un `tripInstanceId` sans être dans cette file (legacy déjà rattachés).
 *
 * Implémentation : requête par `originAgencyId` puis filtre client (Firestore ne permet pas OR champ absent / valeur en une requête simple fiable).
 *
 * @param companyId — collection logistics shipments
 * @param agencyId — originAgencyId
 */
export async function getShipmentsPendingAssignment(
  companyId: string,
  agencyId: string
): Promise<Shipment[]> {
  const q = query(shipmentsRef(db, companyId), where("originAgencyId", "==", agencyId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment))
    .filter(isPendingTransportAssignment);
}

/**
 * Colis liés à une instance de trajet.
 */
export async function getShipmentsByTripInstance(
  companyId: string,
  tripInstanceId: string
): Promise<Shipment[]> {
  const tid = String(tripInstanceId).trim();
  if (!tid) return [];

  const q = query(shipmentsRef(db, companyId), where("tripInstanceId", "==", tid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ ...d.data(), shipmentId: d.id } as Shipment));
}
