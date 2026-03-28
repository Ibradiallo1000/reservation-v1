/**
 * Remboursements alignés ledger : nouvelle écriture type refund (montant négatif en base),
 * sans modifier ni supprimer la transaction d’origine. referenceType financial_transaction + referenceId = id d’origine.
 */

import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { cancelReservation } from "@/modules/agence/services/reservations";
import { recordShipmentEvent } from "@/modules/logistics/services/recordShipmentEvent";
import { getPaymentById, getPaymentByReservationId } from "@/services/paymentService";
import {
  createFinancialTransaction,
  getFinancialTransactionById,
  isConfirmedTransactionStatus,
  listRefundsForOriginalLedgerTransaction,
} from "./financialTransactions";
import type { FinancialPaymentMethod, FinancialTransactionDoc } from "./types";

export type LedgerRefundChannel = "cash" | "mobile_money";

export type RefundPaymentParams = {
  companyId: string;
  agencyId: string;
  /** Id document companies/{companyId}/financialTransactions/{id} (encaissement d’origine). */
  originalTransactionId: string;
  /** Canal de sortie des fonds (doit correspondre à l’instrument d’origine). */
  channel: LedgerRefundChannel;
  reason: string;
  performedBy: { uid: string; name?: string | null; role?: string };
};

export type RefundPaymentResult = {
  refundTransactionId: string;
  /** True si l’écriture existait déjà (rejoue uniquement les effets métier best-effort). */
  idempotentReplay?: boolean;
};

function normalizeTxType(t: string | undefined): string {
  if (t === "transfer_to_bank") return "transfer";
  return String(t ?? "");
}

function requiredRefundChannel(original: FinancialTransactionDoc): LedgerRefundChannel {
  const pm = String(original.paymentMethod ?? "").toLowerCase().trim();
  if (pm === "cash") return "cash";
  return "mobile_money";
}

function channelToLedgerSourceAndKpi(channel: LedgerRefundChannel): {
  source: string;
  paymentChannel: string;
  paymentMethod: FinancialPaymentMethod;
} {
  if (channel === "cash") {
    return { source: "cash", paymentChannel: "guichet", paymentMethod: "cash" };
  }
  return { source: "mobile_money", paymentChannel: "online", paymentMethod: "mobile_money" };
}

async function applySideEffectsAfterLedgerRefund(params: {
  companyId: string;
  agencyId: string;
  original: FinancialTransactionDoc;
  performedByUid: string;
  reason: string;
}): Promise<void> {
  const { companyId, agencyId, original, performedByUid, reason } = params;

  let pay = null as Awaited<ReturnType<typeof getPaymentById>>;
  if (original.referenceType === "payment") {
    pay = await getPaymentById(companyId, original.referenceId);
  }
  if (!pay && original.reservationId) {
    pay = await getPaymentByReservationId(companyId, original.reservationId);
  }
  if (pay && pay.status === "validated") {
    const pref = doc(db, "companies", companyId, "payments", pay.id);
    await updateDoc(pref, {
      status: "refunded",
      refundedAt: serverTimestamp(),
      refundedBy: performedByUid,
      updatedAt: serverTimestamp(),
      rejectionReason: reason || null,
    });
  }

  const rid = original.reservationId?.trim();
  if (!rid) return;

  const shipRef = doc(db, "companies", companyId, "shipments", rid);
  const shipSnap = await getDoc(shipRef);
  if (shipSnap.exists()) {
    try {
      await recordShipmentEvent({
        companyId,
        shipmentId: rid,
        eventType: "CANCELLED",
        agencyId,
        performedBy: performedByUid,
      });
    } catch (e) {
      console.warn("[ledgerRefund] recordShipmentEvent CANCELLED:", e);
    }
    return;
  }

  try {
    await cancelReservation(companyId, agencyId, rid, {
      reason: reason || "Remboursement ledger",
      requestedByUid: performedByUid,
      requestedByName: null,
      requestedByRole: "ledger_refund",
    });
  } catch (e) {
    console.warn("[ledgerRefund] cancelReservation:", e);
  }
}

/**
 * Rembourse un encaissement ledger : montant lu sur la transaction d’origine (aucun montant client).
 * Crée une financialTransaction refund (montant stocké négatif), idempotente par clé ledger.
 */
export async function refundPayment(params: RefundPaymentParams): Promise<RefundPaymentResult> {
  const reason = String(params.reason ?? "").trim();
  if (!reason) {
    throw new Error("La raison du remboursement est obligatoire.");
  }
  if (!params.performedBy?.uid) {
    throw new Error("Utilisateur (performedBy.uid) requis.");
  }

  const loaded = await getFinancialTransactionById(params.companyId, params.originalTransactionId);
  if (!loaded) {
    throw new Error("Transaction d’origine introuvable.");
  }
  const { data: original } = loaded;

  if (String(original.companyId) !== params.companyId) {
    throw new Error("Transaction d’origine : companyId incohérent.");
  }
  if (String(original.agencyId ?? "") !== String(params.agencyId)) {
    throw new Error("Transaction d’origine : agence incohérente.");
  }
  if (normalizeTxType(original.type) !== "payment_received") {
    throw new Error("Seuls les encaissements (payment_received) peuvent être remboursés via ce flux.");
  }
  if (!isConfirmedTransactionStatus(original.status)) {
    throw new Error("La transaction d’origine n’est pas confirmée ; remboursement refusé.");
  }

  const gross = Math.abs(Number(original.amount) || 0);
  if (gross <= 0) {
    throw new Error("Montant d’origine invalide.");
  }

  const requiredChannel = requiredRefundChannel(original);
  if (params.channel !== requiredChannel) {
    throw new Error(
      requiredChannel === "cash"
        ? "Ce paiement a été encaissé en espèces : le remboursement doit être en espèces (caisse agence)."
        : "Ce paiement a été encaissé hors espèces : le remboursement doit être en mobile money (compte MM agence)."
    );
  }

  const existing = await listRefundsForOriginalLedgerTransaction(
    params.companyId,
    params.originalTransactionId
  );
  if (existing.length > 0) {
    const magExisting = Math.abs(Number(existing[0].amount) || 0);
    if (Math.abs(magExisting - gross) > 0.01) {
      throw new Error("Un remboursement existe déjà avec un montant incohérent ; intervention manuelle requise.");
    }
    await applySideEffectsAfterLedgerRefund({
      companyId: params.companyId,
      agencyId: params.agencyId,
      original,
      performedByUid: params.performedBy.uid,
      reason,
    });
    return { refundTransactionId: existing[0].id, idempotentReplay: true };
  }

  const { source, paymentChannel, paymentMethod } = channelToLedgerSourceAndKpi(params.channel);

  const refundTransactionId = await createFinancialTransaction({
    companyId: params.companyId,
    type: "refund",
    source,
    paymentChannel,
    paymentMethod,
    paymentProvider: original.paymentProvider ?? null,
    amount: gross,
    currency: original.currency ?? "XOF",
    agencyId: params.agencyId,
    reservationId: original.reservationId ?? null,
    referenceType: "financial_transaction",
    referenceId: params.originalTransactionId,
    metadata: {
      reason,
      originalLedgerTransactionId: params.originalTransactionId,
      refundedBy: params.performedBy.uid,
      refundedByName: params.performedBy.name ?? null,
      refundChannel: params.channel,
    },
  });

  await applySideEffectsAfterLedgerRefund({
    companyId: params.companyId,
    agencyId: params.agencyId,
    original,
    performedByUid: params.performedBy.uid,
    reason,
  });

  return { refundTransactionId };
}

export { getFinancialTransactionById, listRefundsForOriginalLedgerTransaction };
