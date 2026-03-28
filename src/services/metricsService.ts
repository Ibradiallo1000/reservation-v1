/**
 * Métriques de divergence payments vs financialTransactions (ledger).
 * Stockage : companies/{companyId}/metrics/divergence
 * Alerte si difference > threshold.
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { getPaymentsByStatus } from "./paymentService";
import { getUnifiedCompanyFinance } from "@/modules/finance/services/unifiedFinanceService";

const METRICS_COLLECTION = "metrics";
const DIVERGENCE_DOC_ID = "divergence";

const CRITICAL_THRESHOLD = 1;

export interface DivergenceMetric {
  paymentsTotal: number;
  movementsTotal: number;
  difference: number;
  computedAt: unknown;
}

function divergenceRef(companyId: string) {
  return doc(db, `companies/${companyId}/${METRICS_COLLECTION}/${DIVERGENCE_DOC_ID}`);
}

/**
 * Somme des montants des payments validés (hors refunded).
 */
async function getPaymentsTotal(companyId: string): Promise<number> {
  const validated = await getPaymentsByStatus(companyId, "validated");
  return validated.reduce((sum, p) => sum + p.amount, 0);
}

/**
 * Somme des montants des financialTransactions (payment_received/refund) net.
 */
async function getMovementsTotal(companyId: string): Promise<number> {
  const movRef = collection(db, `companies/${companyId}/financialTransactions`);
  const q = query(movRef, where("type", "in", ["payment_received", "refund"]));
  const snap = await getDocs(q);
  let total = 0;
  snap.docs.forEach((d) => {
    const data = d.data() as { amount?: number; type?: string };
    const amount = Number(data?.amount ?? 0) || 0;
    const type = String(data?.type ?? "");
    total += type === "refund" ? -amount : amount;
  });
  return total;
}

/**
 * Calcule la divergence (sum payments vs sum movements) et la persiste.
 * Si difference > threshold → log CRITICAL_FINANCIAL_INCONSISTENCY.
 */
export async function computeDivergence(companyId: string): Promise<DivergenceMetric> {
  const [paymentsTotal, movementsTotal] = await Promise.all([
    getPaymentsTotal(companyId),
    getMovementsTotal(companyId),
  ]);
  const difference = Math.abs(paymentsTotal - movementsTotal);

  const metric: DivergenceMetric = {
    paymentsTotal,
    movementsTotal,
    difference,
    computedAt: serverTimestamp(),
  };

  await setDoc(divergenceRef(companyId), {
    ...metric,
    computedAt: serverTimestamp(),
  });

  if (difference > CRITICAL_THRESHOLD) {
    console.error("[metricsService] CRITICAL_FINANCIAL_INCONSISTENCY", {
      companyId,
      paymentsTotal,
      movementsTotal,
      difference,
      threshold: CRITICAL_THRESHOLD,
    });
  }

  return metric;
}

/**
 * Variante "sur période" pour exécuter les validations contrôlées avant migration dashboards.
 * Stockage: companies/{companyId}/metrics/divergence_period
 */
export async function computeDivergenceInPeriod(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<DivergenceMetric & { periodStart?: unknown; periodEnd?: unknown }> {
  const paymentsRef = collection(db, `companies/${companyId}/payments`);
  const startTs = Timestamp.fromDate(startDate);
  const endTs = Timestamp.fromDate(endDate);

  const paymentsTotalPromise = (async () => {
    const q = query(
      paymentsRef,
      where("status", "==", "validated"),
      where("validatedAt", ">=", startTs),
      where("validatedAt", "<=", endTs),
      orderBy("validatedAt", "asc")
    );
    const snap = await getDocs(q);
    let total = 0;
    snap.docs.forEach((d) => {
      const data = d.data() as { amount?: number };
      total += Number(data?.amount ?? 0) || 0;
    });
    return total;
  })();

  const movementsRef = collection(db, `companies/${companyId}/financialTransactions`);
  const movementsTotalPromise = (async () => {
    const q = query(
      movementsRef,
      where("type", "in", ["payment_received", "refund"]),
      where("performedAt", ">=", startTs),
      where("performedAt", "<=", endTs),
      orderBy("performedAt", "asc")
    );
    const snap = await getDocs(q);
    let total = 0;
    snap.docs.forEach((d) => {
      const data = d.data() as { amount?: number; type?: string };
      const amount = Number(data?.amount ?? 0) || 0;
      const type = String(data?.type ?? "");
      total += type === "refund" ? -amount : amount;
    });
    return total;
  })();

  const [paymentsTotal, movementsTotal] = await Promise.all([
    paymentsTotalPromise,
    movementsTotalPromise,
  ]);

  const difference = Math.abs(paymentsTotal - movementsTotal);
  const metric: DivergenceMetric & { periodStart?: unknown; periodEnd?: unknown } = {
    paymentsTotal,
    movementsTotal,
    difference,
    computedAt: serverTimestamp(),
    periodStart: startDate,
    periodEnd: endDate,
  };

  await setDoc(
    doc(db, `companies/${companyId}/metrics`, "divergence_period"),
    {
      ...metric,
      computedAt: serverTimestamp(),
    }
  );

  if (difference > 1) {
    console.error("[metricsService] CRITICAL_FINANCIAL_INCONSISTENCY (period)", {
      companyId,
      paymentsTotal,
      movementsTotal,
      difference,
      threshold: 1,
    });
  }

  return metric;
}

export async function computeCrossPageConsistency(
  companyId: string,
  dateFrom: string,
  dateTo: string
): Promise<{
  source: string;
  kpi: { sales: number; collections: number; online: number; guichet: number };
  computedAt: unknown;
}> {
  const unified = await getUnifiedCompanyFinance(companyId, dateFrom, dateTo);
  const out = {
    source: "ledger: financialTransactions + accounts; ventes: reservations(createdAt)",
    kpi: {
      sales: unified.activity.sales.amountHint,
      collections: unified.activity.encaissements.total,
      online: unified.activity.split.paiementsEnLigne,
      guichet: unified.activity.split.paiementsGuichet,
    },
    computedAt: serverTimestamp(),
  };
  await setDoc(doc(db, `companies/${companyId}/metrics`, "cross_page_consistency"), out);
  return out;
}
