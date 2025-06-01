const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert("./firebase-admin-key.json"),
});

const uid = "UYuGxmTSwpYzomxaOcI1AX9Vf033"; // 👈 Ton UID confirmé

const customClaims = {
  role: "admin_compagnie",
  companyId: "RcPWBULsk6byHmNoQUf319ptkYN2"
};

admin
  .auth()
  .setCustomUserClaims(uid, customClaims)
  .then(() => {
    console.log("✅ Claims ajoutés avec succès pour UID:", uid);
  })
  .catch((error) => {
    console.error("❌ Erreur lors de l’ajout des claims:", error);
  });
