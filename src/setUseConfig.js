"use strict";
// setUserClaims.js
const admin = require("firebase-admin");
// Initialise Firebase Admin (nécessite GOOGLE_APPLICATION_CREDENTIALS)
admin.initializeApp({
    credential: admin.credential.applicationDefault(),
});
// 👉 Remplace ici par l'UID réel + infos de la compagnie / agence
const uid = "REMPLACE_PAR_L_UID_UTILISATEUR";
const customClaims = {
    role: "guichetier", // ou chefAgence, admin, etc.
    companyId: "ID_DE_LA_COMPAGNIE",
    agencyId: "ID_DE_L_AGENCE"
};
admin
    .auth()
    .setCustomUserClaims(uid, customClaims)
    .then(() => {
    console.log("✅ Claims ajoutés avec succès pour UID:", uid);
})
    .catch((error) => {
    console.error("❌ Erreur lors de l'ajout des claims:", error);
});
