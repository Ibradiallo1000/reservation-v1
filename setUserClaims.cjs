// setUserClaims.cjs
// Usage :
//   node setUserClaims.cjs <UID|EMAIL> <role> [companyId] [agencyId]
// Exemples :
//   node setUserClaims.cjs admin@example.com admin_platforme
//   node setUserClaims.cjs admin@example.com admin_compagnie myCompanyId
//   node setUserClaims.cjs j8TzQm4i... chefAgence myCompanyId myAgencyId

const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json"); // doit être dans la racine

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const idOrEmail = process.argv[2];
const role = process.argv[3];
const companyId = process.argv[4] || null;
const agencyId = process.argv[5] || null;

if (!idOrEmail || !role) {
  console.error("❌ Usage: node setUserClaims.cjs <UID|EMAIL> <role> [companyId] [agencyId]");
  process.exit(1);
}

function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

async function main() {
  try {
    // 1) Résoudre l'UID (par email ou direct)
    let uid = idOrEmail;
    if (looksLikeEmail(idOrEmail)) {
      const user = await admin.auth().getUserByEmail(idOrEmail);
      uid = user.uid;
      console.log(`ℹ️ Résolu par e-mail → uid=${uid}`);
    } else {
      // Vérifier que l'UID existe (pour éviter les surprises de "projet" différent)
      await admin.auth().getUser(idOrEmail);
      console.log(`ℹ️ UID fourni: ${uid}`);
    }

    // 2) Construire les claims
    const claims = { role, email_verified: true };
    if (companyId) claims.companyId = companyId;
    if (agencyId) claims.agencyId = agencyId;

    // 3) Poser les claims
    await admin.auth().setCustomUserClaims(uid, claims);

    console.log(`✅ Claims définis pour uid=${uid}:`, claims);
    console.log("🔁 Demande à l'utilisateur de se déconnecter/reconnecter, ou force un getIdToken(true) côté front.");
    console.log("💡 Le project_id utilisé est:", serviceAccount.project_id);
    process.exit(0);
  } catch (err) {
    console.error("❌ Erreur:", err);
    process.exit(1);
  }
}

main();
