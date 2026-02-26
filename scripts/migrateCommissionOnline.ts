/**
 * Teliya SaaS – Migration Script: commissionOnline -> digitalFeePercent
 *
 * Run this script once to migrate all existing Firestore documents.
 *
 * Usage (from project root):
 *   npx ts-node scripts/migrateCommissionOnline.ts
 *
 * Or deploy as a one-time Cloud Function (see functions/src/migrateCompanies.ts).
 *
 * What this script does:
 *   1. For each plan in /plans:
 *      - Sets digitalFeePercent = commissionOnline * 100 (if missing)
 *      - Sets supportLevel = "basic" (if missing)
 *      - Sets features to all-true
 *      - Removes commissionOnline field
 *
 *   2. For each company in /companies:
 *      - Sets digitalFeePercent from commissionOnline * 100 (if missing)
 *      - Sets subscriptionStatus = "active" (if missing)
 *      - Sets supportLevel = "basic" (if missing)
 *      - Sets planType = "paid" (if missing)
 *      - Ensures publicPageEnabled, onlineBookingEnabled, guichetEnabled = true
 *      - Sets revenue tracking fields to 0 (if missing)
 *      - Updates subscription.snapshot.digitalFeePercent (if subscription exists)
 *      - Removes commissionOnline field
 *
 * IMPORTANT: This script is idempotent. Running it multiple times is safe.
 */

// This is a conceptual script. In production, run via Cloud Function or Admin SDK.
// The logic below is pseudo-code for the migration steps.

interface MigrationStep {
  collection: string;
  description: string;
  fields: Record<string, string>;
}

const MIGRATION_STEPS: MigrationStep[] = [
  {
    collection: "plans",
    description: "Migrate plans: commissionOnline -> digitalFeePercent",
    fields: {
      "digitalFeePercent": "commissionOnline * 100 (if digitalFeePercent missing)",
      "supportLevel": "'basic' (if missing)",
      "features.publicPage": "true",
      "features.onlineBooking": "true",
      "features.guichet": "true",
      "commissionOnline": "DELETE",
      "overagePerReservation": "DELETE",
    },
  },
  {
    collection: "companies",
    description: "Migrate companies: commissionOnline -> digitalFeePercent + lifecycle fields",
    fields: {
      "digitalFeePercent": "commissionOnline * 100 (if digitalFeePercent missing)",
      "subscriptionStatus": "'active' (if missing, or 'trial' if trialEndsAt exists and future)",
      "supportLevel": "'basic' (if missing)",
      "planType": "'paid' (if missing, or 'trial' if subscriptionStatus is trial)",
      "publicPageEnabled": "true",
      "onlineBookingEnabled": "true",
      "guichetEnabled": "true",
      "totalDigitalRevenueGenerated": "0 (if missing)",
      "totalDigitalFeesCollected": "0 (if missing)",
      "totalPaymentsReceived": "0 (if missing)",
      "subscription.snapshot.digitalFeePercent": "from digitalFeePercent",
      "subscription.snapshot.supportLevel": "'basic' (if missing)",
      "commissionOnline": "DELETE",
    },
  },
];

/**
 * Cloud Function implementation of the migration.
 * Add this to functions/src/index.ts as a one-time callable function.
 *
 * Example:
 *
 * export const migrateToDigitalFee = functions.https.onCall(async (data, context) => {
 *   assertPlatformAdmin(context);
 *
 *   const db = admin.firestore();
 *   const results = { plans: 0, companies: 0 };
 *
 *   // Migrate plans
 *   const plansSnap = await db.collection("plans").get();
 *   for (const doc of plansSnap.docs) {
 *     const d = doc.data();
 *     const update: Record<string, any> = {};
 *
 *     if (d.digitalFeePercent === undefined && d.commissionOnline !== undefined) {
 *       update.digitalFeePercent = (Number(d.commissionOnline) || 0) * 100;
 *     }
 *     if (!d.supportLevel) update.supportLevel = "basic";
 *     update.features = { publicPage: true, onlineBooking: true, guichet: true };
 *
 *     // Remove legacy
 *     update.commissionOnline = admin.firestore.FieldValue.delete();
 *     update.overagePerReservation = admin.firestore.FieldValue.delete();
 *     update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
 *
 *     await doc.ref.update(update);
 *     results.plans++;
 *   }
 *
 *   // Migrate companies
 *   const companiesSnap = await db.collection("companies").get();
 *   for (const doc of companiesSnap.docs) {
 *     const d = doc.data();
 *     const update: Record<string, any> = {};
 *
 *     if (d.digitalFeePercent === undefined && d.commissionOnline !== undefined) {
 *       update.digitalFeePercent = (Number(d.commissionOnline) || 0) * 100;
 *     }
 *     if (!d.subscriptionStatus) {
 *       const hasTrial = d.trialEndsAt && d.trialEndsAt.toDate() > new Date();
 *       update.subscriptionStatus = hasTrial ? "trial" : "active";
 *     }
 *     if (!d.supportLevel) update.supportLevel = "basic";
 *     if (!d.planType) update.planType = d.subscriptionStatus === "trial" ? "trial" : "paid";
 *
 *     update.publicPageEnabled = true;
 *     update.onlineBookingEnabled = true;
 *     update.guichetEnabled = true;
 *
 *     if (d.totalDigitalRevenueGenerated === undefined) update.totalDigitalRevenueGenerated = 0;
 *     if (d.totalDigitalFeesCollected === undefined) update.totalDigitalFeesCollected = 0;
 *     if (d.totalPaymentsReceived === undefined) update.totalPaymentsReceived = 0;
 *
 *     // Update snapshot if subscription exists
 *     if (d.subscription?.snapshot) {
 *       const fee = update.digitalFeePercent ?? d.digitalFeePercent ?? 0;
 *       update["subscription.snapshot.digitalFeePercent"] = fee;
 *       if (!d.subscription.snapshot.supportLevel) {
 *         update["subscription.snapshot.supportLevel"] = "basic";
 *       }
 *     }
 *
 *     // Remove legacy
 *     update.commissionOnline = admin.firestore.FieldValue.delete();
 *     update.updatedAt = admin.firestore.FieldValue.serverTimestamp();
 *
 *     await doc.ref.update(update);
 *     results.companies++;
 *   }
 *
 *   return { success: true, ...results };
 * });
 */

// Export for documentation purposes
export { MIGRATION_STEPS };
export default MIGRATION_STEPS;
