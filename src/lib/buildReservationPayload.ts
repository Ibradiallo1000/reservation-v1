export type ReservationWriteChannel = "guichet" | "en_ligne";

export interface BuildReservationPayloadInput {
  companyId: string;
  companyName: string;
  companySlug: string;

  agencyId: string;
  agencyName: string;

  customerName: string;
  customerPhone: string;

  departure: string;
  arrival: string;
  date: string;
  time: string;

  amount: number;
  channel: ReservationWriteChannel;

  paymentMethod: string;
  walletProvider?: string;
}

export interface ReservationPayload {
  // Existing flat fields kept for backward compatibility.
  companyId: string;
  compagnieId: string;
  companyName: string;
  compagnieNom: string;
  companySlug: string;

  agencyId: string;
  agencyName: string;
  agencyNom: string;
  nomAgence: string;

  nomClient: string;
  clientNom: string;
  telephone: string;
  telephoneNormalized: string;

  depart: string;
  departure: string;
  arrivee: string;
  arrival: string;
  date: string;
  heure: string;
  time: string;

  montant: number;
  statut: "paye";
  status: "pay\u00e9";
  canal: ReservationWriteChannel;
  paymentChannel: ReservationWriteChannel;
  paymentStatus: "paid";
  paymentMethod: string;
  paiement: string;
  preuveVia: string | null;

  // Canonical read model written in parallel with legacy fields.
  company: {
    id: string;
    name: string;
    slug: string;
  };
  agency: {
    id: string;
    name: string;
  };
  customer: {
    name: string;
    phone: string;
  };
  trip: {
    departure: string;
    arrival: string;
    date: string;
    time: string;
  };
  payment: {
    amount: number;
    status: "paid";
    method: string;
    wallet: string | null;
  };
  reservation: {
    channel: ReservationWriteChannel;
    status: "confirmed";
  };
}

const cleanString = (value: string): string => value.trim();

const cleanAmount = (value: number): number => (Number.isFinite(value) ? value : 0);

/**
 * Builds a Firestore reservation payload that remains compatible with existing
 * legacy readers while writing the canonical reservation shape in parallel.
 *
 * Pure function: no Firestore call, no timestamp generation, no mutation.
 */
export function buildReservationPayload(input: BuildReservationPayloadInput): ReservationPayload {
  const companyId = cleanString(input.companyId);
  const companyName = cleanString(input.companyName);
  const companySlug = cleanString(input.companySlug);
  const agencyId = cleanString(input.agencyId);
  const agencyName = cleanString(input.agencyName);
  const customerName = cleanString(input.customerName);
  const customerPhone = cleanString(input.customerPhone);
  const departure = cleanString(input.departure);
  const arrival = cleanString(input.arrival);
  const date = cleanString(input.date);
  const time = cleanString(input.time);
  const amount = cleanAmount(input.amount);
  const paymentMethod = cleanString(input.paymentMethod);
  const wallet = input.walletProvider ? cleanString(input.walletProvider) || null : null;

  return {
    // Legacy company fields.
    companyId,
    compagnieId: companyId,
    companyName,
    compagnieNom: companyName,
    companySlug,

    // Legacy agency fields.
    agencyId,
    agencyName,
    agencyNom: agencyName,
    nomAgence: agencyName,

    // Legacy customer fields.
    nomClient: customerName,
    clientNom: customerName,
    telephone: customerPhone,
    telephoneNormalized: customerPhone,

    // Legacy trip fields.
    depart: departure,
    departure,
    arrivee: arrival,
    arrival,
    date,
    heure: time,
    time,

    // Legacy payment/reservation fields.
    montant: amount,
    statut: "paye",
    status: "pay\u00e9",
    canal: input.channel,
    paymentChannel: input.channel,
    paymentStatus: "paid",
    paymentMethod,
    paiement: paymentMethod,
    preuveVia: wallet,

    // Canonical fields for new code.
    company: {
      id: companyId,
      name: companyName,
      slug: companySlug,
    },
    agency: {
      id: agencyId,
      name: agencyName,
    },
    customer: {
      name: customerName,
      phone: customerPhone,
    },
    trip: {
      departure,
      arrival,
      date,
      time,
    },
    payment: {
      amount,
      status: "paid",
      method: paymentMethod,
      wallet,
    },
    reservation: {
      channel: input.channel,
      status: "confirmed",
    },
  };
}
