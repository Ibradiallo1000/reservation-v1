/**
 * Teliya SaaS – Payment Validation Logic
 *
 * When a payment is validated:
 *   -> Move subscriptionStatus to "active"
 *   -> Update lastPaymentAt
 *   -> Update nextBillingDate (extend by 30 days)
 *   -> Extend subscription period
 *
 * Called from the validateCompanyPayment callable function in index.ts.
 */
import * as admin from "firebase-admin";

const db = admin.firestore();
const BILLING_PERIOD_DAYS = 30;

export interface ValidatePaymentInput {
  companyId: string;
  paymentId: string;
  validatedBy: string;
}

export interface ValidatePaymentResult {
  success: boolean;
  newStatus: string;
  nextBillingDate: string;
}

export async function processPaymentValidation(
  input: ValidatePaymentInput,
): Promise<ValidatePaymentResult> {
  const { companyId, paymentId, validatedBy } = input;
  const now = admin.firestore.Timestamp.now();

  // 1. Validate the payment document
  const paymentRef = db.doc(`companies/${companyId}/payments/${paymentId}`);
  const paymentSnap = await paymentRef.get();

  if (!paymentSnap.exists) {
    throw new Error("Payment document not found.");
  }

  const payment = paymentSnap.data()!;
  if (payment.status === "validated") {
    throw new Error("Payment already validated.");
  }

  // 2. Mark payment as validated
  await paymentRef.update({
    status: "validated",
    validatedBy,
    validatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 3. Update company subscription status
  const newPeriodStart = now;
  const newPeriodEnd = admin.firestore.Timestamp.fromDate(
    new Date(now.toDate().getTime() + BILLING_PERIOD_DAYS * 24 * 60 * 60 * 1000),
  );

  const companyRef = db.doc(`companies/${companyId}`);

  await companyRef.update({
    subscriptionStatus: "active",
    lastPaymentAt: now,
    nextBillingDate: newPeriodEnd,
    graceUntil: admin.firestore.FieldValue.delete(),
    "subscription.status": "active",
    "subscription.currentPeriodStart": newPeriodStart,
    "subscription.currentPeriodEnd": newPeriodEnd,
    "subscription.lastPaymentAt": now,
    "subscription.nextBillingDate": newPeriodEnd,
    "subscription.gracePeriodEnd": admin.firestore.FieldValue.delete(),
    status: "actif",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // 4. Update revenue tracking
  const amount = Number(payment.amount) || 0;
  await companyRef.update({
    totalPaymentsReceived: admin.firestore.FieldValue.increment(amount),
  });

  return {
    success: true,
    newStatus: "active",
    nextBillingDate: newPeriodEnd.toDate().toISOString(),
  };
}
