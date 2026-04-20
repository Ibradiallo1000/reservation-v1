import type { NormalizedReservation } from "@/types/NormalizedReservation";

export type { NormalizedReservation } from "@/types/NormalizedReservation";

/**
 * ⚠️ LEGACY FIELDS (à supprimer progressivement)
 * Ne pas utiliser dans les nouveaux développements.
 *
 * Champs Firestore legacy lus par le normalizer :
 * - companyId / compagnieId
 * - companyName / compagnieNom
 * - agencyNom / nomAgence
 * - nomClient
 * - telephoneNormalized / telephone
 * - date / createdAt
 * - depart / departure
 * - arrivee / arrival
 * - heure / time
 * - statut / status
 * - canal / paymentChannel
 * - paymentStatus / payment.status
 * - paymentMethod / paiement
 * - montant
 * - preuveVia
 * - paymentReference / transactionReference / payment.parsed.transactionId
 *
 * Alias de sortie conservés uniquement pour compatibilité avec le code existant :
 * - companyId, companyName, agencyId, agencyName
 * - customerName, customerPhone
 * - trip.depart, trip.arrivee, trip.heure, trip.tripInstanceId
 * - reservation.reference, reservation.journeyStatus, reservation.boardingStatus, reservation.dropoffStatus
 * - payment.wallet, payment.reference, payment.ledgerStatus
 */
export type NormalizedReservationReadModel = Omit<NormalizedReservation, "reservation" | "payment" | "trip"> & {
  reservation: NormalizedReservation["reservation"] & {
    reference?: string;
    journeyStatus?: string;
    boardingStatus?: string;
    dropoffStatus?: string;
  };
  payment: NormalizedReservation["payment"] & {
    wallet?: string;
    reference?: string;
    ledgerStatus?: string;
  };
  trip: NormalizedReservation["trip"] & {
    depart?: string;
    arrivee?: string;
    heure?: string;
    tripInstanceId?: string;
  };
  companyId?: string;
  companyName?: string;
  agencyId?: string;
  agencyName?: string;
  customerName?: string;
  customerPhone?: string;
};

type ReservationSource = Record<string, unknown>;

type PaymentSource = {
  status?: unknown;
  parsed?: {
    transactionId?: unknown;
  };
};

const isRecord = (value: unknown): value is ReservationSource =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Retourne la premiere valeur reellement renseignee.
 * Les chaines vides sont ignorees pour eviter d'ecraser un fallback exploitable.
 */
function firstDefined<T>(...values: Array<T | null | undefined>): T | undefined {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    return value;
  }

  return undefined;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string") return undefined;

  const normalized = value.trim().replace(/\s/g, "");
  if (!normalized) return undefined;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asDate(value: unknown): Date | undefined {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (!isRecord(value)) return undefined;

  if (typeof value.toDate === "function") {
    const date = value.toDate();
    return date instanceof Date && Number.isFinite(date.getTime()) ? date : undefined;
  }

  if (typeof value.seconds === "number") {
    const date = new Date(value.seconds * 1000);
    return Number.isFinite(date.getTime()) ? date : undefined;
  }

  return undefined;
}

function asPaymentSource(value: unknown): PaymentSource | undefined {
  if (!isRecord(value)) return undefined;

  const parsed = isRecord(value.parsed) ? value.parsed : undefined;
  return {
    status: value.status,
    parsed: parsed
      ? {
          transactionId: parsed.transactionId,
        }
      : undefined,
  };
}

/**
 * Fallback lisible pour les anciens documents qui n'ont pas encore paymentStatus
 * ni payment.status. On ne modifie pas le statut reservation, on en deduit seulement
 * un statut paiement coherent pour la lecture.
 */
function paymentStatusFromReservationStatus(status: string | undefined): string | undefined {
  const normalized = status?.trim().toLowerCase();
  if (!normalized) return undefined;

  if (["paye", "pay\u00e9", "confirme", "confirm\u00e9", "valide", "valid\u00e9", "paid"].includes(normalized)) {
    return "paid";
  }

  if (["en_attente", "en_attente_paiement", "pending"].includes(normalized)) {
    return "pending";
  }

  if (["preuve_recue", "verification", "verif", "v\u00e9rif"].includes(normalized)) {
    return "pending_validation";
  }

  if (["annule", "annul\u00e9", "annulation_en_attente", "cancelled", "canceled"].includes(normalized)) {
    return "cancelled";
  }

  if (["refuse", "refus\u00e9", "rejected"].includes(normalized)) {
    return "rejected";
  }

  return status;
}

/**
 * Source unique de vérité pour les réservations.
 * Toujours utiliser les champs NormalizedReservation.* :
 * - reservation.status, reservation.channel, reservation.createdAt
 * - payment.amount, payment.status, payment.method
 * - trip.departure, trip.arrival, trip.date, trip.time
 * - customer.name, customer.phone
 *
 * Normalise la lecture d'une reservation Firestore issue du guichet ou du flux en ligne.
 * La fonction est volontairement pure : aucun acces Firestore, aucune mutation du document source.
 */
export function normalizeReservation(doc: any): NormalizedReservationReadModel {
  const source: ReservationSource = isRecord(doc) ? doc : {};
  const payment = asPaymentSource(source.payment);
  const createdAt = asDate(source.createdAt);

  const reservationStatus = firstDefined(asString(source.status), asString(source.statut)) ?? "unknown";
  const paymentStatus = firstDefined(
    asString(source.paymentStatus),
    asString(payment?.status),
    paymentStatusFromReservationStatus(reservationStatus)
  ) ?? "unknown";
  const amount = asNumber(source.montant) ?? 0;
  const channel = firstDefined(asString(source.canal), asString(source.paymentChannel)) ?? "unknown";
  const method = firstDefined(asString(source.paymentMethod), asString(source.paiement));
  const departure = firstDefined(asString(source.depart), asString(source.departure));
  const arrival = firstDefined(asString(source.arrivee), asString(source.arrival));
  const tripDate = asString(source.date);
  const time = firstDefined(asString(source.heure), asString(source.time));
  const customerName = asString(source.nomClient);
  const customerPhone = firstDefined(asString(source.telephoneNormalized), asString(source.telephone));

  return {
    companyId: firstDefined(asString(source.companyId), asString(source.compagnieId)),
    companyName: firstDefined(asString(source.companyName), asString(source.compagnieNom)),
    agencyId: asString(source.agencyId),
    agencyName: firstDefined(asString(source.agencyNom), asString(source.nomAgence)),
    customerName,
    customerPhone,
    customer: {
      name: customerName,
      phone: customerPhone,
    },
    trip: {
      departure,
      arrival,
      date: tripDate ?? undefined,
      time,
      depart: departure,
      arrivee: arrival,
      heure: time,
      tripInstanceId: asString(source.tripInstanceId),
    },
    reservation: {
      id: asString(source.id),
      status: reservationStatus,
      channel,
      createdAt,
      reference: asString(source.referenceCode),
      journeyStatus: asString(source.journeyStatus),
      boardingStatus: asString(source.boardingStatus),
      dropoffStatus: asString(source.dropoffStatus),
    },
    payment: {
      amount,
      status: paymentStatus,
      method,
      wallet: asString(source.preuveVia),
      reference: firstDefined(
        asString(source.paymentReference),
        asString(source.transactionReference),
        asString(payment?.parsed?.transactionId)
      ),
      ledgerStatus: asString(source.ledgerStatus),
    },
  };
}
