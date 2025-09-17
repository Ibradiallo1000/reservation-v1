// Usage : node scripts/deleteUserCascade.cjs <UID>
const admin = require("firebase-admin");
const sa = require("../serviceAccountKey.json");
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function commitInChunks(ops){const CHUNK=450;for(let i=0;i<ops.length;i+=CHUNK){const b=db.batch();ops.slice(i,i+CHUNK).forEach(fn=>fn(b));await b.commit();}}

(async () => {
  const uid = process.argv[2];
  if (!uid) { console.error("Usage: node scripts/deleteUserCascade.cjs <UID>"); process.exit(1); }

  const userRef = db.doc(`users/${uid}`);
  const userSnap = await userRef.get();
  const companyId = userSnap.exists ? userSnap.data()?.companyId : undefined;

  const ops = [];
  if (userSnap.exists) ops.push(b => b.delete(userRef));

  if (companyId) {
    const persRef = db.doc(`companies/${companyId}/personnel/${uid}`);
    const persSnap = await persRef.get();
    if (persSnap.exists) ops.push(b => b.delete(persRef));
  }

  const staffOcc = await db.collectionGroup("staff").where("uid","==",uid).get();
  staffOcc.docs.forEach(d => ops.push(b => b.delete(d.ref)));

  if (ops.length) await commitInChunks(ops);

  try { await admin.auth().deleteUser(uid); }
  catch (e){ if (e?.code !== "auth/user-not-found") throw e; }

  console.log("✅ Suppression cascade terminée pour", uid);
})().catch(e => { console.error("❌ Erreur:", e); process.exit(1); });
