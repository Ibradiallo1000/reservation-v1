// setClaimsMany.cjs
// Usage: node setClaimsMany.cjs
// -> édite le tableau USERS ci-dessous.

const admin = require("firebase-admin");
const sa = require("./serviceAccountKey.json");

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

const USERS = [
  // email,             role,              companyId,                                    agencyId (optionnel)
  ["dialloibrahim0123@outlook.fr", "admin_compagnie", "OH9Q6xqbvNWmOsf6FOVs6d0zg2V2"],
  // ["chef@ex.com",       "chefAgence",      "OH9Q6xqbvNWmOsf6FOVs6d0zg2V2", "AGENCE_ID"],
  // ["guichet001@...",    "guichetier",      "OH9Q6xqbvNWmOsf6FOVs6d0zg2V2", "AGENCE_ID"],
];

async function resolveUidByEmail(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    return user.uid;
  } catch (e) {
    console.error(`❌ Introuvable: ${email}`, e.message);
    return null;
  }
}

(async () => {
  for (const [email, role, companyId, agencyId] of USERS) {
    const uid = await resolveUidByEmail(email);
    if (!uid) continue;
    const claims = { role, companyId, email_verified: true };
    if (agencyId) claims.agencyId = agencyId;
    await admin.auth().setCustomUserClaims(uid, claims);
    console.log(`✅ Claims pour ${email} (${uid}):`, claims);
  }
  console.log("ℹ️ Demande aux utilisateurs de se déconnecter/reconnecter, ou fais getIdToken(true).");
  process.exit(0);
})();
