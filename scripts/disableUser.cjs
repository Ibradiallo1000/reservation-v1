// Usage : node scripts/disableUser.cjs <UID>
const admin = require("firebase-admin");
const STAGING_PROJECT_ID = "teliya-staging";
const PRODUCTION_PROJECT_ID = "monbillet-95b77";

function loadStagingServiceAccount() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS est obligatoire pour ce script staging.");
  }
  const serviceAccount = require(credentialsPath);
  if (serviceAccount.project_id === PRODUCTION_PROJECT_ID) {
    throw new Error("REFUS ABSOLU: compte de service production interdit pour ce script.");
  }
  if (serviceAccount.project_id !== STAGING_PROJECT_ID) {
    throw new Error(`Projet Firebase attendu: ${STAGING_PROJECT_ID}. Recu: ${serviceAccount.project_id || "(absent)"}`);
  }
  return serviceAccount;
}

if (process.env.TELIYA_ALLOW_STAGING_ADMIN_MUTATION !== "true") {
  throw new Error("TELIYA_ALLOW_STAGING_ADMIN_MUTATION=true est requis pour desactiver un utilisateur staging.");
}

const sa = loadStagingServiceAccount();
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa), projectId: STAGING_PROJECT_ID });
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
