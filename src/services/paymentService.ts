/**
 * Service Payment — entité unifiée guichet + online + courrier.
 * Collection: companies/{companyId}/payments/{paymentId}
 * confirmPayment : écrit le ledger (financialTransactions) pour les paiements en ligne / pending — source de vérité encaissement.
 * cashTransactions reste la trace opérationnelle côté guichet / online (hors ledger créé ici pour online).
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
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import type { Payment, CreatePaymentData, PaymentProvider, PaymentStatus } from "@/types/payment";
import { createFinancialTransaction } from "@/modules/compagnie/treasury/financialTransactions";
import type { FinancialPaymentMethod } from "@/modules/compagnie/treasury/types";

function explicitPaymentMethodFromPayment(p: { channel: string; provider?: string }): FinancialPaymentMethod {
  const prov = String(p.provider ?? "").toLowerCase();
  if (prov === "cash") return "cash";
  if (prov === "wave" || prov === "orange" || prov === "moov") return "mobile_money";
  const ch = String(p.channel ?? "");
  if (ch === "guichet") return prov === "cash" ? "cash" : "mobile_money";
  if (ch === "online") return "mobile_money";
  return "card";
}

const PAYMENTS_COLLECTION = "payments";
const PAYMENT_LOGS_COLLECTION = "paymentLogs";

function paymentsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${PAYMENTS_COLLECTION}`);
}

function paymentRef(companyId: string, paymentId: string) {
  return doc(db, `companies/${companyId}/${PAYMENTS_COLLECTION}/${paymentId}`);
}

type PaymentAction = "confirm" | "reject" | "refund";

export async function logPaymentAction(params: {
  companyId: string;
  paymentId: string;
  action: PaymentAction;
  userId: string;
}): Promise<void> {
  await addDoc(collection(db, `companies/${params.companyId}/${PAYMENT_LOGS_COLLECTION}`), {
    paymentId: params.paymentId,
    action: params.action,
    userId: params.userId,
    timestamp: serverTimestamp(),
  });
}

/**
 * Crée un payment. Utilisé à la création résa guichet (validated) ou online (pending).
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
    createdAt: serverTimestamp(),
    validatedAt: validatedNow,
    validatedBy,
    rejectionReason: null,
  };
  if (data.paymentDocumentId) {
    const pref = doc(ref, data.paymentDocumentId);
    await setDoc(pref, payload);
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
  const docRef = await addDoc(ref, payload);
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

/**
 * Valide un payment (pending → validated) et crée le financialMovement.
 */
export async function confirmPayment(
  companyId: string,
  paymentId: string,
  userId: string
): Promise<Payment | null> {
  const ref = paymentRef(companyId, paymentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  if ((data.status as string) !== "pending") {
    return { id: snap.id, ...data } as Payment;
  }

  const now = Timestamp.now();
  await updateDoc(ref, {
    status: "validated",
    validatedAt: now,
    validatedBy: userId,
  });

  const updated: Payment = {
    id: snap.id,
    reservationId: String(data.reservationId),
    companyId: String(data.companyId),
    agencyId: String(data.agencyId),
    amount: Number(data.amount),
    currency: String(data.currency ?? "XOF"),
    channel: data.channel as Payment["channel"],
    provider: data.provider as Payment["provider"],
    status: "validated",
    createdAt: data.createdAt,
    validatedAt: now,
    validatedBy: userId,
  };

  try {
    await createFinancialTransaction({
      companyId,
      type: "payment_received",
      source: updated.channel,
      paymentChannel: updated.channel,
      paymentMethod: explicitPaymentMethodFromPayment({
        channel: updated.channel,
        provider: updated.provider,
      }),
      paymentProvider: updated.provider,
      amount: updated.amount,
      currency: updated.currency,
      agencyId: updated.agencyId,
      reservationId: updated.reservationId,
      performedAt: now,
      referenceType: "payment",
      referenceId: paymentId,
      metadata: { provider: updated.provider },
    });
  } catch (err) {
    console.warn("[paymentService] createFinancialTransaction failed (payment validated):", err);
  }
  await logPaymentAction({ companyId, paymentId, action: "confirm", userId });

  return updated;
}

/**
 * Rejette un payment (pending → rejected).
 */
export async function rejectPayment(
  companyId: string,
  paymentId: string,
  reason?: string | null,
  userId = "system"
): Promise<void> {
  const ref = paymentRef(companyId, paymentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Payment introuvable.");
  const data = snap.data() as Record<string, unknown>;
  if ((data.status as string) !== "pending") throw new Error("Seuls les paiements en attente peuvent être rejetés.");

  await updateDoc(ref, {
    status: "rejected",
    rejectionReason: reason ?? null,
    updatedAt: serverTimestamp(),
  });
  await logPaymentAction({ companyId, paymentId, action: "reject", userId });
}

/**
 * Rembourse un payment validé.
 */
export async function refundPayment(
  companyId: string,
  paymentId: string,
  userId: string,
  reason?: string | null
): Promise<void> {
  const ref = paymentRef(companyId, paymentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error("Payment introuvable.");
  const data = snap.data() as Record<string, unknown>;
  const currentStatus = String(data.status ?? "");
  if (currentStatus !== "validated") {
    throw new Error("Seuls les paiements validés peuvent être remboursés.");
  }
  await updateDoc(ref, {
    status: "refunded",
    rejectionReason: reason ?? null,
    refundedAt: serverTimestamp(),
    refundedBy: userId,
    updatedAt: serverTimestamp(),
  });
  await logPaymentAction({ companyId, paymentId, action: "refund", userId });

  try {
    await createFinancialTransaction({
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
    });
  } catch (err) {
    console.warn("[paymentService] createFinancialTransaction failed (refund):", err);
  }
}

/**
 * Liste les payments par statut.
 */
export async function getPaymentsByStatus(
  companyId: string,
  status: PaymentStatus
): Promise<Payment[]> {
  const ref = paymentsRef(companyId);
  const q = query(ref, where("status", "==", status), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      reservationId: String(data.reservationId),
      companyId: String(data.companyId),
      agencyId: String(data.agencyId),
      amount: Number(data.amount),
      currency: String(data.currency ?? "XOF"),
      channel: data.channel as Payment["channel"],
      provider: data.provider as Payment["provider"],
      status: data.status as Payment["status"],
      createdAt: data.createdAt,
      validatedAt: data.validatedAt,
      validatedBy: data.validatedBy as string | undefined,
      rejectionReason: data.rejectionReason ?? undefined,
    } as Payment;
  });
}

/**
 * Liste les payments dans une plage de dates (createdAt).
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
  const snap = await getDocs(q);
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      reservationId: String(data.reservationId),
      companyId: String(data.companyId),
      agencyId: String(data.agencyId),
      amount: Number(data.amount),
      currency: String(data.currency ?? "XOF"),
      channel: data.channel as Payment["channel"],
      provider: data.provider as Payment["provider"],
      status: data.status as Payment["status"],
      createdAt: data.createdAt,
      validatedAt: data.validatedAt,
      validatedBy: data.validatedBy as string | undefined,
      rejectionReason: data.rejectionReason ?? undefined,
    } as Payment;
  });
}

/**
 * Récupère le payment lié à une réservation (pour validation online).
 */
export async function getPaymentById(companyId: string, paymentId: string): Promise<Payment | null> {
  const ref = paymentRef(companyId, paymentId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    id: snap.id,
    reservationId: String(data.reservationId),
    companyId: String(data.companyId),
    agencyId: String(data.agencyId),
    amount: Number(data.amount),
    currency: String(data.currency ?? "XOF"),
    channel: data.channel as Payment["channel"],
    provider: data.provider as Payment["provider"],
    status: data.status as Payment["status"],
    createdAt: data.createdAt,
    validatedAt: data.validatedAt,
    validatedBy: data.validatedBy as string | undefined,
    rejectionReason: data.rejectionReason ?? undefined,
  } as Payment;
}

export async function getPaymentByReservationId(
  companyId: string,
  reservationId: string
): Promise<Payment | null> {
  const ref = paymentsRef(companyId);

  // Idempotence strategy: sur online, on écrit souvent le doc avec id = reservationId.
  // Cela évite d’avoir besoin d’un `list` (query) sur `payments` côté règles visiteurs.
  const directRef = doc(ref, reservationId);
  const directSnap = await getDoc(directRef);
  if (directSnap.exists()) {
    const data = directSnap.data() as Record<string, unknown>;
    return {
      id: directSnap.id,
      reservationId: String(data.reservationId),
      companyId: String(data.companyId),
      agencyId: String(data.agencyId),
      amount: Number(data.amount),
      currency: String(data.currency ?? "XOF"),
      channel: data.channel as Payment["channel"],
      provider: data.provider as Payment["provider"],
      status: data.status as Payment["status"],
      createdAt: data.createdAt,
      validatedAt: data.validatedAt,
      validatedBy: data.validatedBy as string | undefined,
      rejectionReason: data.rejectionReason ?? undefined,
    } as Payment;
  }

  // Fallback (utile pour d’anciens paiements legacy au id auto-généré).
  try {
    const q = query(ref, where("reservationId", "==", reservationId), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      reservationId: String(data.reservationId),
      companyId: String(data.companyId),
      agencyId: String(data.agencyId),
      amount: Number(data.amount),
      currency: String(data.currency ?? "XOF"),
      channel: data.channel as Payment["channel"],
      provider: data.provider as Payment["provider"],
      status: data.status as Payment["status"],
      createdAt: data.createdAt,
      validatedAt: data.validatedAt,
      validatedBy: data.validatedBy as string | undefined,
      rejectionReason: data.rejectionReason ?? undefined,
    } as Payment;
  } catch {
    // On peut manquer du droit `list` côté visiteurs.
    return null;
  }
}

function inferOnlinePaymentProvider(label: string | null | undefined): PaymentProvider {
  const s = (label || "").toLowerCase();
  if (s.includes("orange")) return "orange";
  if (s.includes("moov")) return "moov";
  if (s.includes("wave")) return "wave";
  return "wave";
}

/**
 * Si aucun document payments n’existe pour cette réservation, crée un pending online
 * (ex. createPayment a échoué à la résa car utilisateur connecté hors tenant, ou règles anciennes).
 * À appeler après mise à jour preuve_recue pour alimenter la caisse digitale.
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
      error: "ensurePendingOnlinePaymentFromReservation: companyId, agencyId, reservationId et montant > 0 requis",
    };
  }
  try {
    const existing = await getPaymentByReservationId(params.companyId, params.reservationId);
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
