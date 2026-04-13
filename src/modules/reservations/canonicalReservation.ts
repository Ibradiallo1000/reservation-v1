import { canonicalStatut, normalizeChannel } from "@/utils/reservationStatusUtils";

export type CanonicalReservationChannel = "guichet" | "online" | "courrier" | "unknown";
export type CanonicalReservationStatus =
  | "booked"
  | "confirmed"
  | "cancelled"
  | "rejected"
  | "invalid"
  | "expired";
export type CanonicalPaymentStatus = "pending" | "paid" | "rejected" | "refunded";
export type CanonicalDigitalValidationStatus = "not_required" | "pending" | "validated" | "rejected";
export type CanonicalLedgerStatus = "pending" | "posted" | "failed";
export type CanonicalPaymentCategory = "cash" | "mobile_money" | "bank" | "card" | "other";
export type CanonicalPaymentSource =
  | "encaisse_guichet"
  | "online_payment"
  | "courrier_payment"
  | "unknown";
export type CanonicalWalletProvider =
  | "orange"
  | "moov"
  | "wave"
  | "sarali"
  | "other"
  | "unknown";
export type CanonicalJourneyStatus = "pending" | "booked" | "boarded" | "in_transit" | "dropped" | "cancelled";
export type CanonicalBoardingStatus = "pending" | "boarded" | "no_show" | "cancelled";
export type CanonicalDropoffStatus = "pending" | "dropped" | "cancelled";

export type LegacyReservationRecord = Record<string, unknown>;
export type LegacyPaymentRecord = Record<string, unknown> | null | undefined;

export interface CanonicalReservationDocument {
  id: string | null;
  company: {
    id: string | null;
    name: string | null;
    slug: string | null;
  };
  agency: {
    id: string | null;
    name: string | null;
    telephone: string | null;
  };
  customer: {
    name: string | null;
    phoneRaw: string | null;
    phoneNormalized: string | null;
  };
  trip: {
    depart: string | null;
    arrivee: string | null;
    date: string | null;
    heure: string | null;
    trajetId: string | null;
    tripInstanceId: string | null;
    tripType: string | null;
    originStopId: string | null;
    originStopOrder: number | null;
    destinationStopId: string | null;
    destinationStopOrder: number | null;
  };
  reservation: {
    referenceCode: string | null;
    channel: CanonicalReservationChannel;
    recordSource: string | null;
    status: CanonicalReservationStatus;
    createdAt: unknown;
    updatedAt: unknown;
    legacyStatut: string | null;
    legacyLifecycle: string | null;
  };
  seats: {
    go: number;
    return: number;
    held: number;
    total: number;
  };
  amounts: {
    total: number;
    currency: string;
  };
  payment: {
    category: CanonicalPaymentCategory;
    channel: CanonicalReservationChannel;
    source: CanonicalPaymentSource;
    status: CanonicalPaymentStatus;
    digitalValidationStatus: CanonicalDigitalValidationStatus;
    ledgerStatus: CanonicalLedgerStatus;
    reference: string | null;
    financialTransactionId: string | null;
    paidAt: unknown;
    countedInStats: boolean;
    walletProvider: CanonicalWalletProvider | null;
  };
  journey: {
    status: CanonicalJourneyStatus;
    boardingStatus: CanonicalBoardingStatus;
    dropoffStatus: CanonicalDropoffStatus;
  };
  counterSale: null | {
    cashierId: string | null;
    cashierCode: string | null;
    sessionId: string | null;
    paymentId: string | null;
    qrCode: string | null;
    cashSource: string | null;
  };
  onlinePayment: null | {
    walletProvider: CanonicalWalletProvider | null;
    proofMessage: string | null;
    proofSubmittedAt: unknown;
    proofReviewStatus: CanonicalDigitalValidationStatus;
    proofReviewedAt: unknown;
    proofReviewedBy: string | null;
    validationLevel: string | null;
    publicToken: string | null;
    publicUrl: string | null;
    parsedAmount: number | null;
    parsedTransactionId: string | null;
  };
  raw: {
    legacyStatus: string | null;
    legacyStatut: string | null;
    legacyPaymentStatus: string | null;
    legacyPaymentMethod: string | null;
    legacyWalletProvider: string | null;
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return null;
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const normalized = value.replace(",", ".").trim();
      if (!normalized) continue;
      const parsed = Number(normalized);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function hasValue(...values: unknown[]): boolean {
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === "string" && value.trim().length === 0) continue;
    return true;
  }
  return false;
}

function normalizeValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function normalizeWalletProvider(value: unknown): CanonicalWalletProvider | null {
  const raw = normalizeValue(value);
  if (!raw) return null;
  if (raw.includes("orange")) return "orange";
  if (raw.includes("moov")) return "moov";
  if (raw.includes("wave")) return "wave";
  if (raw.includes("sarali")) return "sarali";
  if (raw.includes("cash") || raw.includes("espece")) return null;
  return "other";
}

function normalizeLedgerStatus(...values: unknown[]): CanonicalLedgerStatus {
  for (const value of values) {
    const raw = normalizeValue(value);
    if (raw === "posted") return "posted";
    if (raw === "failed") return "failed";
    if (raw === "pending") return "pending";
  }
  return "pending";
}

function normalizeReservationChannel(record: LegacyReservationRecord, paymentRecord: LegacyPaymentRecord): CanonicalReservationChannel {
  const payment = asRecord(paymentRecord);
  const direct = normalizeChannel(
    readString(
      record.canal,
      record.channel,
      record.paymentChannel,
      payment.channel,
      payment.paymentChannel,
      record.paiementSource,
      record.paymentSource
    ) ?? ""
  );
  if (direct === "guichet") return "guichet";
  if (direct === "online") return "online";
  if (direct === "courrier") return "courrier";

  if (readString(record.guichetierId, record.agentId, record.sessionId, record.shiftId)) {
    return "guichet";
  }

  if (normalizeWalletProvider(record.preuveVia ?? payment.provider ?? record.paymentMethodLabel)) {
    return "online";
  }

  return "unknown";
}

function normalizePaymentCategory(record: LegacyReservationRecord, paymentRecord: LegacyPaymentRecord): CanonicalPaymentCategory {
  const payment = asRecord(paymentRecord);
  const raw = normalizeValue(
    readString(
      record.paymentCategory,
      payment.category,
      record.paymentMethod,
      payment.paymentMethod,
      record.paiement,
      record.paymentMethodLabel,
      payment.provider,
      record.preuveVia
    ) ?? ""
  );
  if (!raw) {
    return normalizeReservationChannel(record, paymentRecord) === "guichet" ? "cash" : "other";
  }
  if (
    raw === "cash" ||
    raw === "especes" ||
    raw === "espece" ||
    raw === "encaisse_guichet"
  ) {
    return "cash";
  }
  if (
    raw === "mobile_money" ||
    raw === "mobile" ||
    raw === "orange" ||
    raw === "moov" ||
    raw === "wave" ||
    raw === "sarali"
  ) {
    return "mobile_money";
  }
  if (raw === "bank" || raw === "banque" || raw === "virement" || raw === "transfer") {
    return "bank";
  }
  if (raw === "card" || raw === "carte") {
    return "card";
  }
  return "other";
}

function normalizePaymentSource(channel: CanonicalReservationChannel, record: LegacyReservationRecord): CanonicalPaymentSource {
  const raw = normalizeValue(readString(record.paymentSource, record.paiementSource) ?? "");
  if (raw === "encaisse_guichet") return "encaisse_guichet";
  if (raw === "online_payment") return "online_payment";
  if (raw === "courrier_payment") return "courrier_payment";
  if (channel === "guichet") return "encaisse_guichet";
  if (channel === "online") return "online_payment";
  if (channel === "courrier") return "courrier_payment";
  return "unknown";
}

function normalizeReservationStatusValue(
  record: LegacyReservationRecord,
  paymentRecord: LegacyPaymentRecord,
  channel: CanonicalReservationChannel
): CanonicalReservationStatus {
  const payment = asRecord(paymentRecord);
  const statut = canonicalStatut(readString(record.statut, record.reservationStatus) ?? "");
  const lifecycle = normalizeValue(readString(record.status, payment.status, record.paymentStatus) ?? "");

  if (statut === "annule" || statut === "annulation_en_attente") return "cancelled";
  if (statut === "refuse") return "rejected";
  if (statut === "invalide") return "invalid";
  if (statut === "expire") return "expired";
  if (statut === "confirme" || statut === "paye" || statut === "embarque" || statut === "rembourse") {
    return "confirmed";
  }

  if (lifecycle === "annule" || lifecycle === "cancelled") return "cancelled";
  if (lifecycle === "refuse" || lifecycle === "rejected") return "rejected";

  if (
    hasValue(record.ticketValidatedAt, payment.validatedAt) ||
    normalizeValue(payment.status) === "validated"
  ) {
    return "confirmed";
  }

  if (channel === "guichet" && normalizeValue(record.paymentStatus) === "paid") {
    return "confirmed";
  }

  return "booked";
}

function normalizeDigitalValidationStatus(
  record: LegacyReservationRecord,
  paymentRecord: LegacyPaymentRecord,
  channel: CanonicalReservationChannel
): CanonicalDigitalValidationStatus {
  if (channel !== "online") return "not_required";

  const payment = asRecord(paymentRecord);
  const legacyStatut = canonicalStatut(readString(record.statut) ?? "");
  const paymentStatus = normalizeValue(readString(payment.status, record.paymentStatus) ?? "");

  if (legacyStatut === "refuse" || paymentStatus === "rejected") return "rejected";
  if (
    legacyStatut === "confirme" ||
    legacyStatut === "paye" ||
    legacyStatut === "embarque" ||
    normalizeValue(payment.status) === "validated" ||
    hasValue(record.ticketValidatedAt, record.validatedAt, payment.validatedAt)
  ) {
    return "validated";
  }
  return "pending";
}

function normalizePaymentStatusValue(
  record: LegacyReservationRecord,
  paymentRecord: LegacyPaymentRecord,
  channel: CanonicalReservationChannel,
  digitalValidationStatus: CanonicalDigitalValidationStatus
): CanonicalPaymentStatus {
  const payment = asRecord(paymentRecord);
  const paymentStatus = normalizeValue(readString(payment.status, record.paymentStatus) ?? "");
  const legacyStatut = canonicalStatut(readString(record.statut) ?? "");
  const lifecycle = normalizeValue(readString(record.status) ?? "");

  if (paymentStatus === "refunded" || legacyStatut === "rembourse") return "refunded";
  if (paymentStatus === "rejected" || legacyStatut === "refuse") return "rejected";

  if (
    paymentStatus === "validated" ||
    normalizeLedgerStatus(payment.ledgerStatus, record.ledgerStatus, asRecord(record.payment).ledgerStatus) === "posted" ||
    hasValue(record.cashTransactionId, record.paymentId) ||
    hasValue(record.ticketValidatedAt, payment.validatedAt)
  ) {
    return "paid";
  }

  if (channel === "guichet" && (legacyStatut === "paye" || legacyStatut === "confirme")) {
    return "paid";
  }

  if (channel === "online" && digitalValidationStatus === "validated") {
    return "paid";
  }

  if (
    paymentStatus === "pending" ||
    paymentStatus === "auto_detected" ||
    paymentStatus === "declared_paid" ||
    lifecycle === "paye" ||
    legacyStatut === "preuve_recue" ||
    legacyStatut === "en_attente_paiement"
  ) {
    return "pending";
  }

  return "pending";
}

function normalizeJourneyStatus(record: LegacyReservationRecord): CanonicalJourneyStatus {
  const raw = normalizeValue(readString(record.journeyStatus, record.statutEmbarquement) ?? "");
  if (raw === "boarded" || raw === "embarque") return "boarded";
  if (raw === "in_transit") return "in_transit";
  if (raw === "dropped" || raw === "dropped_off") return "dropped";
  if (raw === "cancelled" || raw === "annule") return "cancelled";
  if (raw === "booked") return "booked";
  return "pending";
}

function normalizeBoardingStatus(record: LegacyReservationRecord): CanonicalBoardingStatus {
  const raw = normalizeValue(readString(record.boardingStatus, record.statutEmbarquement) ?? "");
  if (raw === "boarded" || raw === "embarque") return "boarded";
  if (raw === "no_show") return "no_show";
  if (raw === "cancelled" || raw === "annule") return "cancelled";
  return "pending";
}

function normalizeDropoffStatus(record: LegacyReservationRecord): CanonicalDropoffStatus {
  const raw = normalizeValue(readString(record.dropoffStatus, record.statutDescente) ?? "");
  if (raw === "dropped" || raw === "dropped_off") return "dropped";
  if (raw === "cancelled" || raw === "annule") return "cancelled";
  return "pending";
}

function normalizeCountedInStats(record: LegacyReservationRecord, paymentStatus: CanonicalPaymentStatus): boolean {
  const explicit = record.ticketRevenueCountedInDailyStats ?? asRecord(record.payment).countedInStats;
  if (typeof explicit === "boolean") return explicit;
  return paymentStatus === "paid";
}

export function normalizeReservationDocument(
  record: LegacyReservationRecord,
  options?: { id?: string | null; payment?: LegacyPaymentRecord | null }
): CanonicalReservationDocument {
  const paymentRecord = options?.payment ?? null;
  const payment = asRecord(paymentRecord);
  const embeddedPayment = asRecord(record.payment);
  const channel = normalizeReservationChannel(record, paymentRecord);
  const paymentCategory = normalizePaymentCategory(record, paymentRecord);
  const walletProvider =
    normalizeWalletProvider(
      readString(
        payment.provider,
        embeddedPayment.provider,
        record.walletProvider,
        record.preuveVia,
        record.paymentMethodLabel
      )
    ) ?? (paymentCategory === "mobile_money" ? "unknown" : null);
  const digitalValidationStatus = normalizeDigitalValidationStatus(record, paymentRecord, channel);
  const paymentStatus = normalizePaymentStatusValue(record, paymentRecord, channel, digitalValidationStatus);
  const ledgerStatus = normalizeLedgerStatus(payment.ledgerStatus, embeddedPayment.ledgerStatus, record.ledgerStatus);
  const amount = readNumber(
    record.montant,
    embeddedPayment.totalAmount,
    payment.amount,
    record.amount
  ) ?? 0;
  const seatsGo = Math.max(0, readNumber(record.seatsGo, record.seats) ?? 0);
  const seatsReturn = Math.max(0, readNumber(record.seatsReturn) ?? 0);
  const heldSeats = Math.max(0, readNumber(record.heldSeats, record.seatsHeld) ?? 0);
  const reservationStatus = normalizeReservationStatusValue(record, paymentRecord, channel);

  return {
    id: options?.id ?? readString(record.id) ?? null,
    company: {
      id: readString(record.companyId, record.compagnieId, payment.companyId),
      name: readString(record.companyName, record.compagnieNom, asRecord(record.company).name),
      slug: readString(record.companySlug, record.slug),
    },
    agency: {
      id: readString(record.agencyId, record.agenceId, payment.agencyId),
      name: readString(record.agencyName, record.agencyNom, record.nomAgence),
      telephone: readString(record.agencyTelephone, record.agenceTelephone),
    },
    customer: {
      name: readString(record.customerName, record.nomClient, record.clientName, record.fullName),
      phoneRaw: readString(record.customerPhoneRaw, record.telephoneOriginal, record.telephone, record.phone),
      phoneNormalized: readString(
        record.customerPhoneNormalized,
        record.telephoneNormalized,
        record.phoneNormalized
      ),
    },
    trip: {
      depart: readString(record.depart, record.departure),
      arrivee: readString(record.arrivee, record.arrival),
      date: readString(record.date),
      heure: readString(record.heure, record.time),
      trajetId: readString(record.trajetId, record.tripId, record.routeId),
      tripInstanceId: readString(record.tripInstanceId),
      tripType: readString(record.tripType),
      originStopId: readString(record.originStopId),
      originStopOrder: readNumber(record.originStopOrder),
      destinationStopId: readString(record.destinationStopId),
      destinationStopOrder: readNumber(record.destinationStopOrder),
    },
    reservation: {
      referenceCode: readString(record.referenceCode),
      channel,
      recordSource: readString(record.recordSource, record.captureMode, record.creationMode),
      status: reservationStatus,
      createdAt: record.createdAt ?? null,
      updatedAt: record.updatedAt ?? null,
      legacyStatut: readString(record.statut),
      legacyLifecycle: readString(record.status),
    },
    seats: {
      go: seatsGo,
      return: seatsReturn,
      held: heldSeats,
      total: Math.max(0, seatsGo + seatsReturn),
    },
    amounts: {
      total: amount,
      currency: readString(payment.currency, record.currency, record.devise) ?? "XOF",
    },
    payment: {
      category: paymentCategory,
      channel,
      source: normalizePaymentSource(channel, record),
      status: paymentStatus,
      digitalValidationStatus,
      ledgerStatus,
      reference: readString(
        payment.reference,
        record.paymentReference,
        record.transactionReference,
        embeddedPayment.transactionId
      ),
      financialTransactionId: readString(
        record.financialTransactionId,
        record.ledgerTransactionId,
        record.cashTransactionId
      ),
      paidAt: payment.validatedAt ?? record.ticketValidatedAt ?? record.validatedAt ?? null,
      countedInStats: normalizeCountedInStats(record, paymentStatus),
      walletProvider,
    },
    journey: {
      status: normalizeJourneyStatus(record),
      boardingStatus: normalizeBoardingStatus(record),
      dropoffStatus: normalizeDropoffStatus(record),
    },
    counterSale:
      channel === "guichet"
        ? {
            cashierId: readString(record.cashierId, record.guichetierId, record.agentId),
            cashierCode: readString(record.cashierCode, record.guichetierCode),
            sessionId: readString(record.sessionId, record.shiftId, record.createdInSessionId),
            paymentId: readString(record.paymentId),
            qrCode: readString(record.qrCode),
            cashSource: readString(record.paiementSource, record.paymentSource) ?? "encaisse_guichet",
          }
        : null,
    onlinePayment:
      channel === "online"
        ? {
            walletProvider,
            proofMessage: readString(record.proofMessage, record.preuveMessage, embeddedPayment.smsText),
            proofSubmittedAt: record.proofSubmittedAt ?? null,
            proofReviewStatus: digitalValidationStatus,
            proofReviewedAt: payment.validatedAt ?? record.validatedAt ?? null,
            proofReviewedBy: readString(payment.validatedBy, record.validatedBy, record.proofReviewedBy),
            validationLevel: readString(embeddedPayment.validationLevel),
            publicToken: readString(record.publicToken),
            publicUrl: readString(record.publicUrl),
            parsedAmount: readNumber(asRecord(embeddedPayment.parsed).amount),
            parsedTransactionId: readString(asRecord(embeddedPayment.parsed).transactionId),
          }
        : null,
    raw: {
      legacyStatus: readString(record.status),
      legacyStatut: readString(record.statut),
      legacyPaymentStatus: readString(record.paymentStatus, payment.status, embeddedPayment.status),
      legacyPaymentMethod: readString(record.paymentMethod, record.paiement),
      legacyWalletProvider: readString(record.preuveVia, payment.provider, embeddedPayment.provider),
    },
  };
}

export function isCanonicalCommercialSale(document: CanonicalReservationDocument): boolean {
  return (
    document.reservation.status === "confirmed" &&
    document.payment.status === "paid" &&
    document.reservation.channel !== "courrier"
  );
}

export function isCanonicalPhysicalCashSale(document: CanonicalReservationDocument): boolean {
  return (
    isCanonicalCommercialSale(document) &&
    document.reservation.channel === "guichet" &&
    document.payment.category === "cash"
  );
}

export function isCanonicalDigitalSale(document: CanonicalReservationDocument): boolean {
  return (
    isCanonicalCommercialSale(document) &&
    document.payment.category === "mobile_money"
  );
}

export function isCanonicalPendingOnlineReview(document: CanonicalReservationDocument): boolean {
  return (
    document.reservation.channel === "online" &&
    document.payment.status === "pending" &&
    document.payment.digitalValidationStatus === "pending"
  );
}
