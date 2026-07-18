import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldPath, getFirestore } from "firebase-admin/firestore";
import {
  STAGING_PROJECT_ID, assertStagingProject, buildAuditRow, createMinimalBackup,
  countAuditActions, sha256, stableJson, validateApprovals,
} from "./lib/stagingCountryMigration.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply-approved");
const approvalArg = process.argv.find((value) => value.startsWith("--approvals="));
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!credentialsPath) throw new Error("GOOGLE_APPLICATION_CREDENTIALS staging est obligatoire; aucun fallback de credentials n’est autorisé.");
const credentials = JSON.parse(readFileSync(resolve(credentialsPath), "utf8"));
assertStagingProject(credentials.project_id);
if (process.env.GCLOUD_PROJECT && process.env.GCLOUD_PROJECT !== STAGING_PROJECT_ID) throw new Error("GCLOUD_PROJECT ne correspond pas au staging autorisé.");

const app = getApps()[0] ?? initializeApp({
  credential: credentials.private_key ? cert(credentials) : applicationDefault(),
  projectId: STAGING_PROJECT_ID,
});
assertStagingProject(app.options.projectId);
const db = getFirestore(app);

const companiesSnapshot = await db.collection("companies").orderBy(FieldPath.documentId()).get();
const companies = companiesSnapshot.docs.map((document) => ({ id: document.id, ...document.data() }));
const agenciesSnapshot = await db.collection("agences").get();
const agenciesByCompany = new Map();
for (const document of agenciesSnapshot.docs) {
  const agency = { id: document.id, ...document.data() };
  const companyId = String(agency.companyId ?? "");
  if (companyId) agenciesByCompany.set(companyId, [...(agenciesByCompany.get(companyId) ?? []), agency]);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = resolve("artifacts", "staging-country", timestamp);
mkdirSync(outputDir, { recursive: true });
const backup = createMinimalBackup(companies);
const backupJson = stableJson(backup);
writeFileSync(resolve(outputDir, "companies-country-backup.json"), backupJson, "utf8");
writeFileSync(resolve(outputDir, "companies-country-backup.sha256"), `${sha256(backupJson)}  companies-country-backup.json\n`, "utf8");
const auditRows = companies.map((company) => buildAuditRow(company, agenciesByCompany.get(company.id) ?? []));
writeFileSync(resolve(outputDir, "country-dry-run.json"), stableJson(auditRows), "utf8");
console.log(JSON.stringify({ projectId: app.options.projectId, mode: apply ? "apply-approved" : "dry-run", companies: companies.length, outputDir, counts: countAuditActions(auditRows) }, null, 2));

if (!apply) process.exit(0);
if (!approvalArg) throw new Error("--approvals=<fichier.json> est obligatoire avec --apply-approved.");
const approvalPath = resolve(approvalArg.split("=", 2)[1]);
if (!existsSync(approvalPath)) throw new Error(`Fichier d’approbation introuvable: ${approvalPath}`);
const approvals = validateApprovals(JSON.parse(readFileSync(approvalPath, "utf8")), auditRows);
for (let offset = 0; offset < approvals.length; offset += 100) {
  const batch = db.batch();
  for (const approval of approvals.slice(offset, offset + 100)) {
    batch.update(db.collection("companies").doc(approval.companyId), { countryCode: approval.countryCode });
  }
  await batch.commit();
}
writeFileSync(resolve(outputDir, "applied-approved.json"), stableJson(approvals), "utf8");
console.log(`Application staging terminée: ${approvals.length} champ(s) countryCode uniquement.`);
