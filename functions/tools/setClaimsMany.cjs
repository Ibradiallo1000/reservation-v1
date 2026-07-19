// Usage staging uniquement:
// TELIYA_CLAIMS_USERS_JSON='[["email@test.local","admin_compagnie","company_test","agency_test"]]' \
// GOOGLE_APPLICATION_CREDENTIALS="C:\\path\\to\\staging-service-account.json" \
// node functions/tools/setClaimsMany.cjs

const admin = require("firebase-admin");

const STAGING_PROJECT_ID = "teliya-staging";
const PRODUCTION_PROJECT_ID = "monbillet-95b77";

function fail(message) {
  throw new Error(`[setClaimsMany] ${message}`);
}

function loadServiceAccount() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    fail("GOOGLE_APPLICATION_CREDENTIALS est obligatoire et doit pointer vers un service account staging.");
  }
  // eslint-disable-next-line global-require, import/no-dynamic-require
  return require(credentialsPath);
}

function assertStagingProject(projectId) {
  if (projectId === PRODUCTION_PROJECT_ID) {
    fail("REFUS ABSOLU: le service account cible la production.");
  }
  if (projectId !== STAGING_PROJECT_ID) {
    fail(`ProjectId attendu ${STAGING_PROJECT_ID}, recu ${projectId || "<absent>"}.`);
  }
}

function loadUsers() {
  const raw = process.env.TELIYA_CLAIMS_USERS_JSON;
  if (!raw) {
    fail("TELIYA_CLAIMS_USERS_JSON est obligatoire.");
  }
  const users = JSON.parse(raw);
  if (!Array.isArray(users) || users.length === 0) {
    fail("TELIYA_CLAIMS_USERS_JSON doit contenir au moins un utilisateur.");
  }
  return users;
}

const sa = loadServiceAccount();
assertStagingProject(sa.project_id);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    projectId: STAGING_PROJECT_ID,
  });
}

async function resolveUidByEmail(email) {
  try {
    const user = await admin.auth().getUserByEmail(email);
    return user.uid;
  } catch (e) {
    console.error(`Introuvable: ${email}`, e.message);
    return null;
  }
}

(async () => {
  const users = loadUsers();
  for (const [email, role, companyId, agencyId] of users) {
    const uid = await resolveUidByEmail(email);
    if (!uid) continue;
    const claims = { role, companyId, email_verified: true };
    if (agencyId) claims.agencyId = agencyId;
    await admin.auth().setCustomUserClaims(uid, claims);
    console.log(`Claims staging appliques pour ${email} (${uid}):`, claims);
  }
  console.log("Demander aux utilisateurs de se deconnecter/reconnecter, ou forcer getIdToken(true).");
  process.exit(0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
