/**
 * Libellés « client » (hors statuts internes) + phrases timeline lisibles.
 */

import type { ShipmentEvent } from "../domain/logisticsEvents.types";
import type { ShipmentStatus } from "../domain/shipment.types";

export function mapShipmentToClientStatusLabel(status: string): string {
  const s = status as ShipmentStatus;
  switch (s) {
    case "DELIVERED":
    case "CLOSED":
      return "Retiré";
    case "READY_FOR_PICKUP":
      return "En attente de retrait";
    case "ARRIVED":
      return "Arrivé";
    case "IN_TRANSIT":
      return "En transit";
    case "CANCELLED":
      return "Annulé";
    case "LOST":
      return "Colis signalé perdu";
    case "CLAIM_PENDING":
    case "CLAIM_PAID":
      return "Litige / indemnisation";
    case "RETURNED":
      return "Retour expéditeur";
    default:
      return "En cours";
  }
}

export function friendlyTimelineLine(
  event: ShipmentEvent,
  agencyLabel: string,
  atLabel: string
): { text: string; sub: string; done: boolean } {
  const t = event.eventType;
  let text: string;
  switch (t) {
    case "CREATED":
      text = `Colis enregistré (${agencyLabel})`;
      break;
    case "DEPARTED":
      text = `En transit — départ ${agencyLabel}`;
      break;
    case "ARRIVED":
      text = `Arrivé à ${agencyLabel}`;
      break;
    case "READY_FOR_PICKUP":
      text = `Prêt pour retrait — ${agencyLabel}`;
      break;
    case "DELIVERED":
      text = `Colis retiré — ${agencyLabel}`;
      break;
    case "CANCELLED":
      text = `Envoi annulé — ${agencyLabel}`;
      break;
    case "ASSIGNED_TO_BATCH":
      text = `Assigné à un lot — ${agencyLabel}`;
      break;
    case "LOST":
      text = `Colis signalé perdu — ${agencyLabel}`;
      break;
    case "CLAIM_PAID":
      text = `Indemnisation enregistrée — ${agencyLabel}`;
      break;
    default:
      text = `${t} — ${agencyLabel}`;
  }
  return { text, sub: atLabel, done: true };
}

/** 4 derniers chiffres du téléphone destinataire (déverrouillage suivi v2). */
export function receiverLast4Digits(phone: string | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}
