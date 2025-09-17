// Usage : node scripts/disableUser.cjs <UID>
const admin = require("firebase-admin");
const sa = require("../serviceAccountKey.json");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

(async () => {
  const uid = process.argv[2];
  if (!uid) { console.error("Usage: node scripts/disableUser.cjs <UID>"); process.exit(1); }

  try { await admin.auth().updateUser(uid, { disabled: true }); }
  catch (e){ if (e?.code !== "auth/user-not-found") throw e; }

  await db.doc(`users/${uid}`).set(
    { status: "disabled", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  console.log("✅ Utilisateur désactivé :", uid);
})().catch(e => { console.error("❌ Erreur:", e); process.exit(1); });
