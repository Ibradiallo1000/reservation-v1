/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

/* -------------------------------------------------------
   Helpers
------------------------------------------------------- */

async function commitInChunks(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>) {
  const CHUNK = 450;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

function assertAuthenticated(ctx: functions.https.CallableContext) {
  if (!ctx.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
  }
}

function assertCompanyAdmin(ctx: functions.https.CallableContext) {
  assertAuthenticated(ctx);
  const role = String((ctx.auth!.token as any)?.role || "").toLowerCase();
  // autorise admin_platforme ou admin_compagnie
  if (!(role === "admin_platforme" || role === "admin compagnie" || role === "admin_compagnie")) {
    throw new functions.https.HttpsError("permission-denied", "Rôle admin_compagnie (ou admin_platforme) requis.");
  }
}

function assertPlatformAdmin(ctx: functions.https.CallableContext) {
  assertAuthenticated(ctx);
  const role = String((ctx.auth!.token as any)?.role || "").toLowerCase();
  if (!(role === "admin_platforme" || role === "admin plateforme")) {
    throw new functions.https.HttpsError("permission-denied", "Rôle admin_platforme requis.");
  }
}

async function deleteStoragePrefix(bucketName: string, prefix: string) {
  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  if (!files.length) return;
  await Promise.all(
    files.map((f) => f.delete().catch((e) => functions.logger.warn("storage delete fail", f.name, e)))
  );
}

/* -------------------------------------------------------
   1) validateEmail (CALLABLE)
   - Vérifie si un email existe déjà dans Firebase Auth
------------------------------------------------------- */
export const validateEmail = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    try {
      assertAuthenticated(context);
      const email = String(data?.email || "").trim().toLowerCase();
      if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "email manquant.");
      }
      try {
        await auth.getUserByEmail(email);
        // s’il existe
        return { ok: false, exists: true };
      } catch (e: any) {
        if (e?.code === "auth/user-not-found") {
          return { ok: true, exists: false };
        }
        throw e;
      }
    } catch (err: any) {
      functions.logger.error("validateEmail FAILED", err);
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", "validateEmail failed");
    }
  });

/* -------------------------------------------------------
   2) companyCreateAgencyCascade (CALLABLE)
   - Crée l’agence dans companies/{companyId}/agences
   - Crée le chef d’agence dans Auth + doc users/{uid}
   - Retourne un lien de réinitialisation de mot de passe
------------------------------------------------------- */
export const companyCreateAgencyCascade = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data, context) => {
    const start = Date.now();
    functions.logger.info("companyCreateAgencyCascade call", { data, uid: context.auth?.uid });

    try {
      assertCompanyAdmin(context);

      const companyId = String(data?.companyId || "").trim();
      if (!companyId) {
        throw new functions.https.HttpsError("invalid-argument", "companyId manquant.");
      }

      const agency = (data?.agency || {}) as {
        nomAgence: string; ville: string; pays: string; quartier?: string; type?: string;
        statut?: "active" | "inactive"; latitude?: number | null; longitude?: number | null;
      };

      const manager = (data?.manager || {}) as {
        name: string; email: string; phone?: string; role?: string;
      };

      if (!agency.nomAgence || !agency.ville || !agency.pays) {
        throw new functions.https.HttpsError("invalid-argument", "Champs agence requis manquants.");
      }
      if (!manager.email || !manager.name) {
        throw new functions.https.HttpsError("invalid-argument", "Champs manager requis manquants.");
      }

      // 0) company existe ?
      const companyRef = db.doc(`companies/${companyId}`);
      const companySnap = await companyRef.get();
      if (!companySnap.exists) {
        throw new functions.https.HttpsError("not-found", "Compagnie inexistante.");
      }

      // 1) créer agence
      const agencesCol = companyRef.collection("agences");
      const agenceRef = agencesCol.doc();
      const agenceDoc = {
        nomAgence: agency.nomAgence,
        ville: agency.ville,
        pays: agency.pays,
        quartier: agency.quartier || "",
        type: agency.type || "",
        statut: agency.statut || "active",
        latitude: typeof agency.latitude === "number" ? agency.latitude : null,
        longitude: typeof agency.longitude === "number" ? agency.longitude : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await agenceRef.set(agenceDoc);

      // 2) créer chef d’agence (Auth)
      //    Si l’email existe déjà, on réutilise l’utilisateur
      let userRecord: admin.auth.UserRecord | null = null;
      try {
        userRecord = await auth.getUserByEmail(manager.email);
      } catch (e: any) {
        if (e?.code !== "auth/user-not-found") throw e;
      }
      if (!userRecord) {
        userRecord = await auth.createUser({
          email: manager.email,
          displayName: manager.name,
          phoneNumber: manager.phone && manager.phone.startsWith("+") ? manager.phone : undefined,
          emailVerified: false,
          disabled: false,
        });
      }

      // 3) claims / profil
      const uid = userRecord.uid;
      const role = "chefAgence";
      await auth.setCustomUserClaims(uid, {
        role,
        companyId,
        agencyId: agenceRef.id,
      });

      // 4) doc users/{uid}
      const userDoc = {
        email: manager.email,
        displayName: manager.name,
        role,
        companyId,
        agencyId: agenceRef.id,
        agencyName: agency.nomAgence,
        telephone: manager.phone || "",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await db.doc(`users/${uid}`).set(userDoc, { merge: true });

      // 5) lien de reset password
      const resetLink = await auth.generatePasswordResetLink(manager.email, {
        url: "https://monbillet-95b77.web.app/login", // adapte si tu as une autre URL
        handleCodeInApp: true,
      });

      functions.logger.info("companyCreateAgencyCascade done", {
        companyId,
        agencyId: agenceRef.id,
        uid,
        ms: Date.now() - start,
      });

      return { ok: true, agencyId: agenceRef.id, manager: { uid, resetLink } };
    } catch (err: any) {
      functions.logger.error("companyCreateAgencyCascade FAILED", err);
      if (err instanceof functions.https.HttpsError) throw err;
      // Exemple d’erreurs Auth courantes → surface des messages plus explicites
      if (typeof err?.code === "string" && err?.code.startsWith("auth/")) {
        throw new functions.https.HttpsError("failed-precondition", err.message || err.code);
      }
      throw new functions.https.HttpsError("internal", "companyCreateAgencyCascade failed");
    }
  });

/* -------------------------------------------------------
   3) companyDeleteAgencyCascade (CALLABLE)
   - Supprime l’agence + traite le staff (détacher / transférer / désactiver / supprimer)
------------------------------------------------------- */
export const companyDeleteAgencyCascade = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    try {
      assertCompanyAdmin(context);

      const { companyId, agencyId, staffAction, transferToAgencyId, allowDeleteUsers } = (data || {}) as {
        companyId?: string; agencyId?: string; staffAction?: "detach" | "transfer" | "disable" | "delete";
        transferToAgencyId?: string | null; allowDeleteUsers?: boolean;
      };
      if (!companyId || !agencyId) throw new functions.https.HttpsError("invalid-argument", "companyId/agencyId manquant.");

      const companyRef = db.doc(`companies/${companyId}`);
      const agRef = companyRef.collection("agences").doc(agencyId);
      const agSnap = await agRef.get();
      if (!agSnap.exists) return { ok: true, note: "already deleted" };

      // 1) staff lié à l’agence
      const usersSnap = await db.collection("users").where("agencyId", "==", agencyId).where("companyId", "==", companyId).get();
      const staffUids = usersSnap.docs.map((d) => d.id);

      // 2) action
      const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
      if (staffAction === "transfer") {
        if (!transferToAgencyId) throw new functions.https.HttpsError("invalid-argument", "transferToAgencyId manquant.");
        usersSnap.forEach((d) => {
          ops.push((b) => b.update(d.ref, { agencyId: transferToAgencyId, updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        });
      } else if (staffAction === "detach") {
        usersSnap.forEach((d) => {
          ops.push((b) => b.update(d.ref, { agencyId: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        });
      } else if (staffAction === "disable") {
        usersSnap.forEach((d) => {
          ops.push((b) => b.update(d.ref, { agencyId: admin.firestore.FieldValue.delete(), updatedAt: admin.firestore.FieldValue.serverTimestamp() }));
        });
        await Promise.all(staffUids.map((uid) => auth.updateUser(uid, { disabled: true }).catch((e) => functions.logger.warn("disable fail", uid, e))));
      } else if (staffAction === "delete" && allowDeleteUsers) {
        usersSnap.forEach((d) => ops.push((b) => b.delete(d.ref)));
        await Promise.all(staffUids.map((uid) =>
          auth.deleteUser(uid).catch((e: any) => {
            if (e?.code !== "auth/user-not-found") functions.logger.warn("delete user fail", uid, e);
          })
        ));
      }

      if (ops.length) await commitInChunks(ops);

      // 3) supprimer l’agence + éventuels sous-docs simples
      // (si tu as beaucoup de sous-collections, remplace par recursiveDelete)
      await agRef.delete();

      return {
        ok: true,
        staffCount: staffUids.length,
        transferred: staffAction === "transfer" ? staffUids : [],
        detached: staffAction === "detach" ? staffUids : [],
        disabled: staffAction === "disable" ? staffUids : [],
        deleted: staffAction === "delete" ? staffUids : [],
      };
    } catch (err: any) {
      functions.logger.error("companyDeleteAgencyCascade FAILED", err);
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", "companyDeleteAgencyCascade failed");
    }
  });

/* -------------------------------------------------------
   4) deleteCompany (tu avais déjà — je le garde)
------------------------------------------------------- */
export const deleteCompany = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    const start = Date.now();
    functions.logger.info("deleteCompany call", { data, uid: context.auth?.uid });

    try {
      assertPlatformAdmin(context);

      const { companyId, hard } = (data || {}) as { companyId?: string; hard?: boolean };
      if (!companyId) throw new functions.https.HttpsError("invalid-argument", "companyId manquant.");

      const companyRef = db.doc(`companies/${companyId}`);
      const companySnap = await companyRef.get();
      if (!companySnap.exists) {
        functions.logger.info("company not found, idempotent success", { companyId });
        return { ok: true, note: "already deleted" };
      }

      // 1) users
      const usersSnap = await db.collection("users").where("companyId", "==", companyId).get();
      const userOps: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
      const uids: string[] = [];
      usersSnap.docs.forEach((d) => {
        uids.push(d.id);
        userOps.push((b) => b.delete(d.ref));
      });

      const personnelSnap = await db.collection(`companies/${companyId}/personnel`).get();
      personnelSnap.docs.forEach((d) => userOps.push((b) => b.delete(d.ref)));
      if (userOps.length) await commitInChunks(userOps);

      await Promise.all(
        uids.map((uid) =>
          auth.deleteUser(uid).catch((e: any) => {
            if (e?.code !== "auth/user-not-found") {
              functions.logger.error("auth.deleteUser failed", { uid, err: e });
              throw e;
            }
          })
        )
      );

      // 2) collectionGroup clean
      const cgDeletes: Array<FirebaseFirestore.Query> = [
        db.collectionGroup("reservations").where("companyId", "==", companyId),
        db.collectionGroup("tickets").where("companyId", "==", companyId),
        db.collectionGroup("payments").where("companyId", "==", companyId),
        db.collectionGroup("logs").where("companyId", "==", companyId),
      ];
      for (const q of cgDeletes) {
        const snap = await q.get();
        const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
        snap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
        if (ops.length) await commitInChunks(ops);
      }

      // 3) subtree
      if (typeof (db as any).recursiveDelete === "function") {
        await (db as any).recursiveDelete(companyRef, { retries: 3 });
      } else {
        const subcolls = ["agences", "contacts", "personnel", "trajets", "horaires", "bus", "vehicles"];
        for (const c of subcolls) {
          const snap = await db.collection(`companies/${companyId}/${c}`).get();
          const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];
          snap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
          if (ops.length) await commitInChunks(ops);
        }
        await companyRef.delete();
      }

      // 4) Storage
      const bucketName = process.env.FUNCTIONS_EMULATOR
        ? "monbillet-95b77.appspot.com"
        : admin.storage().bucket().name;
      await deleteStoragePrefix(bucketName, `companies/${companyId}/`);

      functions.logger.info("deleteCompany done", { companyId, ms: Date.now() - start, hard: !!hard });
      return { ok: true, hard: !!hard };
    } catch (err: any) {
      functions.logger.error("deleteCompany FAILED", { err: err?.message || err, stack: err?.stack });
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", "deleteCompany failed");
    }
  });
