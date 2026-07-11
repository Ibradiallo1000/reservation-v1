import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");
const templatePath = resolve(rootDir, "public", "firebase-messaging-sw.template.js");
const outputPath = resolve(rootDir, "public", "firebase-messaging-sw.js");

const mode = process.argv[2];
const requiredVariables = [
  "VITE_FIREBASE_API_KEY",
  "VITE_FIREBASE_AUTH_DOMAIN",
  "VITE_FIREBASE_PROJECT_ID",
  "VITE_FIREBASE_STORAGE_BUCKET",
  "VITE_FIREBASE_MESSAGING_SENDER_ID",
  "VITE_FIREBASE_APP_ID",
];

function removeOutput() {
  rmSync(outputPath, { force: true });
}

function fail(message) {
  removeOutput();
  console.error(message);
  process.exit(1);
}

removeOutput();

if (!mode) {
  fail("Firebase Messaging SW: mode Vite manquant.");
}

if (!existsSync(templatePath)) {
  fail("Firebase Messaging SW: template introuvable.");
}

const env = loadEnv(mode, rootDir, "");
const missingVariables = requiredVariables.filter((name) => !env[name]?.trim());

if (missingVariables.length > 0) {
  fail(`Firebase Messaging SW: variables manquantes: ${missingVariables.join(", ")}`);
}

const projectId = env.VITE_FIREBASE_PROJECT_ID.trim();

if (mode === "staging" && projectId !== "teliya-staging") {
  fail("Firebase Messaging SW: le mode staging doit utiliser le projet teliya-staging.");
}

let content = readFileSync(templatePath, "utf8");

for (const name of requiredVariables) {
  content = content.replaceAll(`__${name}__`, env[name].trim());
}

const unresolvedMarkers = content.match(/__VITE_[A-Z0-9_]+__/g);
if (unresolvedMarkers) {
  fail(`Firebase Messaging SW: marqueurs non resolus: ${[...new Set(unresolvedMarkers)].join(", ")}`);
}

writeFileSync(outputPath, content, "utf8");
console.log(`Firebase Messaging SW genere pour le projet : ${projectId}`);
