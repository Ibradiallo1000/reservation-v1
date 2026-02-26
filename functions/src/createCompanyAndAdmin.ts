import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// PAS d'initializeApp ici si tu l'as déjà fait dans index.ts
// if (!admin.apps.length) admin.initializeApp();

type Payload = {
  company: {
    nom: string;
    slug: string;
    email?: string | null;
    telephone?: string | null;
    pays?: string | null;
    planId: string;
  };
  admin: {
    nomComplet: string;
    email: string;
    telephone?: string | null;
  };
};

function assertString(v: unknown, name: string) {
  if (typeof v !== "string" || !v.trim()) {
    throw new functions.https.HttpsError("invalid-argument", `Champ invalide: ${name}`);
  }
}

export const createCompanyAndAdmin = functions
  .region("europe-west1")
  .https.onCall(async (data: Payload, context) => {
    // 1) Auth + rôle
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentification requise.");
    }
    const role = ((context.auth.token as any)?.role || "").toString().toLowerCase();
    if (!(role === "admin_platforme" || role === "admin plateforme")) {
      throw new functions.https.HttpsError("permission-denied", "Rôle admin_platforme requis.");
    }

    // 2) Validation minimale
    if (!data || !data.company || !data.admin) {
      throw new functions.https.HttpsError("invalid-argument", "Payload incomplet.");
    }
    assertString(data.company.nom, "company.nom");
    assertString(data.company.slug, "company.slug");
    assertString(data.company.planId, "company.planId");
    assertString(data.admin.nomComplet, "admin.nomComplet");
    assertString(data.admin.email, "admin.email");

    const db = admin.firestore();

    // 3) Lire le plan
    const planRef = db.collection("plans").doc(data.company.planId);
    const planSnap = await planRef.get();
    if (!planSnap.exists) {
      throw new functions.https.HttpsError("failed-precondition", "Plan introuvable.");
    }
    const p = planSnap.data() as any;
    // 4) Préparer refs
    const companyRef = db.collection("companies").doc();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const companyPayload = {
      nom: data.company.nom.trim(),
      slug: data.company.slug.trim(),
      email: data.company.email?.trim() || null,
      telephone: data.company.telephone?.trim() || null,
      pays: data.company.pays?.trim() || null,
      status: "actif" as const,

      // Plan fields (dual-revenue model)
      planId: data.company.planId,
      plan: String(p?.name ?? data.company.planId),
      publicPageEnabled: true,
      onlineBookingEnabled: true,
      guichetEnabled: true,

      digitalFeePercent: Number(p?.digitalFeePercent ?? 0),
      feeGuichet: Number(p?.feeGuichet ?? 0),
      minimumMonthly: Number(p?.minimumMonthly ?? 0),
      maxAgences: Number(p?.maxAgences ?? 0),
      supportLevel: String(p?.supportLevel ?? "basic"),
      planType: p?.isTrial ? "trial" : "paid",
      subscriptionStatus: p?.isTrial ? "trial" : "active",

      createdAt: now,
      updatedAt: now,
    };

    // 5) Créer l'utilisateur admin (Auth)
    //   - Mot de passe temporaire (on renverra un lien de reset)
    const tmpPassword =
      Math.random().toString(36).slice(-12) + "A!7"; // simple random + contraintes
    const userRecord = await admin.auth().createUser({
      email: data.admin.email.trim(),
      password: tmpPassword,
      displayName: data.admin.nomComplet.trim(),
      phoneNumber: data.admin.telephone?.trim() || undefined,
      emailVerified: false,
      disabled: false,
    });

    // 6) Claims: admin_compagnie + companyId
    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: "admin_compagnie",
      companyId: companyRef.id,
    });

    // 7) Docs Firestore users + personnel
    const userDocRef = db.collection("users").doc(userRecord.uid);
    const personnelRef = db
      .collection("companies")
      .doc(companyRef.id)
      .collection("personnel")
      .doc(userRecord.uid);

    const userPayload = {
      uid: userRecord.uid,
      email: userRecord.email,
      fullName: data.admin.nomComplet.trim(),
      phone: data.admin.telephone?.trim() || null,
      role: "admin_compagnie",
      companyId: companyRef.id,
      status: "actif",
      createdAt: now,
      updatedAt: now,
    };

    const personnelPayload = {
      uid: userRecord.uid,
      email: userRecord.email,
      fullName: data.admin.nomComplet.trim(),
      phone: data.admin.telephone?.trim() || null,
      role: "admin_compagnie",
      createdAt: now,
      updatedAt: now,
    };

    // 8) Transaction
    await db.runTransaction(async (tx) => {
      tx.set(companyRef, companyPayload);
      tx.set(userDocRef, userPayload);
      tx.set(personnelRef, personnelPayload);
    });

    // 9) Lien de reset password
    const resetLink = await admin.auth().generatePasswordResetLink(userRecord.email!);

    return {
      ok: true,
      companyId: companyRef.id,
      adminUid: userRecord.uid,
      adminEmail: userRecord.email,
      passwordResetLink: resetLink,
    };
  });
