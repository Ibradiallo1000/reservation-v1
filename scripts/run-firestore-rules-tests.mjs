import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const testDir = join(process.cwd(), "tests", "firestore");
const tests = readdirSync(testDir)
  .filter((file) => file.endsWith(".rules.test.cjs"))
  .sort((a, b) => a.localeCompare(b));

if (tests.length === 0) {
  console.error("Aucun test Firestore Rules trouve dans tests/firestore.");
  process.exit(1);
}

const results = [];

function runTest(file) {
  const relativePath = join("tests", "firestore", file);

  console.log(`\n=== Firestore Rules test: ${relativePath} ===`);

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [relativePath], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
    });

    child.on("close", (code) => {
      resolve({ file, code: code ?? 1 });
    });
  });
}

for (const file of tests) {
  const result = await runTest(file);
  results.push(result);

  if (result.code !== 0) {
    console.error(`\nECHEC Firestore Rules: ${file} (code ${result.code})`);
    console.error(`Tests reussis avant echec: ${results.length - 1}/${tests.length}`);
    process.exit(result.code);
  }
}

console.log("\n=== Resume Firestore Rules ===");
for (const result of results) {
  console.log(`OK ${result.file}`);
}
console.log(`Tous les tests Firestore Rules ont reussi: ${results.length}/${tests.length}`);
