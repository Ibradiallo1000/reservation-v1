/* scripts/migrate_companies.cjs */
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

// --- MODE ---
// DRY-RUN par défaut (log sans écrire). Pour écrire: APPLY=1 node scripts/migrate_companies.cjs
const DRY = !process.env.APPLY;

// --- DEFAULTS ---
// Ajuste ici tes valeurs par défaut
const DEFAULTS = {
  plan: "free",                // "free" | "starter" | "pro" | "enterprise" | "manual"
  maxAgences: 1,
  maxUsers: 3,

  guichetEnabled: true,
  onlineBookingEnabled: false,
  publicPageEnabled: false,

  commissionOnline: 0.02,      // 2%
  feeGuichet: 100,             // FCFA
  minimumMonthly: 25000,       // FCFA

  status: "actif",
};

// Héritage depuis d'anciens champs (si tu en as)
function deriveFromLegacy(data) {
  const patch = {};
  // ex: si tu avais déjà "publicVisible" true + un slug → activer la page publique
  if (data.publicVisible === true && data.slug) patch.publicPageEnabled = true;
  return patch;
}

(async () => {
  try {
    // 1) Initialisation admin SDK
    // Place le fichier d'identifiants de service à: scripts/serviceAccount.json
    admin.initializeApp({
      credential: admin.credential.cert(require("./serviceAccount.json")),
    });
    const db = admin.firestore();

    // 2) Parcours paginé
    const pageSize = 300;
    let last = null;
    let scanned = 0, changed = 0, written = 0;

    while (true) {
      let ref = db.collection("companies")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);
      if (last) ref = ref.startAfter(last.id);

      const snap = await ref.get();
      if (snap.empty) break;

      const batch = db.batch();

      for (const docSnap of snap.docs) {
        scanned++;
        const d = docSnap.data() || {};
        const patch = { updatedAt: Timestamp.now() };

        // Appliquer les champs manquants
        for (const [k, v] of Object.entries(DEFAULTS)) {
          if (d[k] === undefined) patch[k] = v;
        }
        // Dérivations legacy
        Object.assign(patch, deriveFromLegacy(d));

        // Y a-t-il autre chose que updatedAt ?
        const keys = Object.keys(patch).filter(k => k !== "updatedAt");
        if (keys.length) {
          changed++;
          if (DRY) {
            console.log(`(dry) ${docSnap.id} ←`, keys);
          } else {
            batch.set(docSnap.ref, patch, { merge: true });
            written++;
          }
        }
      }

      if (!DRY && written) await batch.commit();

      last = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    console.log(`✅ Fini. Scanné=${scanned}, Changé=${changed}, Écrit=${DRY ? 0 : written}, Mode=${DRY ? "DRY-RUN" : "APPLY"}`);
    process.exit(0);
  } catch (e) {
    console.error("❌ Migration error:", e);
    process.exit(1);
  }
})();
