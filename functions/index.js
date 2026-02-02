const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

// -----------------------------------------------------
// 1) USER CREATE → crée /users/{uid}
// -----------------------------------------------------
exports.onUserCreate = functions.auth.user().onCreate(async (user) => {
  const uid = user.uid;
  const db = admin.firestore();
  const now = admin.firestore.FieldValue.serverTimestamp();

  try {
    await db.doc(`users/${uid}`).set(
      {
        uid,
        email: user.email || null,
        displayName: user.displayName || "",
        phoneNumber: user.phoneNumber || "",
        role: "user",
        status: "active",
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );
  } catch (e) {
    console.error("onUserCreate error:", e);
  }
});

// -----------------------------------------------------
// 2) CREATE AGENCY CASCADE (CALLABLE)
// -----------------------------------------------------
exports.companyCreateAgencyCascade = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "Vous devez être connecté."
      );
    }

    const uid = context.auth.uid;

    const companyId = data?.companyId;
    const agence = data?.agence;
    const manager = data?.manager;

    if (!companyId) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "companyId obligatoire"
      );
    }
    if (!agence || !agence.nomAgence) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "agence.nomAgence obligatoire"
      );
    }
    if (!manager || !manager.email) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "manager.email obligatoire"
      );
    }

    const db = admin.firestore();
    const now = admin.firestore.FieldValue.serverTimestamp();

    try {
      // 1) Créer agence
      const agenceRef = db
        .collection(`companies/${companyId}/agences`)
        .doc();

      const agencePayload = {
        nomAgence: agence.nomAgence,
        ville: agence.ville || "",
        pays: agence.pays || "",
        quartier: agence.quartier || "",
        type: agence.type || "",
        latitude: agence.latitude || null,
        longitude: agence.longitude || null,
        statut: "active",
        createdAt: now,
        updatedAt: now,
        createdBy: uid,
      };

      await agenceRef.set(agencePayload);

      // 2) Créer utilisateur gérant
      const userRecord = await admin.auth().createUser({
        email: manager.email,
        displayName: manager.name,
        phoneNumber: manager.phone || undefined,
      });

      await db.doc(`users/${userRecord.uid}`).set(
        {
          uid: userRecord.uid,
          email: manager.email,
          role: "chefAgence",
          companyId,
          agencyId: agenceRef.id,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );

      return {
        success: true,
        agencyId: agenceRef.id,
        uid: userRecord.uid,
      };
    } catch (e) {
      console.error("companyCreateAgencyCascade error:", e);
      throw new functions.https.HttpsError(
        "internal",
        "Erreur interne lors de la création"
      );
    }
  });
