import { describe, expect, it } from "vitest";
import {
  isCanonicalCommercialSale,
  isCanonicalPendingOnlineReview,
  isCanonicalPhysicalCashSale,
  normalizeReservationDocument,
} from "@/modules/reservations/canonicalReservation";

describe("canonicalReservation", () => {
  it("maps online proof submission to pending digital review", () => {
    const reservation = normalizeReservationDocument(
      {
        companyId: "comp-1",
        compagnieNom: "Teliya",
        agencyId: "ag-1",
        agencyNom: "Bamako",
        nomAgence: "Bamako Legacy",
        nomClient: "Awa Traore",
        telephone: "70000000",
        telephoneNormalized: "22370000000",
        depart: "Bamako",
        arrivee: "Gao",
        date: "2026-04-14",
        heure: "05:00",
        tripInstanceId: "trip-1",
        montant: 25000,
        referenceCode: "REF-ONLINE-1",
        canal: "en_ligne",
        status: "payé",
        statut: "en_attente",
        paymentMethod: "mobile_money",
        preuveVia: "Sarali",
        paymentReference: "MP260310.1927.D82171",
        transactionReference: "MP260310.1927.D82171",
        preuveMessage: "Paiement 25000 FCFA ID: MP260310.1927.D82171",
        proofSubmittedAt: { seconds: 1710000000 },
        payment: {
          status: "auto_detected",
          validationLevel: "suspicious",
          totalAmount: 25000,
          parsed: {
            amount: 25000,
            transactionId: "MP260310.1927.D82171",
          },
          ledgerStatus: "pending",
        },
      },
      { id: "res-online-1" }
    );

    expect(reservation.reservation.channel).toBe("online");
    expect(reservation.reservation.status).toBe("booked");
    expect(reservation.payment.status).toBe("pending");
    expect(reservation.payment.digitalValidationStatus).toBe("pending");
    expect(reservation.payment.walletProvider).toBe("sarali");
    expect(reservation.payment.reference).toBe("MP260310.1927.D82171");
    expect(reservation.onlinePayment?.proofReviewStatus).toBe("pending");
    expect(isCanonicalPendingOnlineReview(reservation)).toBe(true);
    expect(isCanonicalCommercialSale(reservation)).toBe(false);
  });

  it("maps validated online reservation to confirmed paid sale", () => {
    const reservation = normalizeReservationDocument(
      {
        companyId: "comp-1",
        agencyId: "ag-1",
        agencyNom: "Bamako",
        nomClient: "Mariam Diallo",
        depart: "Bamako",
        arrivee: "Gao",
        date: "2026-04-14",
        heure: "05:00",
        montant: 25000,
        referenceCode: "REF-ONLINE-2",
        canal: "en_ligne",
        status: "payé",
        statut: "confirme",
        ticketValidatedAt: { seconds: 1710000100 },
        paymentStatus: "paid",
        preuveVia: "Wave",
        ledgerStatus: "posted",
        payment: {
          status: "validated",
          provider: "wave",
          ledgerStatus: "posted",
          validatedAt: { seconds: 1710000100 },
          parsed: {
            amount: 25000,
            transactionId: "WV123",
          },
        },
      },
      { id: "res-online-2" }
    );

    expect(reservation.reservation.status).toBe("confirmed");
    expect(reservation.payment.status).toBe("paid");
    expect(reservation.payment.digitalValidationStatus).toBe("validated");
    expect(reservation.payment.ledgerStatus).toBe("posted");
    expect(isCanonicalCommercialSale(reservation)).toBe(true);
    expect(isCanonicalPendingOnlineReview(reservation)).toBe(false);
    expect(isCanonicalPhysicalCashSale(reservation)).toBe(false);
  });

  it("keeps guichet cash channel distinct from record source", () => {
    const reservation = normalizeReservationDocument(
      {
        companyId: "comp-1",
        compagnieId: "legacy-comp-1",
        companyName: "Teliya",
        agencyId: "ag-1",
        agencyNom: "Segou",
        nomClient: "Moussa",
        telephoneOriginal: "76 00 00 00",
        telephoneNormalized: "22376000000",
        depart: "Segou",
        arrivee: "Bamako",
        date: "2026-04-16",
        heure: "09:00",
        montant: 18000,
        referenceCode: "REF-GUI-1",
        canal: "guichet",
        paymentChannel: "guichet",
        creationMode: "online",
        statut: "paye",
        paymentStatus: "paid",
        paymentMethod: "cash",
        paiementSource: "encaisse_guichet",
        guichetierId: "user-1",
        guichetierCode: "G01",
        sessionId: "shift-1",
        paymentId: "pay-1",
        cashTransactionId: "ftx-1",
      },
      { id: "res-guichet-1" }
    );

    expect(reservation.reservation.channel).toBe("guichet");
    expect(reservation.reservation.recordSource).toBe("online");
    expect(reservation.payment.category).toBe("cash");
    expect(reservation.payment.status).toBe("paid");
    expect(reservation.payment.financialTransactionId).toBe("ftx-1");
    expect(reservation.counterSale?.cashierCode).toBe("G01");
    expect(isCanonicalPhysicalCashSale(reservation)).toBe(true);
  });
});
