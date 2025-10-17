// scripts/backfillPublicProfiles.ts
// One-shot: lit tous les users/{uid} et écrit publicProfiles/{sha256(emailLower)}
// Lancement:  node scripts/backfillPublicProfiles.ts
// Prérequis:  GOOGLE_APPLICATION_CREDENTIALS pointant vers une clé service-account

import admin from "firebase-admin";

admin.initializeApp();
const db = admin.firestore();

type UserDoc = {
  email?: string;
  name?: string;
  displayName?: string;
  role?: string;
  companyId?: string | null;
  agencyId?: string | null;
};

function roleLabelFromRole(role?: string) {
  const r = (role || "").toLowerCase().trim();
  if (r === "admin_platforme" || r === "admin plateforme") return "Admin plateforme";
  if (r === "admin_compagnie" || r === "admin compagnie") return "Admin compagnie";
  if (r === "chefagence" || r === "chef_agence" || r === "chefagence") return "Chef d’agence";
  if (r === "agentcourrier" || r === "agent_courrier") return "Agent courrier";
  if (r === "superviseur") return "Superviseur";
  if (r === "guichetier") return "Guichetier";
  if (r === "comptable") return "Comptable";
  if (r === "embarquement") return "Embarquement";
  if (r === "compagnie") return "Administration compagnie";
  return "Utilisateur";
}

async function sha256Hex(input: string) {
  const crypto = await import("node:crypto");
  return crypto.createHash("sha256").update(input).digest("hex");
}

async function main() {
  console.log("Backfill publicProfiles: START");

  const usersSnap = await db.collection("users").get();
  console.log(`Found ${usersSnap.size} users`);

  // Précharge éventuelles compagnies/agences pour labels (optionnel)
  const companyCache = new Map<string, string>(); // companyId -> company.name || raisonSociale
  const agencyCache = new Map<string, string>();  // `${companyId}/${agencyId}` -> nomAgence

  async function getCompanyName(companyId?: string | null) {
    if (!companyId) return null;
    if (companyCache.has(companyId)) return companyCache.get(companyId)!;
    const d = await db.doc(`companies/${companyId}`).get();
    const name = (d.exists && ((d.data() as any)?.name || (d.data() as any)?.raisonSociale)) || null;
    companyCache.set(companyId, name);
    return name;
  }

  async function getAgencyName(companyId?: string | null, agencyId?: string | null) {
    if (!companyId || !agencyId) return null;
    const key = `${companyId}/${agencyId}`;
    if (agencyCache.has(key)) return agencyCache.get(key)!;
    const d = await db.doc(`companies/${companyId}/agences/${agencyId}`).get();
    const name = (d.exists && ((d.data() as any)?.nomAgence)) || null;
    agencyCache.set(key, name);
    return name;
  }

  const BATCH_SIZE = 400;
  let batch = db.batch();
  let countInBatch = 0;
  let totalWrites = 0;

  for (const docSnap of usersSnap.docs) {
    const u = docSnap.data() as UserDoc;
    const email = (u.email || "").trim().toLowerCase();
    if (!email) {
      console.warn(`User ${docSnap.id} sans email — skip`);
      continue;
    }
    const displayName = u.name || u.displayName || "";
    const roleLabel = roleLabelFromRole(u.role);
    const companyName = await getCompanyName(u.companyId ?? null);
    const agencyName = await getAgencyName(u.companyId ?? null, u.agencyId ?? null);

    const hash = await sha256Hex(email);
    const ref = db.doc(`publicProfiles/${hash}`);
    batch.set(ref, {
      displayName: displayName || null,
      roleLabel,
      companyName: companyName || null,
      agencyName: agencyName || null,
      // pas d'email, pas d'uid ici → privacy
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    countInBatch++;
    totalWrites++;

    if (countInBatch >= BATCH_SIZE) {
      await batch.commit();
      console.log(`Committed ${totalWrites}`);
      batch = db.batch();
      countInBatch = 0;
    }
  }

  if (countInBatch > 0) {
    await batch.commit();
    console.log(`Committed ${totalWrites}`);
  }

  console.log("Backfill publicProfiles: DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
