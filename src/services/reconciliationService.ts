/**
 * Moteur de réconciliation payments ↔ financialTransactions (ledger).
 * Source de vérité = financialTransactions ; aucun write legacy financialMovements.
 * Collection: companies/{companyId}/reconciliationLogs
 */

import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getPaymentsByStatus, getPaymentById } from "./paymentService";
import type { Payment } from "@/types/payment";
import { isConfirmedTransactionStatus } from "@/modules/compagnie/treasury/financialTransactions";

const RECONCILIATION_LOGS_COLLECTION = "reconciliationLogs";

function reconciliationLogsRef(companyId: string) {
  return collection(db, `companies/${companyId}/${RECONCILIATION_LOGS_COLLECTION}`);
}

export type ReconciliationAnomalyType = "missing_movement" | "orphan_movement";

export interface ReconciliationLogEntry {
  type: ReconciliationAnomalyType;
  paymentId?: string;
  movementId?: string;
  detectedAt: unknown;
}

/**
 * Liste les payments validés avec validatedAt dans la plage (requête par statut + filtre en mémoire si besoin).
 * Pour une requête Firestore par validatedAt il faudrait un index (status, validatedAt).
 */
async function getValidatedPaymentsInPeriod(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<Payment[]> {
  const all = await getPaymentsByStatus(companyId, "validated");
  const startTs = startDate.getTime();
  const endTs = endDate.getTime();
  return all.filter((p) => {
    if (p.ledgerStatus !== "posted") return false;
    const v = p.validatedAt;
    if (!v) return false;
    const t = v instanceof Timestamp ? v.toMillis() : typeof v === "number" ? v : new Date(v as string).getTime();
    return t >= startTs && t <= endTs;
  });
}

/**
 * Liste les écritures ledger de type payment_received/refund dans la plage performedAt.
 */
async function getPaymentTransactionsInPeriod(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{ id: string; referenceId: string; referenceType: string }[]> {
  const movRef = collection(db, `companies/${companyId}/financialTransactions`);
  const startTs = Timestamp.fromDate(startDate);
  const endTs = Timestamp.fromDate(endDate);
  const q = query(
    movRef,
    where("referenceType", "in", ["payment", "payment_refund"]),
    where("performedAt", ">=", startTs),
    where("performedAt", "<=", endTs),
    orderBy("performedAt", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => {
      const data = d.data() as { referenceId?: string; referenceType?: string; status?: string };
      return {
        id: d.id,
        referenceId: String(data?.referenceId ?? ""),
        referenceType: String(data?.referenceType ?? ""),
        status: String(data?.status ?? ""),
      };
    })
    .filter((m) => isConfirmedTransactionStatus(m.status as any))
    .map(({ id, referenceId, referenceType }) => ({ id, referenceId, referenceType }));
}

/**
 * Réconcilie payments validés et financialTransactions sur une période.
 * Log les anomalies dans reconciliationLogs.
 */
export async function reconcilePaymentsAndMovements(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{ missingMovement: string[]; orphanMovement: string[] }> {
  const logsRef = reconciliationLogsRef(companyId);
  const missingMovement: string[] = [];
  const orphanMovement: string[] = [];

  const validatedPayments = await getValidatedPaymentsInPeriod(companyId, startDate, endDate);
  const movements = await getPaymentTransactionsInPeriod(companyId, startDate, endDate);
  const paymentIdsWithMovement = new Set(
    movements.filter((m) => m.referenceType === "payment").map((m) => m.referenceId)
  );
  const refundRefs = new Set(
    movements.filter((m) => m.referenceType === "payment_refund").map((m) => m.referenceId)
  );

  for (const payment of validatedPayments) {
    const hasMovement = paymentIdsWithMovement.has(payment.id);
    if (!hasMovement) {
      missingMovement.push(payment.id);
      await addDoc(logsRef, {
        type: "missing_movement",
        paymentId: payment.id,
        movementId: null,
        detectedAt: serverTimestamp(),
      } as Record<string, unknown>);
    }
  }

  for (const mov of movements) {
    if (mov.referenceType !== "payment") continue;
    const paymentExists = await getPaymentById(companyId, mov.referenceId);
    if (!paymentExists) {
      orphanMovement.push(mov.id);
      await addDoc(logsRef, {
        type: "orphan_movement",
        paymentId: mov.referenceId,
        movementId: mov.id,
        detectedAt: serverTimestamp(),
      } as Record<string, unknown>);
    }
  }

  return { missingMovement, orphanMovement };
}

/**
 * Réparation proactive désactivée : journal ledger déjà source de vérité.
 */
export async function repairFinancialConsistency(_companyId: string): Promise<{
  repaired: number;
  orphansLogged: number;
}> {
  return { repaired: 0, orphansLogged: 0 };
}

/**
 * Réparation par période — ne crée plus aucune écriture legacy.
 */
export async function repairPaymentsAndMovementsInPeriod(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{
  repaired: number;
  missingBefore: number;
  orphanMovementCount: number;
}> {
  const { missingMovement, orphanMovement } = await reconcilePaymentsAndMovements(companyId, startDate, endDate);
  return { repaired: 0, missingBefore: missingMovement.length, orphanMovementCount: orphanMovement.length };
}
