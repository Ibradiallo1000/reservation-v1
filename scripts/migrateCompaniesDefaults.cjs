// scripts/migrateCompaniesDefaults.cjs
// Exécute : node scripts/migrateCompaniesDefaults.cjs
// Met à jour TOUTES les compagnies pour ajouter les champs par défaut manquants.

const admin = require('firebase-admin');
const sa = require('../serviceAccountKey.json'); // <- adapte si nécessaire

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}
const db = admin.firestore();

const DEFAULTS = {
  publicVisible: true,            // <<< important pour les règles
  status: 'actif',
  plan: 'free',
  accroche: 'Réservez votre trajet en un clic',
  themeStyle: 'moderne',
  police: 'sans-serif',
  couleurPrimaire: '#a81a1a',
  couleurSecondaire: '#fc8505',
  couleurAccent: '#f6f3f0',
  couleurTertiaire: '#000000',
  showContactForm: true,
  showLegalLinks: true,
  showSocialMedia: true,
  showTestimonials: true,
  updatedAt: admin.firestore.FieldValue.serverTimestamp(),
};

(async () => {
  console.log('⏳ Lecture des compagnies…');
  const snap = await db.collection('companies').get();
  console.log(`📦 ${snap.size} compagnie(s) trouvée(s)`);

  let batch = db.batch();
  let countInBatch = 0;
  let touched = 0;

  snap.forEach(doc => {
    const data = doc.data() || {};
    // On n’écrase PAS les valeurs existantes : on ajoute uniquement si manquant
    const patch = {};
    for (const [k, v] of Object.entries(DEFAULTS)) {
      if (!(k in data)) patch[k] = v;
    }
    if (Object.keys(patch).length) {
      batch.set(doc.ref, patch, { merge: true });
      countInBatch++;
      touched++;
      if (countInBatch >= 400) {
        // commit partiel
        batch.commit();
        batch = db.batch();
        countInBatch = 0;
      }
    }
  });

  if (countInBatch > 0) {
    await batch.commit();
  }
  console.log(`✅ Migration terminée. Documents modifiés: ${touched}`);
  process.exit(0);
})().catch(err => {
  console.error('❌ Erreur migration:', err);
  process.exit(1);
});
