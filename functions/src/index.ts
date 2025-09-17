// functions/src/index.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

type Role =
  | "admin_platforme"
  | "admin_compagnie"
  | "chefAgence"
  | "guichetier"
  | "comptable"
  | "superviseur"
  | "agentCourrier"
  | "user";

const db = admin.firestore();

// Vérifie que l’appelant est admin plateforme OU admin_compagnie de la company donnée.
function assertCompanyAdmin(ctx: functions.https.CallableContext, companyId?: string) {
  if (!ctx.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
  }
  const tk = ctx.auth.token as any;
  const isPlatform = tk.role === "admin_platforme";
  if (isPlatform) return;
  if (!companyId) {
    throw new functions.https.HttpsError("permission-denied", "Accès refusé.");
  }
  const isCompanyAdmin = tk.role === "admin_compagnie" && tk.companyId === companyId;
  if (!isCompanyAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Accès refusé.");
  }
}

// Commit des écritures par tranches (évite la limite 500 writes/batch)
async function commitInChunks(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>) {
  const CHUNK = 450; // marge
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

// Suppression CASCADE d'un utilisateur :
// - Auth
// - /users/{uid}
// - /companies/{companyId}/personnel/{uid} si connu
// - toutes les occurrences dans collectionGroup("staff") = /companies/*/agences/*/staff/{uid}
export const adminDeleteUserCascade = functions.https.onCall(async (data, context) => {
  const { uid } = (data || {}) as { uid?: string };
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "UID manquant.");
  }

  // Récupération du doc user pour connaître la company
  const userDocRef = db.doc(`users/${uid}`);
  const userSnap = await userDocRef.get();
  const udata = userSnap.exists ? (userSnap.data() as any) : null;
  const companyId: string | undefined = udata?.companyId;

  // Droit : plateforme ou admin_compagnie de CETTE company
  if (companyId) {
    assertCompanyAdmin(context, companyId);
  } else {
    if (context.auth?.token?.role !== "admin_platforme") {
      throw new functions.https.HttpsError(
        "permission-denied",
        "Seul l'admin plateforme peut supprimer cet utilisateur (sans companyId)."
      );
    }
  }

  const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];

  // /users/{uid}
  if (userSnap.exists) {
    ops.push((b) => b.delete(userDocRef));
  }

  // /companies/{companyId}/personnel/{uid}
  if (companyId) {
    const personnelRef = db.doc(`companies/${companyId}/personnel/${uid}`);
    const persSnap = await personnelRef.get();
    if (persSnap.exists) {
      ops.push((b) => b.delete(personnelRef));
    }
  }

  // /companies/*/agences/*/staff/{uid} — via collectionGroup("staff")
  const staffOcc = await db.collectionGroup("staff").where("uid", "==", uid).get();
  staffOcc.docs.forEach((d) => {
    // Si tu veux restreindre à une seule company :
    // if (companyId) {
    //   const prefix = `companies/${companyId}/agences/`;
    //   if (!d.ref.path.includes(prefix)) return;
    // }
    ops.push((b) => b.delete(d.ref));
  });

  // 1) Nettoyage Firestore
  if (ops.length) {
    await commitInChunks(ops);
  }

  // 2) Suppression Auth à la fin
  try {
    await admin.auth().deleteUser(uid);
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") {
      throw new functions.https.HttpsError("internal", "Suppression Auth échouée.");
    }
  }

  return { ok: true };
});

// Soft delete : désactiver le compte Auth et marquer users/{uid}.status="disabled"
export const adminDisableUser = functions.https.onCall(async (data, context) => {
  const { uid } = (data || {}) as { uid?: string };
  if (!uid) throw new functions.https.HttpsError("invalid-argument", "UID manquant.");

  const snap = await db.doc(`users/${uid}`).get();
  const companyId = (snap.data() as any)?.companyId as string | undefined;

  if (companyId) {
    assertCompanyAdmin(context, companyId);
  } else if (context.auth?.token?.role !== "admin_platforme") {
    throw new functions.https.HttpsError(
      "permission-denied",
      "Seul l'admin plateforme peut désactiver cet utilisateur."
    );
  }

  // Auth
  try {
    await admin.auth().updateUser(uid, { disabled: true });
  } catch (err: any) {
    if (err?.code !== "auth/user-not-found") {
      throw new functions.https.HttpsError("internal", "Désactivation Auth échouée.");
    }
  }

  // Firestore
  await db.doc(`users/${uid}`).set(
    { status: "disabled", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );

  return { ok: true };
});
