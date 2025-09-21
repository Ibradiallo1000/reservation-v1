import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const DEFAULTS = {
  plan: "free",               // "free" | "starter" | "pro" | "enterprise" | "manual"
  maxAgences: 1,
  maxUsers: 3,

  // fonctionnalités
  guichetEnabled: true,
  onlineBookingEnabled: false,
  publicPageEnabled: false,

  // tarification
  commissionOnline: 0.02,     // 2%
  feeGuichet: 100,            // FCFA / réservation guichet
  minimumMonthly: 25000,      // FCFA

  status: "actif",
};

export const migrateCompanies = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
    // --- Sécurité : admin plateforme uniquement ---
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentification nécessaire.");
    }
    const claims = context.auth.token as any;
    const role = (claims?.role || "").toString().toLowerCase();
    if (!(role === "admin_platforme" || role === "admin plateforme")) {
      throw new functions.https.HttpsError("permission-denied", "Rôle admin_platforme requis.");
    }

    const DRY = !!data?.dryRun; // dry-run: log/compte sans écrire
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

        // patch idempotent: on n’écrase pas ce qui existe déjà
        const patch: Record<string, any> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        for (const [k, v] of Object.entries(DEFAULTS)) {
          if (d[k] === undefined) patch[k] = v;
        }

        // si ancien champ publicVisible + slug => activer la page publique
        if (d.publicVisible === true && d.slug) {
          patch.publicPageEnabled = true;
        }

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
