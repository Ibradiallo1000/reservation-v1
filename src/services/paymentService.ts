/**
 * Service Payment - entite unifiee guichet + online + courrier.
 * Collection: companies/{companyId}/payments/{paymentId}
 * 🔥 VERSION CORRIGÉE - AVEC RETRY LOGIC POUR ÉVITER LES 429
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  increment,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type {
  Payment,
  CreatePaymentData,
  PaymentProvider,
  PaymentStatus,
  PaymentLedgerStatus,
} from "@/types/payment";
import { createFinancialTransaction } from "@/modules/compagnie/treasury/financialTransactions";
import type { FinancialPaymentMethod } from "@/modules/compagnie/treasury/types";
import { upsertMobileMoneyValidationDocument } from "@/modules/finance/documents/financialDocumentsService";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ⭐ FONCTION DE RETRY POUR LES ERREURS 429
async function withRetryOnQuota<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  context = "operation"
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const isQuotaError = 
        error?.message?.includes('Quota exceeded') || 
        error?.message?.includes('Too Many Requests') ||
        error?.code === 'resource-exhausted';
      
      if (isQuotaError && i < maxRetries - 1) {
        const waitMs = Math.pow(2, i) * 1000; // 1s, 2s, 4s
        console.warn(`[paymentService] ${context} - 429 Quota exceeded, retry ${i + 1}/${maxRetries} after ${waitMs}ms`);
        await delay(waitMs);
        continue;
      }
      throw error;
    }
  }
  throw new Error(`Max retries exceeded for ${context}`);
}

function explicitPaymentMethodFromPayment(p: {
  channel: string;
  provider?: string;
}): FinancialPaymentMethod {
  const prov = String(p.provider ?? "").toLowerCase();
  if (prov === "cash") return "cash";
  if (
    prov === "wave" ||
    prov === "orange" ||
    prov === "moov" ||
    prov === "sarali"
  ) {
    return "mobile_money";
  }
  const ch = String(p.channel ?? "");
  if (ch === "guichet") return prov === "cash" ? "cash" : "mobile_money";
  if (ch === "online") return "mobile_money";
  return "card";
}

const PAYMENTS_COLLECTION = "payments";
const PAYMENT_LOGS_COLLECTION = "paymentLogs";

const LEDGER_POSTING_ALLOWED_ROLES = new Set<string>([
  "operator_digital",
  "company_accountant",
  "financial_director",
  "chefagence",
  "admin_compagnie",
  "admin_platforme",
]);

function paymentsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${PAYMENTS_COLLECTION}`);
}

function paymentRef(companyId: string, paymentId: string) {
  return doc(db, `companies/${companyId}/${PAYMENTS_COLLECTION}/${paymentId}`);
}

type PaymentAction = "confirm" | "reject" | "refund";

function normalizeRoleTokens(role: string | string[] | null | undefined): string[] {
  if (Array.isArray(role)) {
    return role
      .map((r) => String(r ?? "").trim().toLowerCase())
      .filter(Boolean);
  }
  return String(role ?? "")
    .split(",")
    .map((r) => r.trim().toLowerCase())
    .filter(Boolean);
}

function assertCanConfirmPaymentLedger(params: {
  paymentChannel: Payment["channel"];
  actorRole?: string | string[] | null;
}): void {
  if (params.paymentChannel !== "online") return;

  const roles = normalizeRoleTokens(params.actorRole);
  if (roles.length === 0) {
    throw new Error("Confirmation de paiement en ligne refusee: role utilisateur manquant.");
  }

  const allowed = roles.some((r) => LEDGER_POSTING_ALLOWED_ROLES.has(r));
  if (!allowed) {
    throw new Error("Role non autorise pour confirmer un paiement en ligne.");
  }
}

function normalizeLedgerStatus(
  value: unknown,
  status: unknown
): PaymentLedgerStatus {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "pending" || raw === "posted" || raw === "failed") {
    return raw;
  }

  const paymentStatus = String(status ?? "").toLowerCase();
  if (paymentStatus === "validated") return "pending";
  return "pending";
}

function mapPaymentDoc(id: string, data: Record<string, unknown>): Payment {
  return {
    id,
    reservationId: String(data.reservationId),
    companyId: String(data.companyId),
    agencyId: String(data.agencyId),
    amount: Number(data.amount),
    currency: String(data.currency ?? "XOF"),
    channel: data.channel as Payment["channel"],
    provider: data.provider as Payment["provider"],
    status: data.status as Payment["status"],
    ledgerStatus: normalizeLedgerStatus(data.ledgerStatus, data.status),
    ledgerPostedAt: data.ledgerPostedAt,
    ledgerLastAttemptAt: data.ledgerLastAttemptAt,
    ledgerError:
      data.ledgerError == null
        ? null
        : typeof data.ledgerError === "string"
          ? data.ledgerError
          : String(data.ledgerError),
    ledgerRetryCount: Number(data.ledgerRetryCount ?? 0) || 0,
    createdAt: data.createdAt,
    validatedAt: data.validatedAt,
    validatedBy: data.validatedBy as string | undefined,
    rejectionReason: (data.rejectionReason ?? undefined) as string | undefined,
  } as Payment;
}

function toLedgerErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 500);
  return String(err ?? "ledger_write_failed").slice(0, 500);
}

function buildLedgerPaymentPayload(payment: Payment, paymentId: string, performedAt: Timestamp) {
  return {
    companyId: payment.companyId,
    type: "payment_received" as const,
    source: payment.channel,
    paymentChannel: payment.channel,
    paymentMethod: explicitPaymentMethodFromPayment({
      channel: payment.channel,
      provider: payment.provider,
    }),
    paymentProvider: payment.provider,
    amount: payment.amount,
    currency: payment.currency,
    agencyId: payment.agencyId,
    reservationId: payment.reservationId,
    performedAt,
    referenceType: "payment" as const,
    referenceId: paymentId,
    metadata: { provider: payment.provider },
  };
}

async function getPaymentByCanonicalDocumentId(
  companyId: string,
  paymentDocumentId: string
): Promise<Payment | null> {
  const ref = paymentRef(companyId, paymentDocumentId);
  const snap = await withRetryOnQuota(() => getDoc(ref), 2, "getPaymentByCanonicalDocumentId");
  if (!snap.exists()) return null;
  return mapPaymentDoc(snap.id, snap.data() as Record<string, unknown>);
}

export async function logPaymentAction(params: {
  companyId: string;
  paymentId: string;
  action: PaymentAction;
  userId: string;
}): Promise<void> {
  await withRetryOnQuota(() => addDoc(collection(db, `companies/${params.companyId}/${PAYMENT_LOGS_COLLECTION}`), {
    paymentId: params.paymentId,
    action: params.action,
    userId: params.userId,
    timestamp: serverTimestamp(),
  }), 2, "logPaymentAction");
}

/**
 * Create a payment. Used at guichet reservation creation (validated) or online (pending).
 */
export async function createPayment(data: CreatePaymentData): Promise<string> {
  const ref = paymentsRef(data.companyId);
  const status = data.status ?? "pending";
  const validatedNow = status === "validated" ? serverTimestamp() : null;
  const validatedBy = status === "validated" ? (data.validatedBy ?? "system") : null;

  const payload = {
    reservationId: data.reservationId,
    companyId: data.companyId,
    agencyId: data.agencyId,
    amount: Number(data.amount),
    currency: data.currency ?? "XOF",
    channel: data.channel,
    provider: data.provider,
    status,
    ledgerStatus: "pending" as PaymentLedgerStatus,
    ledgerPostedAt: null,
    ledgerLastAttemptAt: null,
    ledgerError: null,
    ledgerRetryCount: 0,
    createdAt: serverTimestamp(),
    validatedAt: validatedNow,
    validatedBy,
    rejectionReason: null,
  };

  if (data.paymentDocumentId) {
    const pref = doc(ref, data.paymentDocumentId);
    await withRetryOnQuota(() => setDoc(pref, payload), 2, "createPayment setDoc");
    const pid = data.paymentDocumentId;

    if (status === "validated") {
      await logPaymentAction({
        companyId: data.companyId,
        paymentId: pid,
        action: "confirm",
        userId: data.validatedBy ?? "system",
      });
    }

    return pid;
  }

  const docRef = await withRetryOnQuota(() => addDoc(ref, payload), 2, "createPayment addDoc");

  if (status === "validated") {
    await logPaymentAction({
      companyId: data.companyId,
      paymentId: docRef.id,
      action: "confirm",
      userId: data.validatedBy ?? "system",
    });
  }

  return docRef.id;
}

export async function markPaymentLedgerStatus(params: {
  companyId: string;
  paymentId: string;
  ledgerStatus: PaymentLedgerStatus;
  errorMessage?: string | null;
}): Promise<void> {
  const ref = paymentRef(params.companyId, params.paymentId);
  const now = Timestamp.now();

  const patch: Record<string, unknown> = {
    ledgerStatus: params.ledgerStatus,
    ledgerLastAttemptAt: now,
    updatedAt: serverTimestamp(),
  };

  if (params.ledgerStatus === "posted") {
    patch.ledgerPostedAt = now;
    patch.ledgerError = null;
  } else if (params.ledgerStatus === "failed") {
    patch.ledgerError = String(params.errorMessage ?? "ledger_write_failed").slice(0, 500);
    patch.ledgerRetryCount = increment(1);
  } else {
    patch.ledgerError = null;
  }

  await withRetryOnQuota(() => updateDoc(ref, patch), 2, "markPaymentLedgerStatus");
}

/**
 * Validate a payment (pending -> validated) and optionally post ledger write.
 * 🔥 Version avec retry logic pour éviter les 429
 */
export async function confirmPayment(
  companyId: string,
  paymentId: string,
  userId: string,
  options?: { actorRole?: string | string[] | null; skipLedgerPosting?: boolean }
): Promise<Payment | null> {
  // Délai augmenté à 500ms pour éviter les appels trop rapprochés
  await delay(500);
  
  const ref = paymentRef(companyId, paymentId);
  
  // Utilisation du retry pour getDoc
  const snap = await withRetryOnQuota(
    () => getDoc(ref),
    2,
    "getDoc in confirmPayment"
  );
  
  if (!snap.exists()) return null;

  const current = mapPaymentDoc(snap.id, snap.data() as Record<string, unknown>);
  if (current.status !== "pending") {
    return current;
  }

  assertCanConfirmPaymentLedger({
    paymentChannel: current.channel,
    actorRole: options?.actorRole,
  });

  const now = Timestamp.now();
  const skipLedger = options?.skipLedgerPosting === true;

  // Mise à jour du statut du paiement avec retry
  await withRetryOnQuota(
    () => updateDoc(ref, {
      status: "validated",
      validatedAt: now,
      validatedBy: userId,
      ledgerStatus: "pending",
      ledgerLastAttemptAt: now,
      ledgerError: null,
      updatedAt: serverTimestamp(),
    }),
    2,
    "updateDoc in confirmPayment"
  );

  const updated: Payment = {
    ...current,
    status: "validated",
    validatedAt: now,
    validatedBy: userId,
    ledgerStatus: "pending",
    ledgerLastAttemptAt: now,
    ledgerError: null,
  };

  let ledgerError: string | null = null;
  let finalLedgerStatus: PaymentLedgerStatus = "pending";

  // Skip ledger posting si demandé (pour éviter les 429)
  if (!skipLedger) {
    try {
      // Opération ledger complète avec retry (3 tentatives max)
      await withRetryOnQuota(async () => {
        await createFinancialTransaction(buildLedgerPaymentPayload(updated, paymentId, now));
        await markPaymentLedgerStatus({ companyId, paymentId, ledgerStatus: "posted" });
      }, 3, "ledger posting");
      
      finalLedgerStatus = "posted";
    } catch (err) {
      ledgerError = toLedgerErrorMessage(err);
      finalLedgerStatus = "failed";

      await markPaymentLedgerStatus({
        companyId,
        paymentId,
        ledgerStatus: "failed",
        errorMessage: ledgerError,
      }).catch((statusErr) => {
        console.warn("[paymentService] markPaymentLedgerStatus failed:", statusErr);
      });

      console.warn("[paymentService] ledger posting failed after payment validation:", err);
    }
  } else {
    console.log("[paymentService] ledger posting skipped (skipLedgerPosting=true)");
    await markPaymentLedgerStatus({ companyId, paymentId, ledgerStatus: "pending" });
  }

  await logPaymentAction({ companyId, paymentId, action: "confirm", userId });

  const provider = String(updated.provider ?? "").toLowerCase();
  const isMobileMoneyProvider =
    provider === "wave" ||
    provider === "orange" ||
    provider === "moov" ||
    provider === "sarali";

  if (isMobileMoneyProvider) {
    const actorRole = Array.isArray(options?.actorRole)
      ? String(options?.actorRole?.[0] ?? "").trim() || "operator_digital"
      : String(options?.actorRole ?? "").trim() || "operator_digital";

    const statutValidation =
      finalLedgerStatus === "posted"
        ? "validee_ledger_posted"
        : finalLedgerStatus === "failed"
          ? "validee_ledger_failed"
          : "validee_sans_ledger";

    try {
      await upsertMobileMoneyValidationDocument({
        companyId,
        paymentId,
        reservationOuOperationId: updated.reservationId,
        agencyId: updated.agencyId,
        clientNom: null,
        numeroClient: null,
        montant: Number(updated.amount ?? 0),
        operateur: {
          uid: userId,
          role: actorRole,
          name: userId,
        },
        preuveVerifiee: true,
        referenceTransactionMobileMoney: paymentId,
        statutValidation,
        commentaire: ledgerError ?? (skipLedger ? "Ledger désactivé temporairement" : null),
        visaControle: null,
        dateHeure: now,
        status: "ready_to_print",
        createdByUid: userId,
      });
    } catch (docError) {
      console.error("[paymentService] echec fiche validation mobile money", {
        companyId,
        paymentId,
        docError,
      });
    }
  }

  return {
    ...updated,
    ledgerStatus: finalLedgerStatus,
    ...(finalLedgerStatus === "posted" ? { ledgerPostedAt: now } : { ledgerError }),
  };
}

/**
 * Retry only the payment -> ledger posting for a validated payment.
 */
export async function retryPaymentLedgerPosting(params: {
  companyId: string;
  paymentId: string;
  userId: string;
  actorRole?: string | string[] | null;
}): Promise<Payment | null> {
  await delay(500);
  
  const ref = paymentRef(params.companyId, params.paymentId);
  
  const snap = await withRetryOnQuota(
    () => getDoc(ref),
    2,
    "getDoc in retryPaymentLedgerPosting"
  );
  
  if (!snap.exists()) return null;

  const current = mapPaymentDoc(snap.id, snap.data() as Record<string, unknown>);
  if (current.status !== "validated") {
    throw new Error("Reprise ledger impossible: le paiement doit etre valide.");
  }

  assertCanConfirmPaymentLedger({
    paymentChannel: current.channel,
    actorRole: params.actorRole,
  });

  await markPaymentLedgerStatus({
    companyId: params.companyId,
    paymentId: params.paymentId,
    ledgerStatus: "pending",
  });

  const now = Timestamp.now();

  try {
    await withRetryOnQuota(async () => {
      await createFinancialTransaction(buildLedgerPaymentPayload(current, params.paymentId, now));
      await markPaymentLedgerStatus({
        companyId: params.companyId,
        paymentId: params.paymentId,
        ledgerStatus: "posted",
      });
    }, 3, "retry ledger posting");

    return {
      ...current,
      ledgerStatus: "posted",
      ledgerPostedAt: now,
      ledgerLastAttemptAt: now,
      ledgerError: null,
    };
  } catch (err) {
    const ledgerError = toLedgerErrorMessage(err);

    await markPaymentLedgerStatus({
      companyId: params.companyId,
      paymentId: params.paymentId,
      ledgerStatus: "failed",
      errorMessage: ledgerError,
    }).catch((statusErr) => {
      console.warn("[paymentService] retry markPaymentLedgerStatus failed:", statusErr);
    });

    return {
      ...current,
      ledgerStatus: "failed",
      ledgerLastAttemptAt: now,
      ledgerError,
    };
  }
}

/**
 * Reject a payment (pending -> rejected).
 */
export async function rejectPayment(
  companyId: string,
  paymentId: string,
  reason?: string | null,
  userId = "system"
): Promise<void> {
  await delay(500);
  
  const ref = paymentRef(companyId, paymentId);
  const snap = await withRetryOnQuota(() => getDoc(ref), 2, "rejectPayment getDoc");
  if (!snap.exists()) throw new Error("Payment introuvable.");

  const data = snap.data() as Record<string, unknown>;
  if ((data.status as string) !== "pending") {
    throw new Error("Seuls les paiements en attente peuvent etre rejetes.");
  }

  await withRetryOnQuota(() => updateDoc(ref, {
    status: "rejected",
    rejectionReason: reason ?? null,
    updatedAt: serverTimestamp(),
  }), 2, "rejectPayment updateDoc");

  await logPaymentAction({ companyId, paymentId, action: "reject", userId });
}

/**
 * Refund a validated payment.
 */
export async function refundPayment(
  companyId: string,
  paymentId: string,
  userId: string,
  reason?: string | null
): Promise<void> {
  await delay(500);
  
  const ref = paymentRef(companyId, paymentId);
  const snap = await withRetryOnQuota(() => getDoc(ref), 2, "refundPayment getDoc");
  if (!snap.exists()) throw new Error("Payment introuvable.");

  const data = snap.data() as Record<string, unknown>;
  const currentStatus = String(data.status ?? "");

  if (currentStatus !== "validated") {
    throw new Error("Seuls les paiements valides peuvent etre rembourses.");
  }

  await withRetryOnQuota(() => updateDoc(ref, {
    status: "refunded",
    rejectionReason: reason ?? null,
    refundedAt: serverTimestamp(),
    refundedBy: userId,
    updatedAt: serverTimestamp(),
  }), 2, "refundPayment updateDoc");

  await logPaymentAction({ companyId, paymentId, action: "refund", userId });

  try {
    await withRetryOnQuota(() => createFinancialTransaction({
      companyId,
      type: "refund",
      source: (data.channel as "guichet" | "online" | "courrier") ?? "online",
      paymentChannel: String(data.channel ?? "online"),
      paymentMethod: explicitPaymentMethodFromPayment({
        channel: String(data.channel ?? "online"),
        provider: data.provider as PaymentProvider | undefined,
      }),
      paymentProvider: data.provider != null ? String(data.provider) : null,
      amount: Number(data.amount ?? 0),
      currency: String(data.currency ?? "XOF"),
      agencyId: String(data.agencyId ?? ""),
      reservationId: String(data.reservationId ?? ""),
      referenceType: "payment_refund",
      referenceId: paymentId,
      metadata: { reason: reason ?? null },
    }), 2, "refundPayment createFinancialTransaction");
  } catch (err) {
    console.warn("[paymentService] createFinancialTransaction failed (refund):", err);
  }
}

/**
 * List payments by status.
 */
export async function getPaymentsByStatus(
  companyId: string,
  status: PaymentStatus
): Promise<Payment[]> {
  const ref = paymentsRef(companyId);
  const q = query(ref, where("status", "==", status), orderBy("createdAt", "desc"));
  const snap = await withRetryOnQuota(() => getDocs(q), 2, "getPaymentsByStatus");
  return snap.docs.map((d) => mapPaymentDoc(d.id, d.data() as Record<string, unknown>));
}

/**
 * List payments within date range (createdAt).
 */
export async function getPaymentsByDateRange(
  companyId: string,
  start: Date,
  end: Date
): Promise<Payment[]> {
  const ref = paymentsRef(companyId);
  const startTs = Timestamp.fromDate(start);
  const endTs = Timestamp.fromDate(end);

  const q = query(
    ref,
    where("createdAt", ">=", startTs),
    where("createdAt", "<=", endTs),
    orderBy("createdAt", "desc")
  );

  const snap = await withRetryOnQuota(() => getDocs(q), 2, "getPaymentsByDateRange");
  return snap.docs.map((d) => mapPaymentDoc(d.id, d.data() as Record<string, unknown>));
}

/**
 * Get payment by id.
 */
export async function getPaymentById(
  companyId: string,
  paymentId: string
): Promise<Payment | null> {
  const ref = paymentRef(companyId, paymentId);
  const snap = await withRetryOnQuota(() => getDoc(ref), 2, "getPaymentById");
  if (!snap.exists()) return null;
  return mapPaymentDoc(snap.id, snap.data() as Record<string, unknown>);
}

/**
 * Lookup helper kept for compatibility.
 * Direct lookup by canonical doc id first, legacy query fallback second.
 */
export async function getPaymentByReservationId(
  companyId: string,
  reservationId: string
): Promise<Payment | null> {
  const direct = await getPaymentByCanonicalDocumentId(companyId, reservationId);
  if (direct) return direct;

  const ref = paymentsRef(companyId);
  try {
    const q = query(ref, where("reservationId", "==", reservationId), limit(1));
    const snap = await withRetryOnQuota(() => getDocs(q), 2, "getPaymentByReservationId");
    if (snap.empty) return null;
    const d = snap.docs[0];
    return mapPaymentDoc(d.id, d.data() as Record<string, unknown>);
  } catch {
    return null;
  }
}

function inferOnlinePaymentProvider(label: string | null | undefined): PaymentProvider {
  const s = (label || "").toLowerCase();
  if (s.includes("sarali")) return "sarali";
  if (s.includes("orange")) return "orange";
  if (s.includes("moov")) return "moov";
  if (s.includes("wave")) return "wave";
  return "wave";
}

/**
 * If no canonical payment doc exists for this reservation, create a pending online one.
 */
export async function ensurePendingOnlinePaymentFromReservation(params: {
  companyId: string;
  agencyId: string;
  reservationId: string;
  montant: number;
  paymentMethodLabel?: string | null;
}): Promise<{ ok: boolean; paymentId?: string; skipped?: boolean; error?: string }> {
  const amount = Number(params.montant) || 0;

  if (!params.companyId || !params.reservationId || !params.agencyId || amount <= 0) {
    return {
      ok: false,
      error:
        "ensurePendingOnlinePaymentFromReservation: companyId, agencyId, reservationId et montant > 0 requis",
    };
  }

  try {
    const existing = await getPaymentByCanonicalDocumentId(
      params.companyId,
      params.reservationId
    );

    if (existing) {
      return { ok: true, paymentId: existing.id, skipped: true };
    }

    const paymentId = await createPayment({
      reservationId: params.reservationId,
      companyId: params.companyId,
      agencyId: params.agencyId,
      amount,
      currency: "XOF",
      channel: "online",
      provider: inferOnlinePaymentProvider(params.paymentMethodLabel),
      status: "pending",
      paymentDocumentId: params.reservationId,
    });

    return { ok: true, paymentId };
  } catch (e) {
    console.error("[ensurePendingOnlinePaymentFromReservation]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}