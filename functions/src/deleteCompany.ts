import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

if (!admin.apps.length) admin.initializeApp();

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

async function commitInChunks(ops: Array<(b: FirebaseFirestore.WriteBatch) => void>) {
  const CHUNK = 450;
  for (let i = 0; i < ops.length; i += CHUNK) {
    const batch = db.batch();
    ops.slice(i, i + CHUNK).forEach((fn) => fn(batch));
    await batch.commit();
  }
}

function assertPlatformAdmin(ctx: functions.https.CallableContext) {
  if (!ctx.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
  }
  const role = String((ctx.auth.token as any)?.role || "").toLowerCase();
  if (!(role === "admin_platforme" || role === "admin plateforme")) {
    throw new functions.https.HttpsError("permission-denied", "Rôle admin_platforme requis.");
  }
}

async function deleteStoragePrefix(bucketName: string, prefix: string) {
  const bucket = storage.bucket(bucketName);
  const [files] = await bucket.getFiles({ prefix });
  if (!files.length) return;
  await Promise.all(files.map((f) => f.delete().catch((e) => functions.logger.warn("storage delete fail", f.name, e))));
}

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

      // 1) Users
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

      // 3) companies/{companyId} subtree
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
      // surface une HttpsError propre vers le client (sinon le navigateur affichera encore “CORS” générique)
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", "deleteCompany failed");
    }
  });
