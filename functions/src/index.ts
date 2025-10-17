/* eslint-disable @typescript-eslint/no-explicit-any */
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

/* -------------------------------------------------------
   Config
------------------------------------------------------- */
const APP_RESET_URL =
  process.env.APP_RESET_URL ||
  (functions.config()?.app?.reset_url as string) ||
  "https://monbillet-95b77.web.app/login";

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

function roleOf(ctx: functions.https.CallableContext) {
  return String(((ctx.auth?.token as any)?.role || "")).toLowerCase().trim();
}
function isPlatform(ctx: functions.https.CallableContext) {
  const t = (ctx.auth?.token as any) || {};
  return roleOf(ctx) === "admin_platforme" || t.admin === true;
}

function assertPlatformAdmin(ctx: functions.https.CallableContext) {
  assertAuthenticated(ctx);
  if (!isPlatform(ctx)) {
    throw new functions.https.HttpsError("permission-denied", "Rôle admin_platforme requis.");
  }
}

/** Vérifie que l’appelant a le droit d’agir sur companyId (platforme ou admin_compagnie de cette companyId) */
function assertCompanyScope(ctx: functions.https.CallableContext, companyId: string) {
  assertAuthenticated(ctx);
  const t = (ctx.auth!.token as any) || {};
  const role = String(t.role || "").toLowerCase().trim();
  const sameCompany = String(t.companyId || "") === companyId;
  const isCompanyAdmin = (role === "admin_compagnie" || role === "admin compagnie") && sameCompany;
  if (!(isPlatform(ctx) || isCompanyAdmin)) {
    throw new functions.https.HttpsError("permission-denied", "Portée compagnie invalide.");
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

function normalizeEmail(s?: string) {
  return String(s || "").trim().toLowerCase();
}
function normalizePhone(p?: string) {
  return (p || "").replace(/\s+/g, "");
}
function slugify(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function setClaims(uid: string, claims: Record<string, any>) {
  try {
    await auth.setCustomUserClaims(uid, claims);
  } catch (e) {
    functions.logger.warn("setCustomUserClaims fail", uid, e);
  }
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
      const email = normalizeEmail(data?.email);
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
   - Assigne claims { role:'chefAgence', companyId, agencyId }
   - Retourne un lien de réinitialisation de mot de passe + mustRefreshToken
------------------------------------------------------- */
export const companyCreateAgencyCascade = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data, context) => {
    const start = Date.now();
    functions.logger.info("companyCreateAgencyCascade call", { data, uid: context.auth?.uid });

    try {
      const companyId = String(data?.companyId || "").trim();
      if (!companyId) {
        throw new functions.https.HttpsError("invalid-argument", "companyId manquant.");
      }
      assertCompanyScope(context, companyId);

      const agency = (data?.agency || {}) as {
        nomAgence: string;
        ville: string;
        pays: string;
        quartier?: string;
        type?: string;
        statut?: "active" | "inactive";
        latitude?: number | null;
        longitude?: number | null;
      };

      const manager = (data?.manager || {}) as {
        name: string;
        email: string;
        phone?: string;
        role?: string; // ignoré, on force chefAgence
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
      const agenceRef = agencesCol.doc(); // id auto
      const agenceDoc = {
        nomAgence: agency.nomAgence,
        slug: slugify(agency.nomAgence),
        ville: agency.ville,
        villeNorm: agency.ville.trim().toLowerCase(),
        pays: agency.pays,
        paysNorm: agency.pays.trim().toLowerCase(),
        quartier: agency.quartier || "",
        type: agency.type || "",
        statut: agency.statut || "active",
        latitude: typeof agency.latitude === "number" ? agency.latitude : null,
        longitude: typeof agency.longitude === "number" ? agency.longitude : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await agenceRef.set(agenceDoc);

      // 2) créer/récupérer chef d’agence (Auth)
      const email = normalizeEmail(manager.email);
      const phone = normalizePhone(manager.phone);
      let userRecord: admin.auth.UserRecord | null = null;
      try {
        userRecord = await auth.getUserByEmail(email);
      } catch (e: any) {
        if (e?.code !== "auth/user-not-found") throw e;
      }
      if (!userRecord) {
        userRecord = await auth.createUser({
          email,
          displayName: manager.name,
          phoneNumber: phone && phone.startsWith("+") ? phone : undefined,
          emailVerified: false,
          disabled: false,
        });
      }

      // 3) gérer conflits de rattachement (si user avait déjà d’autres claims agence)
      const uid = userRecord.uid;
      const existing = await auth.getUser(uid);
      const c = (existing.customClaims || {}) as any;
      if (c.agencyId && (c.agencyId !== agenceRef.id || c.companyId !== companyId)) {
        // Politique par défaut : on bloque (évite d’écraser des responsabilités ailleurs)
        throw new functions.https.HttpsError(
          "failed-precondition",
          "Cet utilisateur est déjà rattaché à une autre agence. Détache/transfer avant."
        );
      }

      // 4) claims / profil
      const role = "chefAgence";
      await auth.setCustomUserClaims(uid, {
        role,
        companyId,
        agencyId: agenceRef.id,
      });

      const userDoc = {
        email,
        displayName: manager.name,
        role,
        companyId,
        agencyId: agenceRef.id,
        agencyName: agency.nomAgence,
        telephone: phone || "",
        status: "actif",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      await db.doc(`users/${uid}`).set(userDoc, { merge: true });

      // 5) lien de reset password
      const resetLink = await auth.generatePasswordResetLink(email, {
        url: APP_RESET_URL,
        handleCodeInApp: true,
      });

      functions.logger.info("companyCreateAgencyCascade done", {
        companyId,
        agencyId: agenceRef.id,
        uid,
        ms: Date.now() - start,
      });

      // mustRefreshToken: le client devra rafraîchir son token après connexion
      return { ok: true, agencyId: agenceRef.id, manager: { uid, resetLink }, mustRefreshToken: true };
    } catch (err: any) {
      functions.logger.error("companyCreateAgencyCascade FAILED", err);
      if (err instanceof functions.https.HttpsError) throw err;
      if (typeof err?.code === "string" && err?.code.startsWith("auth/")) {
        throw new functions.https.HttpsError("failed-precondition", err.message || err.code);
      }
      throw new functions.https.HttpsError("internal", "companyCreateAgencyCascade failed");
    }
  });

/* -------------------------------------------------------
   3) companyDeleteAgencyCascade (CALLABLE)
   - Supprime l’agence + traite le staff (détacher / transférer / désactiver / supprimer)
   - Met à jour aussi les custom claims selon l’action
------------------------------------------------------- */
export const companyDeleteAgencyCascade = functions
  .region("europe-west1")
  .runWith({ timeoutSeconds: 540, memory: "1GB" })
  .https.onCall(async (data, context) => {
    try {
      const { companyId, agencyId, staffAction, transferToAgencyId, allowDeleteUsers } = (data || {}) as {
        companyId?: string;
        agencyId?: string;
        staffAction?: "detach" | "transfer" | "disable" | "delete";
        transferToAgencyId?: string | null;
        allowDeleteUsers?: boolean;
      };
      if (!companyId || !agencyId)
        throw new functions.https.HttpsError("invalid-argument", "companyId/agencyId manquant.");
      assertCompanyScope(context, companyId);

      const companyRef = db.doc(`companies/${companyId}`);
      const agRef = companyRef.collection("agences").doc(agencyId);
      const agSnap = await agRef.get();
      if (!agSnap.exists) return { ok: true, note: "already deleted" };

      // 1) staff lié à l’agence
      const usersSnap = await db
        .collection("users")
        .where("agencyId", "==", agencyId)
        .where("companyId", "==", companyId)
        .get();
      const staffUids = usersSnap.docs.map((d) => d.id);

      // 2) action (Firestore + claims + Auth)
      const ops: Array<(b: FirebaseFirestore.WriteBatch) => void> = [];

      if (staffAction === "transfer") {
        if (!transferToAgencyId)
          throw new functions.https.HttpsError("invalid-argument", "transferToAgencyId manquant.");
        usersSnap.forEach((d) =>
          ops.push((b) =>
            b.update(d.ref, {
              agencyId: transferToAgencyId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          )
        );
        await Promise.all(
          staffUids.map(async (uid) => {
            const current = await auth.getUser(uid);
            await setClaims(uid, { ...(current.customClaims || {}), companyId, agencyId: transferToAgencyId });
          })
        );
      } else if (staffAction === "detach") {
        usersSnap.forEach((d) =>
          ops.push((b) =>
            b.update(d.ref, {
              agencyId: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          )
        );
        await Promise.all(
          staffUids.map(async (uid) => {
            const current = await auth.getUser(uid);
            const cc = { ...(current.customClaims || {}) };
            delete (cc as any).agencyId;
            await setClaims(uid, cc);
          })
        );
      } else if (staffAction === "disable") {
        usersSnap.forEach((d) =>
          ops.push((b) =>
            b.update(d.ref, {
              agencyId: admin.firestore.FieldValue.delete(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            })
          )
        );
        await Promise.all(
          staffUids.map(async (uid) => {
            const current = await auth.getUser(uid);
            const cc = { ...(current.customClaims || {}) };
            delete (cc as any).agencyId;
            await setClaims(uid, cc);
            await auth.updateUser(uid, { disabled: true }).catch((e) => functions.logger.warn("disable fail", uid, e));
          })
        );
      } else if (staffAction === "delete" && allowDeleteUsers) {
        usersSnap.forEach((d) => ops.push((b) => b.delete(d.ref)));
        await Promise.all(
          staffUids.map((uid) =>
            auth.deleteUser(uid).catch((e: any) => {
              if (e?.code !== "auth/user-not-found") functions.logger.warn("delete user fail", uid, e);
            })
          )
        );
      }

      if (ops.length) await commitInChunks(ops);

      // 3) supprimer l’agence (récursif)
      if (typeof (db as any).recursiveDelete === "function") {
        await (db as any).recursiveDelete(agRef, { retries: 3 });
      } else {
        await agRef.delete();
      }

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
   4) deleteCompany
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
