import sharp from "sharp";
import { existsSync } from "fs";

const input = "public/splash.png"; // ✅ ton logo actuel
const output = "public/favicon.ico";

if (!existsSync(input)) {
  console.error("❌ Le fichier public/splash.png est introuvable. Vérifie son emplacement.");
  process.exit(1);
}

Promise.all([
  sharp(input).resize(16, 16).toFile("public/favicon-16.png"),
  sharp(input).resize(32, 32).toFile("public/favicon-32.png"),
  sharp(input).resize(48, 48).toFile("public/favicon-48.png"),
  sharp(input).resize(64, 64).toFile("public/favicon-64.png"),
  sharp(input).resize(32, 32).toFile(output)
])
  .then(() => console.log("✅ Favicons générés à partir de splash.png"))
  .catch(err => console.error("❌ Erreur génération favicon :", err));
