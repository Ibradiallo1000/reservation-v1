import sharp from "sharp";
import { existsSync, mkdirSync } from "fs";

const input = "public/splash.png";
const outputDir = "public/icons";

if (!existsSync(input)) {
  console.error("❌ splash.png introuvable dans public/ !");
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

const sizes = [
  { name: "splash-750x1334", width: 750, height: 1334 },
  { name: "splash-1242x2208", width: 1242, height: 2208 }
];

sizes.forEach(({ name, width, height }) => {
  sharp(input)
    .resize(width, height, { fit: "cover" })
    .toFile(`${outputDir}/${name}.png`)
    .then(() => console.log(`✅ Splash généré : ${name}.png`))
    .catch(err => console.error(`❌ Erreur génération ${name} :`, err));
});
