import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import * as dns from "dns/promises";

admin.initializeApp();

const REGION = "europe-west1";

/* =========================
 * Types & constantes
 * ========================= */
type Role =
  | "admin_platforme"
  | "admin_compagnie"
  | "chefAgence"
  | "guichetier"
  | "agency_accountant"
  | "company_accountant"
  | "superviseur"
  | "agentCourrier"
  | "user";

type StaffAction = "detach" | "transfer" | "disable" | "delete";

const DISPOSABLE = new Set([
  "mailinator.com","tempmail.com","10minutemail.com","guerrillamail.com",
  "yopmail.com","throwawaymail.com","dispostable.com","getnada.com",
  "sharklasers.com","grr.la","maildrop.cc",
]);

/* =========================
 * Helpers généraux
 * ========================= */
function assertCompanyAdmin(ctx: functions.https.CallableContext, companyId: string) {
  if (!ctx.auth) throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
  const tk = ctx.auth.token as any;
  const isPlatform = tk.role === "admin_platforme";
  const isCompanyAdmin = tk.role === "admin_compagnie" && tk.companyId === companyId;
  if (!isPlatform && !isCompanyAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Accès refusé.");
  }
}

async function ensureMx(domain: string) {
  const mx = await dns.resolveMx(domain);
  if (!mx || mx.length === 0) throw new Error("No MX");
}

function isEmailFormat(email: string) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

const now = () => admin.firestore.FieldValue.serverTimestamp();

const normalizeNameKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
   .replace(/\s+/g, " ").trim().toLowerCase();

/* =========================================================
 * 1) VALIDATION EMAIL (format + MX + domaines jetables)
 * =======================================================*/
export const validateEmail = functions
  .region(REGION)
  .https.onCall(async (data, ctx) => {
    const { email } = data as { email: string };
    if (!email || !isEmailFormat(email)) {
      throw new functions.https.HttpsError("invalid-argument", "Format e-mail invalide.");
    }
    const domain = email.split("@")[1].toLowerCase();
    if (DISPOSABLE.has(domain)) {
      throw new functions.https.HttpsError("failed-precondition", "Domaine e-mail jetable refusé.");
    }
    try {
      await ensureMx(domain);
    } catch {
      throw new functions.https.HttpsError("failed-precondition", "Le domaine n'accepte pas de mails (MX absent).");
    }
    return { ok: true };
  });

/* =========================================================
 * UTIL: Crée (ou rattache) un user Auth + profils Firestore + indexs
 * - Idempotent: si l'e-mail existe déjà → réutilise le compte
 * =======================================================*/
async function createUserEverywhere(args: {
  companyId: string;
  attachAgencyId: string | null;
  name: string;
  email: string;
  phone?: string;
  role: Role;
}) {
  const { companyId, attachAgencyId, name, email, phone, role } = args;
  const auth = admin.auth();
  const db = admin.firestore();
  const companyRef = db.collection("companies").doc(companyId);

  let uid: string;
  let createdNew = false;

  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
  } catch (e: any) {
    if (e.code === "auth/user-not-found") {
      const u = await auth.createUser({
        email,
        displayName: name,
        emailVerified: false,
      });
      uid = u.uid;
      createdNew = true;
    } else {
      throw e;
    }
  }

  // Claims
  await auth.setCustomUserClaims(uid, {
    role,
    companyId,
    agencyId: attachAgencyId,
    email_verified: false,
  });
  await auth.revokeRefreshTokens(uid);

  // Firestore (merge pour idempotence)
  const batch = db.batch();
  batch.set(
    db.doc(`users/${uid}`),
    {
      uid,
      name,
      email,
      phone: phone ?? null,
      role,
      companyId,
      agencyId: attachAgencyId,
      status: "pending_verification",
      updatedAt: now(),
      ...(createdNew ? { createdAt: now() } : {}),
    },
    { merge: true }
  );

  batch.set(
    companyRef.collection("personnel").doc(uid),
    {
      uid,
      name,
      email,
      role,
      agencyId: attachAgencyId,
      updatedAt: now(),
      ...(createdNew ? { createdAt: now() } : {}),
    },
    { merge: true }
  );

  if (attachAgencyId) {
    batch.set(
      companyRef.collection("agences").doc(attachAgencyId).collection("staff").doc(uid),
      {
        uid,
        name,
        email,
        role,
        updatedAt: now(),
        ...(createdNew ? { createdAt: now() } : {}),
      },
      { merge: true }
    );
  }
  await batch.commit();

  const resetLink = await auth.generatePasswordResetLink(email);
  return { uid, resetLink, reusedExisting: !createdNew };
}

/* =========================================================
 * 2) CREATION AGENCE + CHEF (CASCADE, atomique côté serveur)
 * =======================================================*/
export const companyCreateAgencyCascade = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .https.onCall(async (data, ctx) => {
    const { companyId, agency, manager } = data as {
      companyId: string;
      agency: {
        nomAgence: string; ville: string; pays: string;
        quartier?: string; type?: string; statut?: "active"|"inactive";
        latitude?: number|null; longitude?: number|null;
      };
      manager: { name: string; email: string; phone?: string; role?: Role };
    };

    if (!companyId || !agency?.nomAgence || !agency?.ville || !agency?.pays || !manager?.email || !manager?.name) {
      throw new functions.https.HttpsError("invalid-argument", "Champs requis manquants.");
    }
    assertCompanyAdmin(ctx, companyId);

    if (!isEmailFormat(manager.email)) {
      throw new functions.https.HttpsError("invalid-argument", "Email manager invalide.");
    }

    const db = admin.firestore();
    const companyRef = db.collection("companies").doc(companyId);

    // Anti-doublon d’agence (insensible casse/espaces/accents)
    const nameKey = normalizeNameKey(agency.nomAgence);
    const dupSnap = await companyRef.collection("agences").where("nameKey", "==", nameKey).limit(1).get();
    if (!dupSnap.empty) {
      throw new functions.https.HttpsError("already-exists", "Une agence avec ce nom existe déjà dans cette compagnie.");
    }

    // Créer l'agence
    const agencyRef = companyRef.collection("agences").doc();
    const agencyId = agencyRef.id;

    try {
      await agencyRef.set({
        id: agencyId,
        nomAgence: agency.nomAgence,
        nameKey, // clé normalisée pour futures recherches
        ville: agency.ville,
        pays: agency.pays,
        quartier: agency.quartier ?? "",
        type: agency.type ?? "",
        statut: agency.statut ?? "active",
        latitude: agency.latitude ?? null,
        longitude: agency.longitude ?? null,
        createdAt: now(),
        updatedAt: now(),
        isHeadOffice: false,
      });

      // Créer le chef d'agence partout (idempotent)
      const created = await createUserEverywhere({
        companyId,
        attachAgencyId: agencyId,
        name: manager.name,
        email: manager.email,
        phone: manager.phone,
        role: manager.role ?? "chefAgence",
      });

      functions.logger.info("CreateAgencyCascade OK", { companyId, agencyId, managerEmail: manager.email, reusedExisting: created.reusedExisting });
      return { agencyId, manager: created };
    } catch (err: any) {
      // rollback simple si l'user a échoué
      try { await agencyRef.delete(); } catch {}
      functions.logger.error("CreateAgencyCascade FAILED", { companyId, error: err?.message || err });
      throw new functions.https.HttpsError("internal", "Echec création agence/manager.");
    }
  });

/* =========================================================
 * 3) UPDATE AGENCE + MANAGER
 * =======================================================*/
export const companyUpdateAgencyAndManager = functions
  .region(REGION)
  .https.onCall(async (data, ctx) => {
    const { companyId, agencyId, agencyPatch, managerPatch } = data as {
      companyId: string;
      agencyId: string;
      agencyPatch?: {
        nomAgence?: string; ville?: string; pays?: string;
        quartier?: string; type?: string; statut?: "active"|"inactive";
        latitude?: number|null; longitude?: number|null;
      };
      managerPatch?: {
        uid: string; name?: string; email?: string; phone?: string; role?: Role;
        moveToAgencyId?: string|null;
      };
    };
    if (!companyId || !agencyId) {
      throw new functions.https.HttpsError("invalid-argument", "companyId/agencyId requis.");
    }
    assertCompanyAdmin(ctx, companyId);

    const db = admin.firestore();
    const companyRef = db.collection("companies").doc(companyId);
    const agencyRef = companyRef.collection("agences").doc(agencyId);

    const batch = db.batch();

    // 1) Patch agence
    if (agencyPatch && Object.keys(agencyPatch).length) {
      const patch: any = { ...agencyPatch, updatedAt: now() };
      if (typeof agencyPatch.nomAgence === "string") {
        patch.nameKey = normalizeNameKey(agencyPatch.nomAgence);
      }
      batch.set(agencyRef, patch, { merge: true });
    }

    let resetLink: string | null = null;

    // 2) Patch manager
    if (managerPatch?.uid) {
      const { uid, name, email, phone, role, moveToAgencyId } = managerPatch;

      // Si move → vérifier existence de l’agence cible
      if (typeof moveToAgencyId !== "undefined" && moveToAgencyId) {
        const targetSnap = await companyRef.collection("agences").doc(moveToAgencyId).get();
        if (!targetSnap.exists) {
          throw new functions.https.HttpsError("not-found", "Agence cible introuvable pour le transfert.");
        }
      }

      // Lire ancien staff pour nettoyage
      const staffQuery = await db.collectionGroup("staff").where("uid","==",uid).get();

      // Auth updates
      const auth = admin.auth();
      const authUpdates: admin.auth.UpdateRequest = {};
      if (name) authUpdates.displayName = name;
      if (email) {
        if (!isEmailFormat(email)) throw new functions.https.HttpsError("invalid-argument", "Email invalide.");
        authUpdates.email = email;
      }
      if (Object.keys(authUpdates).length) {
        await auth.updateUser(uid, authUpdates);
      }

      // Claims
      const finalAgencyId = typeof moveToAgencyId !== "undefined" ? moveToAgencyId : agencyId;
      const newClaims: any = { companyId, agencyId: finalAgencyId };
      if (role) newClaims.role = role;
      await auth.setCustomUserClaims(uid, newClaims);
      await auth.revokeRefreshTokens(uid);

      // Firestore: /users
      const userDocRef = db.doc(`users/${uid}`);
      const userPatch: any = { updatedAt: now() };
      if (name) userPatch.name = name;
      if (email) userPatch.email = email;
      if (phone !== undefined) userPatch.phone = phone ?? null;
      if (role) userPatch.role = role;
      if (typeof moveToAgencyId !== "undefined") userPatch.agencyId = finalAgencyId;

      batch.set(userDocRef, userPatch, { merge: true });

      // /companies/{companyId}/personnel/{uid}
      const personnelRef = companyRef.collection("personnel").doc(uid);
      const persPatch: any = { updatedAt: now() };
      if (name) persPatch.name = name;
      if (email) persPatch.email = email;
      if (role) persPatch.role = role;
      if (typeof moveToAgencyId !== "undefined") persPatch.agencyId = finalAgencyId;
      batch.set(personnelRef, persPatch, { merge: true });

      // staff: supprimer occurrences, puis recréer
      staffQuery.docs.forEach((d) => batch.delete(d.ref));
      if (finalAgencyId) {
        batch.set(
          companyRef.collection("agences").doc(finalAgencyId).collection("staff").doc(uid),
          {
            uid,
            ...(name ? { name } : {}),
            ...(email ? { email } : {}),
            ...(role ? { role } : {}),
            updatedAt: now(),
            createdAt: now(),
          },
          { merge: true }
        );
      }

      if (email) {
        resetLink = await admin.auth().generatePasswordResetLink(email);
      }
    }

    await batch.commit();
    return { ok: true, resetLink };
  });

/* =========================================================
 * 4) SUPPRESSION EN CASCADE D'UNE AGENCE
 * =======================================================*/
export const companyDeleteAgencyCascade = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onCall(async (data, ctx) => {
    const { companyId, agencyId, staffAction, transferToAgencyId, allowDeleteUsers } = data as {
      companyId: string;
      agencyId: string;
      staffAction: StaffAction;
      transferToAgencyId?: string | null;
      allowDeleteUsers?: boolean;
    };

    if (!companyId || !agencyId) {
      throw new functions.https.HttpsError("invalid-argument", "companyId/agencyId requis.");
    }
    assertCompanyAdmin(ctx, companyId);

    const db = admin.firestore();
    const auth = admin.auth();
    const companyRef = db.collection("companies").doc(companyId);
    const agencyRef = companyRef.collection("agences").doc(agencyId);

    const agSnap = await agencyRef.get();
    if (!agSnap.exists) throw new functions.https.HttpsError("not-found", "Agence introuvable.");

    if (staffAction === "transfer") {
      if (!transferToAgencyId) {
        throw new functions.https.HttpsError("invalid-argument", "Agence cible requise pour le transfert.");
      }
      if (transferToAgencyId === agencyId) {
        throw new functions.https.HttpsError("invalid-argument", "L’agence cible doit être différente.");
      }
      const targetSnap = await companyRef.collection("agences").doc(transferToAgencyId).get();
      if (!targetSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Agence cible introuvable.");
      }
    }

    const staffCol = agencyRef.collection("staff");
    const staffSnap = await staffCol.get();
    const uids = staffSnap.docs.map(d => (d.data()?.uid as string)).filter(Boolean);

    const result = {
      staffCount: uids.length,
      transferred: [] as string[],
      detached: [] as string[],
      disabled: [] as string[],
      deleted: [] as string[],
    };

    // On prépare un batch pour Firestore; Auth se fait en parallèle
    const batch = db.batch();

    await Promise.all(uids.map(async (uid) => {
      const userRef = db.doc(`users/${uid}`);
      const personnelRef = companyRef.collection("personnel").doc(uid);
      const srcStaffRef = staffCol.doc(uid);

      try {
        if (staffAction === "transfer" && transferToAgencyId) {
          // Firestore
          batch.delete(srcStaffRef);
          batch.set(
            companyRef.collection("agences").doc(transferToAgencyId).collection("staff").doc(uid),
            { uid, updatedAt: now(), createdAt: now() },
            { merge: true }
          );
          batch.set(userRef, { agencyId: transferToAgencyId, updatedAt: now() }, { merge: true });
          batch.set(personnelRef, { agencyId: transferToAgencyId, updatedAt: now() }, { merge: true });

          // Auth claims
          await auth.setCustomUserClaims(uid, { companyId, agencyId: transferToAgencyId });
          await auth.revokeRefreshTokens(uid);

          result.transferred.push(uid);
        } else if (staffAction === "detach") {
          batch.delete(srcStaffRef);
          batch.set(userRef, { agencyId: null, updatedAt: now() }, { merge: true });
          batch.set(personnelRef, { agencyId: null, updatedAt: now() }, { merge: true });

          await auth.setCustomUserClaims(uid, { companyId, agencyId: null });
          await auth.revokeRefreshTokens(uid);

          result.detached.push(uid);
        } else if (staffAction === "disable") {
          batch.delete(srcStaffRef);
          batch.set(userRef, { agencyId: null, status: "disabled", updatedAt: now() }, { merge: true });
          batch.set(personnelRef, { agencyId: null, updatedAt: now() }, { merge: true });

          await auth.updateUser(uid, { disabled: true });
          await auth.setCustomUserClaims(uid, { companyId, agencyId: null });
          await auth.revokeRefreshTokens(uid);

          result.disabled.push(uid);
        } else if (staffAction === "delete") {
          if (!allowDeleteUsers) {
            throw new functions.https.HttpsError("failed-precondition", "Suppression utilisateurs non autorisée (allowDeleteUsers=false).");
          }
          batch.delete(srcStaffRef);
          batch.delete(userRef);
          batch.delete(personnelRef);

          await auth.deleteUser(uid);

          result.deleted.push(uid);
        }
      } catch (e: any) {
        functions.logger.error("Staff process failure", { uid, staffAction, err: e?.message || e });
        // On continue les autres, mais on log l'échec
      }
    }));

    // Commit Firestore
    await batch.commit();

    // Enfin, suppression de l’agence
    await agencyRef.delete();

    functions.logger.info("DeleteAgencyCascade OK", { companyId, agencyId, staffAction, ...result });
    return result;
  });

/* =========================================================
 * 5) RÉENVOI LIEN RESET
 * =======================================================*/
export const resendPasswordLink = functions
  .region(REGION)
  .https.onCall(async (data, ctx) => {
    const { email } = data as { email: string };
    if (!ctx.auth) throw new functions.https.HttpsError("unauthenticated", "Connexion requise.");
    if (!email || !isEmailFormat(email)) {
      throw new functions.https.HttpsError("invalid-argument", "Email invalide.");
    }
    const link = await admin.auth().generatePasswordResetLink(email);
    return { resetLink: link };
  });

/* =========================================================
 * 6) LIMITES DE PLAN & QUOTAS RÉSERVATIONS
 *    - createReservation (atomique + quotas mensuels)
 *    - submitPaymentProof (mise à jour stricte)
 *    - triggers de comptage agences/users (filets de sécurité)
 * =======================================================*/
type Channel = "online" | "guichet";

type PlanLimits = {
  maxAgences?: number | null;
  maxUsers?: number | null;
  monthlyReservationOnline?: number | null;
  monthlyReservationGuichet?: number | null;
};

const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

const numOrInfinity = (v?: number | null) =>
  typeof v === "number" && v >= 0 ? v : Number.POSITIVE_INFINITY;

/** Charge les limites de plan (inline ou via /plans/{planId}) */
async function loadPlanLimits(companyId: string): Promise<PlanLimits> {
  const db = admin.firestore();
  const companySnap = await db.doc(`companies/${companyId}`).get();
  if (!companySnap.exists) {
    throw new functions.https.HttpsError("not-found", "Compagnie introuvable.");
  }
  const comp = companySnap.data() || {};
  const inline: any = comp.plan || {};
  const hasInline =
    inline &&
    (inline.maxAgences != null ||
      inline.maxUsers != null ||
      inline.monthlyReservationOnline != null ||
      inline.monthlyReservationGuichet != null);

  if (hasInline) {
    return {
      maxAgences: inline.maxAgences ?? null,
      maxUsers: inline.maxUsers ?? null,
      monthlyReservationOnline: inline.monthlyReservationOnline ?? null,
      monthlyReservationGuichet: inline.monthlyReservationGuichet ?? null,
    };
  }
  const planId = (comp as any).planId || inline.planId;
  if (planId) {
    const planSnap = await db.doc(`plans/${planId}`).get();
    if (planSnap.exists) {
      const p: any = planSnap.data() || {};
      return {
        maxAgences: p.maxAgences ?? null,
        maxUsers: p.maxUsers ?? null,
        monthlyReservationOnline: p.monthlyReservationOnline ?? null,
        monthlyReservationGuichet: p.monthlyReservationGuichet ?? null,
      };
    }
  }
  // Par défaut: pas de limites (Infinity). Adapte si tu veux un "Free" par défaut.
  return { maxAgences: null, maxUsers: null, monthlyReservationOnline: null, monthlyReservationGuichet: null };
}

/** CREATE RESERVATION (quotas mensuels + transaction) */
export const createReservation = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 60, memory: "256MB" })
  .https.onCall(async (data, ctx) => {
    // Optionnel: exiger App Check: if (!ctx.app) throw new functions.https.HttpsError("failed-precondition","App Check requis.");
    const { companyId, agencyId, channel, payload } = (data || {}) as {
      companyId: string;
      agencyId: string;
      channel: Channel; // 'online' | 'guichet'
      payload: Record<string, any>;
    };
    if (!companyId || !agencyId || !channel || !payload) {
      throw new functions.https.HttpsError("invalid-argument", "Paramètres manquants.");
    }

    // Validation minimale
    const required = ["nomClient", "telephone", "depart", "arrivee", "date", "heure", "montant"];
    for (const f of required) {
      if (payload[f] == null || `${payload[f]}`.trim() === "") {
        throw new functions.https.HttpsError("invalid-argument", `Champ requis manquant: ${f}`);
      }
    }

    const db = admin.firestore();
    const limits = await loadPlanLimits(companyId);
    const month = monthKey();
    const usageRef = db.doc(`companies/${companyId}/usage/${month}`);
    const companyRef = db.doc(`companies/${companyId}`);
    const agencyRef = db.doc(`companies/${companyId}/agences/${agencyId}`);
    const reservRef = db.collection(`companies/${companyId}/agences/${agencyId}/reservations`).doc();

    const limitOnline = numOrInfinity(limits.monthlyReservationOnline);
    const limitGuichet = numOrInfinity(limits.monthlyReservationGuichet);

    const result = await db.runTransaction(async (tx) => {
      const [compSnap, agSnap, usageSnap] = await Promise.all([
        tx.get(companyRef),
        tx.get(agencyRef),
        tx.get(usageRef),
      ]);
      if (!compSnap.exists) throw new functions.https.HttpsError("not-found", "Compagnie introuvable.");
      if (!agSnap.exists) throw new functions.https.HttpsError("not-found", "Agence introuvable.");

      const usage = (usageSnap.exists ? usageSnap.data() : {}) as {
        onlineReservations?: number;
        guichetReservations?: number;
      };
      const usedOnline = usage.onlineReservations ?? 0;
      const usedGuichet = usage.guichetReservations ?? 0;

      if (channel === "online" && usedOnline + 1 > limitOnline) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Limite mensuelle de réservations en ligne atteinte. Contactez l’admin plateforme pour upgrader le plan."
        );
      }
      if (channel === "guichet" && usedGuichet + 1 > limitGuichet) {
        throw new functions.https.HttpsError(
          "resource-exhausted",
          "Limite mensuelle de réservations guichet atteinte. Contactez l’admin plateforme pour upgrader le plan."
        );
      }

      const nowTs = now();
      const dataToWrite = {
        ...payload,
        id: reservRef.id,
        companyId,
        agencyId,
        canal: channel === "online" ? "en_ligne" : "guichet",
        statut: payload.statut ?? "en_attente",
        createdAt: nowTs,
        updatedAt: nowTs,
      };
      tx.set(reservRef, dataToWrite);

      const inc = admin.firestore.FieldValue.increment(1);
      if (usageSnap.exists) {
        tx.update(usageRef, {
          ...(channel === "online" ? { onlineReservations: inc } : {}),
          ...(channel === "guichet" ? { guichetReservations: inc } : {}),
          updatedAt: nowTs,
        });
      } else {
        tx.set(usageRef, {
          month,
          onlineReservations: usedOnline + (channel === "online" ? 1 : 0),
          guichetReservations: usedGuichet + (channel === "guichet" ? 1 : 0),
          createdAt: nowTs,
          updatedAt: nowTs,
        });
      }

      return { reservationId: reservRef.id };
    });

    return result; // { reservationId }
  });

/** SUBMIT PAYMENT PROOF (propre & centralisé) */
export const submitPaymentProof = functions
  .region(REGION)
  .https.onCall(async (data, ctx) => {
    const { companyId, agencyId, reservationId, preuveVia, preuveMessage, preuveFileUrl } = (data || {}) as {
      companyId: string;
      agencyId: string;
      reservationId: string;
      preuveVia?: string;
      preuveMessage?: string;
      preuveFileUrl?: string;
    };
    if (!companyId || !agencyId || !reservationId) {
      throw new functions.https.HttpsError("invalid-argument", "Paramètres manquants.");
    }

    const db = admin.firestore();
    const ref = db.doc(`companies/${companyId}/agences/${agencyId}/reservations/${reservationId}`);

    await ref.update({
      preuveVia: preuveVia ?? null,
      preuveMessage: preuveMessage ?? null,
      preuveFileUrl: preuveFileUrl ?? null,
      statut: "preuve_reçue",
      updatedAt: now(),
    });
    return { ok: true };
  });

/* =========================
 * Triggers "filets de sécurité"
 * ========================= */
// Incrémente/décrémente counts.agences
export const onAgencyCreated = functions.firestore
  .document("companies/{companyId}/agences/{agencyId}")
  .onCreate(async (snap, ctx) => {
    const db = admin.firestore();
    const ref = db.doc(`companies/${ctx.params.companyId}`);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const counts = (doc.data()?.counts ?? {}) as { agences?: number; users?: number };
      tx.update(ref, { "counts.agences": (counts.agences ?? 0) + 1 });
    });
  });

export const onAgencyDeleted = functions.firestore
  .document("companies/{companyId}/agences/{agencyId}")
  .onDelete(async (snap, ctx) => {
    const db = admin.firestore();
    const ref = db.doc(`companies/${ctx.params.companyId}`);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const counts = (doc.data()?.counts ?? {}) as { agences?: number; users?: number };
      tx.update(ref, { "counts.agences": Math.max(0, (counts.agences ?? 0) - 1) });
    });
  });

// Incrémente/décrémente counts.users sur companies/{companyId}/personnel
export const onCompanyUserCreated = functions.firestore
  .document("companies/{companyId}/personnel/{uid}")
  .onCreate(async (snap, ctx) => {
    const db = admin.firestore();
    const ref = db.doc(`companies/${ctx.params.companyId}`);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const counts = (doc.data()?.counts ?? {}) as { agences?: number; users?: number };
      tx.update(ref, { "counts.users": (counts.users ?? 0) + 1 });
    });
  });

export const onCompanyUserDeleted = functions.firestore
  .document("companies/{companyId}/personnel/{uid}")
  .onDelete(async (snap, ctx) => {
    const db = admin.firestore();
    const ref = db.doc(`companies/${ctx.params.companyId}`);
    await db.runTransaction(async (tx) => {
      const doc = await tx.get(ref);
      const counts = (doc.data()?.counts ?? {}) as { agences?: number; users?: number };
      tx.update(ref, { "counts.users": Math.max(0, (counts.users ?? 0) - 1) });
    });
  });
