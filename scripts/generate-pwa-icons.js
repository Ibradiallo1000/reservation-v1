import sharp from "sharp";
import { existsSync } from "fs";

const input = "public/splash.png"; // image source
if (!existsSync(input)) {
  console.error("❌ splash.png introuvable dans public/ !");
  process.exit(1);
}

Promise.all([
  sharp(input).resize(192, 192).toFile("public/icon-192.png"),
  sharp(input).resize(512, 512).toFile("public/icon-512.png")
])
  .then(() => console.log("✅ Icônes PWA générées : icon-192.png et icon-512.png"))
  .catch(err => console.error("❌ Erreur génération icônes PWA :", err));
