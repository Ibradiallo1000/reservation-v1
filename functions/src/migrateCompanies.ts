import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const DEFAULTS: Record<string, unknown> = {
  plan: "free",
  maxAgences: 1,
  maxUsers: 3,

  // All features always enabled
  guichetEnabled: true,
  onlineBookingEnabled: true,
  publicPageEnabled: true,

  // Dual-revenue model
  digitalFeePercent: 2,
  feeGuichet: 100,
  minimumMonthly: 25000,

  // Subscription lifecycle
  subscriptionStatus: "active",
  supportLevel: "basic",
  planType: "paid",

  // Revenue tracking
  totalDigitalRevenueGenerated: 0,
  totalDigitalFeesCollected: 0,
  totalPaymentsReceived: 0,

  status: "actif",
};

export const migrateCompanies = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentification necessaire.");
    }
    const claims = context.auth.token as Record<string, unknown>;
    const role = (claims?.role || "").toString().toLowerCase();
    if (!(role === "admin_platforme" || role === "admin plateforme")) {
      throw new functions.https.HttpsError("permission-denied", "Role admin_platforme requis.");
    }

    const DRY = !!(data as Record<string, unknown>)?.dryRun;
    const pageSize = 300;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    let scanned = 0, changed = 0, written = 0;

    while (true) {
      let ref = db.collection("companies")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);
      if (lastDoc) ref = ref.startAfter(lastDoc.id);

      const snap = await ref.get();
      if (snap.empty) break;

      const batch = db.batch();

      for (const docSnap of snap.docs) {
        scanned++;
        const d = docSnap.data() || {};

        const patch: Record<string, unknown> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Apply defaults for missing fields
        for (const [k, v] of Object.entries(DEFAULTS)) {
          if (d[k] === undefined) patch[k] = v;
        }

        // Migrate commissionOnline -> digitalFeePercent
        if (d.commissionOnline !== undefined && d.digitalFeePercent === undefined) {
          patch.digitalFeePercent = (Number(d.commissionOnline) || 0) * 100;
        }

        // Remove legacy commissionOnline
        if (d.commissionOnline !== undefined) {
          patch.commissionOnline = admin.firestore.FieldValue.delete();
        }

        // Ensure all features are enabled
        patch.publicPageEnabled = true;
        patch.onlineBookingEnabled = true;
        patch.guichetEnabled = true;

        const keys = Object.keys(patch).filter(k => k !== "updatedAt");
        if (keys.length) {
          changed++;
          if (!DRY) {
            batch.set(docSnap.ref, patch, { merge: true });
            written++;
          }
        }
      }

      if (!DRY && written) await batch.commit();
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    return { ok: true, scanned, changed, written, dryRun: DRY };
  });
