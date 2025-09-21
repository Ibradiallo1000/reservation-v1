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

/* =========================
   DEFAULTS / MODÈLE ÉCO
========================= */
const COMPANY_DEFAULTS = {
  // Plan & quotas
  plan: "free" as "free" | "starter" | "pro" | "enterprise" | "manual",
  maxAgences: 1,
  maxUsers: 3,

  // Features
  guichetEnabled: true,
  onlineBookingEnabled: false,
  publicPageEnabled: false,

  // Tarifs
  commissionOnline: 0.02, // 2%
  feeGuichet: 100,        // FCFA / réservation guichet
  minimumMonthly: 25000,  // FCFA

  // État
  status: "actif" as "actif" | "suspendu",
};

/* =========================
   HELPERS SÉCURITÉ / BATCH
========================= */
// Vérifie que l’appelant est admin plateforme OU admin_compagnie de la company donnée.
function assertCompanyAdmin(ctx: functions.https.CallableContext, companyId?: string) {
  if (!ctx.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
  }
  const tk = ctx.auth.token as any;
  const role = (tk.role || "").toString().toLowerCase();

  if (role === "admin_platforme" || role === "admin plateforme") return;

  if (!companyId) {
    throw new functions.https.HttpsError("permission-denied", "Accès refusé.");
  }
  const isCompanyAdmin = role === "admin_compagnie" && tk.companyId === companyId;
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

/* =========================
   FONCTIONS EXISTANTES
========================= */
// Suppression CASCADE d'un utilisateur
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
    if ((context.auth?.token as any)?.role !== "admin_platforme") {
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
  } else if ((context.auth?.token as any)?.role !== "admin_platforme") {
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

/* =========================
   NOUVEAU : MIGRATION
========================= */
// Callable pour patcher TOUTES les compagnies (dry-run ou écriture)
export const migrateCompanies = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context) => {
    // --- Sécurité : admin plateforme uniquement ---
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Authentification nécessaire.");
    }
    const claims = context.auth.token as any;
    const role = (claims?.role || "").toString().toLowerCase();
    if (!(role === "admin_platforme" || role === "admin plateforme")) {
      throw new functions.https.HttpsError("permission-denied", "Rôle admin_platforme requis.");
    }

    const DRY = !!data?.dryRun; // dry-run: compte sans écrire
    const pageSize = 300;
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

    let scanned = 0, changed = 0, written = 0;

    while (true) {
      let ref = db.collection("companies")
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(pageSize);
      if (lastDoc) ref = ref.startAfter(lastDoc.id);

      const snap = await ref.get();
      if (snap.empty) break;

      const batch = db.batch();

      for (const docSnap of snap.docs) {
        scanned++;
        const d = (docSnap.data() || {}) as Record<string, any>;

        // patch idempotent: on n’écrase pas ce qui existe déjà
        const patch: Record<string, any> = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        for (const [k, v] of Object.entries(COMPANY_DEFAULTS)) {
          if (d[k] === undefined) patch[k] = v;
        }

        // Héritage depuis ancienne donnée si tu avais publicVisible + slug
        if (d.publicVisible === true && d.slug && d.publicPageEnabled === undefined) {
          patch.publicPageEnabled = true;
        }

        const keys = Object.keys(patch).filter((k) => k !== "updatedAt");
        if (keys.length) {
          changed++;
          if (!DRY) {
            batch.set(docSnap.ref, patch, { merge: true });
            written++;
          }
        }
      }

      if (!DRY && written) await batch.commit();
      lastDoc = snap.docs[snap.docs.length - 1];
      if (snap.size < pageSize) break;
    }

    return { ok: true, scanned, changed, written, dryRun: DRY };
  });

/* =========================
   NOUVEAU : onCreate company
========================= */
// Lorsqu’une nouvelle compagnie est créée, appliquer automatiquement les defaults manquants
export const onCompanyCreate = functions.firestore
  .document("companies/{companyId}")
  .onCreate(async (snap) => {
    const d = (snap.data() || {}) as Record<string, any>;
    const patch: Record<string, any> = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    for (const [k, v] of Object.entries(COMPANY_DEFAULTS)) {
      if (d[k] === undefined) patch[k] = v;
    }
    if (d.publicVisible === true && d.slug && d.publicPageEnabled === undefined) {
      patch.publicPageEnabled = true;
    }

    if (Object.keys(patch).length > 1) {
      await snap.ref.set(patch, { merge: true });
    }
  });
