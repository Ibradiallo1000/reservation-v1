/**
 * Teliya SaaS – Scheduled Cloud Function: checkSubscriptionExpiration
 *
 * Runs once per day. Handles subscription lifecycle transitions:
 *   1. TRIAL expired -> GRACE (7 days)
 *   2. ACTIVE expired -> extend if paid, else GRACE
 *   3. GRACE expired -> RESTRICTED
 *
 * All transitions update:
 *   - subscriptionStatus (flat field)
 *   - subscription.status (nested object)
 *   - company.status if needed
 *   - timestamps
 *   - updatedAt
 */
import * as admin from "firebase-admin";

const db = admin.firestore();
const GRACE_PERIOD_DAYS = 7;
const BILLING_PERIOD_DAYS = 30;

interface TransitionLog {
  companyId: string;
  companyName: string;
  from: string;
  to: string;
  reason: string;
}

/**
 * Main expiration check logic.
 * Exported so it can be called from the scheduled function in index.ts.
 */
export async function runSubscriptionExpirationCheck(): Promise<TransitionLog[]> {
  const now = admin.firestore.Timestamp.now();
  const logs: TransitionLog[] = [];

  // 1. TRIAL companies whose trial has expired
  await processTrialExpirations(now, logs);

  // 2. ACTIVE companies whose period has ended
  await processActiveExpirations(now, logs);

  // 3. GRACE companies whose grace period has ended
  await processGraceExpirations(now, logs);

  return logs;
}

/* ================================================================
   1. TRIAL -> GRACE
================================================================ */
async function processTrialExpirations(
  now: admin.firestore.Timestamp,
  logs: TransitionLog[],
): Promise<void> {
  const snap = await db
    .collection("companies")
    .where("subscriptionStatus", "==", "trial")
    .where("trialEndsAt", "<=", now)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const gracePeriodEnd = admin.firestore.Timestamp.fromDate(
      new Date(now.toDate().getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
    );

    const update: Record<string, unknown> = {
      subscriptionStatus: "grace",
      graceUntil: gracePeriodEnd,
      "subscription.status": "grace",
      "subscription.gracePeriodEnd": gracePeriodEnd,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await doc.ref.update(update);

    logs.push({
      companyId: doc.id,
      companyName: (data.nom as string) || doc.id,
      from: "trial",
      to: "grace",
      reason: `Trial expired at ${(data.trialEndsAt as admin.firestore.Timestamp)?.toDate()?.toISOString() ?? "unknown"}`,
    });
  }
}

/* ================================================================
   2. ACTIVE -> extend or GRACE
================================================================ */
async function processActiveExpirations(
  now: admin.firestore.Timestamp,
  logs: TransitionLog[],
): Promise<void> {
  // Find active companies whose billing period has ended
  const snap = await db
    .collection("companies")
    .where("subscriptionStatus", "==", "active")
    .where("nextBillingDate", "<=", now)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();
    const lastPayment = data.lastPaymentAt as admin.firestore.Timestamp | undefined;

    // Check if there's a recent validated payment
    const hasRecentPayment = lastPayment && isPaymentRecent(lastPayment, now);

    if (hasRecentPayment) {
      // Extend the subscription period
      const newPeriodStart = now;
      const newPeriodEnd = admin.firestore.Timestamp.fromDate(
        new Date(now.toDate().getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000),
      );

      await doc.ref.update({
        nextBillingDate: newPeriodEnd,
        "subscription.currentPeriodStart": newPeriodStart,
        "subscription.currentPeriodEnd": newPeriodEnd,
        "subscription.nextBillingDate": newPeriodEnd,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logs.push({
        companyId: doc.id,
        companyName: (data.nom as string) || doc.id,
        from: "active",
        to: "active (renewed)",
        reason: "Recent payment found, period extended",
      });
    } else {
      // No recent payment -> move to grace
      const gracePeriodEnd = admin.firestore.Timestamp.fromDate(
        new Date(now.toDate().getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000),
      );

      await doc.ref.update({
        subscriptionStatus: "grace",
        graceUntil: gracePeriodEnd,
        "subscription.status": "grace",
        "subscription.gracePeriodEnd": gracePeriodEnd,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      logs.push({
        companyId: doc.id,
        companyName: (data.nom as string) || doc.id,
        from: "active",
        to: "grace",
        reason: "Billing period ended, no recent payment",
      });
    }
  }
}

/* ================================================================
   3. GRACE -> RESTRICTED
================================================================ */
async function processGraceExpirations(
  now: admin.firestore.Timestamp,
  logs: TransitionLog[],
): Promise<void> {
  const snap = await db
    .collection("companies")
    .where("subscriptionStatus", "==", "grace")
    .where("graceUntil", "<=", now)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data();

    await doc.ref.update({
      subscriptionStatus: "restricted",
      "subscription.status": "restricted",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    logs.push({
      companyId: doc.id,
      companyName: (data.nom as string) || doc.id,
      from: "grace",
      to: "restricted",
      reason: "Grace period ended without payment",
    });
  }
}

/* ================================================================
   HELPERS
================================================================ */

/**
 * Check if a payment timestamp is recent enough to warrant renewal.
 * "Recent" means within the last billing period.
 */
function isPaymentRecent(
  paymentTs: admin.firestore.Timestamp,
  now: admin.firestore.Timestamp,
): boolean {
  const diffMs = now.toDate().getTime() - paymentTs.toDate().getTime();
  const periodMs = BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000;
  return diffMs <= periodMs;
}
