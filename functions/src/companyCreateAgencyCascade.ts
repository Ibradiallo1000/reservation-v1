// functions/src/companyCreateAgencyCascade.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

// util
const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");

export const companyCreateAgencyCascade = functions.https.onCall(async (data, context) => {
  // sécurité : vérifier que l'appelant est authentifié et a le droit (ex. rôle admin_compagnie)
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Not authenticated");
  }
  // Optionnel : vérifier les custom claims du caller
  const callerClaims = context.auth.token || {};
  // if (!callerClaims.companyId) { ... }

  const { companyId, agence, manager } = data || {};
  if (!companyId || !agence || !manager || !manager.email) {
    throw new functions.https.HttpsError("invalid-argument", "Données manquantes");
  }

  const db = admin.firestore();

  try {
    // 1) create agency doc under companies/{companyId}/agences
    const agenceDocRef = db.collection("companies").doc(companyId).collection("agences").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();
    const agencePayload = {
      companyId,
      nomAgence: agence.nomAgence || "",
      nomAgenceNorm: (agence.nomAgence || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
      ville: agence.ville || "",
      villeNorm: (agence.ville || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
      pays: agence.pays || "",
      paysNorm: (agence.pays || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase(),
      slug: slugify(agence.nomAgence || ""),
      quartier: agence.quartier || "",
      type: agence.type || "",
      statut: agence.statut || "active",
      latitude: agence.latitude ?? null,
      longitude: agence.longitude ?? null,
      createdAt: now,
      createdBy: context.auth.uid || null,
    };
    await agenceDocRef.set(agencePayload, { merge: true });

    // 2) create or get user for manager
    const managerEmail = (manager.email || "").trim().toLowerCase();
    let userRecord: admin.auth.UserRecord | null = null;
    try {
      userRecord = await admin.auth().getUserByEmail(managerEmail);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        // create
        userRecord = await admin.auth().createUser({
          email: managerEmail,
          displayName: manager.name || managerEmail,
          phoneNumber: manager.phone || undefined,
          emailVerified: false,
        });
      } else {
        throw err;
      }
    }

    // 3) set custom claims: companyId, agencyId, role
    const customClaims = {
      ...(userRecord.customClaims || {}),
      companyId,
      agencyId: agenceDocRef.id,
      role: manager.role || "chefAgence",
    };
    await admin.auth().setCustomUserClaims(userRecord.uid, customClaims);

    // 4) write an "invite" or record for traceability
    const inviteRef = db.collection("invites").doc();
    await inviteRef.set({
      email: managerEmail,
      name: manager.name || "",
      phone: manager.phone || "",
      role: manager.role || "chefAgence",
      companyId,
      agencyId: agenceDocRef.id,
      status: "accepted",
      createdAt: now,
      createdBy: context.auth.uid || null,
      userUid: userRecord.uid,
    });

    // 5) generate password reset link (to send to manager)
    const resetLink = await admin.auth().generatePasswordResetLink(managerEmail, {
        url: ""
    });

    // Return structured success
    return {
      success: true,
      agencyId: agenceDocRef.id,
      uid: userRecord.uid,
      resetLink,
      message: "Agence créée et utilisateur gérant prêt.",
    };
  } catch (err: any) {
    console.error("companyCreateAgencyCascade error:", err);
    // Map known admin errors to HttpsError friendly messages
    if (err?.code && typeof err.code === "string") {
      // firebase-admin error codes usually like auth/...
      throw new functions.https.HttpsError("internal", err.message || String(err));
    }
    throw new functions.https.HttpsError("internal", "Erreur interne lors de la création de l'agence");
  }
});
