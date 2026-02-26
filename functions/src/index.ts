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

const FRONTEND_URL =
  process.env.FRONTEND_URL ||
  (functions.config()?.app?.frontend_url as string) ||
  "https://monbillet-95b77.web.app";

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

/** Vérifie que l’appelant a le droit d’agir sur cette agence (platforme, admin_compagnie de la compagnie, ou chefAgence de cette agence) */
function assertAgencyScope(ctx: functions.https.CallableContext, companyId: string, agencyId: string) {
  assertAuthenticated(ctx);
  const t = (ctx.auth!.token as any) || {};
  const role = String(t.role || "").toLowerCase().trim();
  const sameCompany = String(t.companyId || "") === companyId;
  const sameAgency = String(t.agencyId || "") === agencyId;
  const isCompanyAdmin = (role === "admin_compagnie" || role === "admin compagnie") && sameCompany;
  const isChefAgence = (role === "chefagence" || role === "chef_agence") && sameCompany && sameAgency;
  if (!(isPlatform(ctx) || isCompanyAdmin || isChefAgence)) {
    throw new functions.https.HttpsError("permission-denied", "Portée agence invalide.");
  }
}

/** Rôles considérés comme périmètre agence (nécessitent doc dans companies/.../agences/.../users) */
const AGENCY_SCOPE_ROLES = ["guichetier", "agency_accountant", "controleur", "chefagence", "chef_agence"];

function isAgencyScopeRole(role: string): boolean {
  const r = String(role || "").toLowerCase().trim();
  return AGENCY_SCOPE_ROLES.includes(r);
}

/** Retourne true s'il existe déjà un comptable agence pour cette agence. */
async function hasAgencyAccountantForAgency(companyId: string, agencyId: string): Promise<boolean> {
  const snap = await db
    .collection("users")
    .where("companyId", "==", companyId)
    .where("agencyId", "==", agencyId)
    .where("role", "==", "agency_accountant")
    .limit(1)
    .get();
  return !snap.empty;
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
   1b) claimInvitation (CALLABLE)
   - Accepte uniquement { inviteId: string }. Pas d'auth requise.
   - Lit l'invitation, vérifie pending, vérifie qu'aucun utilisateur Auth n'existe pour cet email.
   - Crée l'utilisateur Auth (Admin SDK, sans mot de passe), set claims, écrit users/{uid}.
   - Si périmètre agence : staffCode + counters + doc agence.
   - Met à jour invitation (accepted), génère lien de réinitialisation mot de passe, retourne resetLink.
------------------------------------------------------- */
export const claimInvitation = functions
  .region("europe-west1")
  .https.onCall(async (data) => {
    try {
      const inviteId = typeof data?.inviteId === "string" ? data.inviteId.trim() : "";
      if (!inviteId) {
        throw new functions.https.HttpsError("invalid-argument", "inviteId manquant.");
      }

      const inviteRef = db.collection("invitations").doc(inviteId);
      const inviteSnap = await inviteRef.get();
      if (!inviteSnap.exists) {
        throw new functions.https.HttpsError("not-found", "Invitation introuvable.");
      }
      const inviteData = inviteSnap.data() as any;
      if (inviteData?.status !== "pending") {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "L'invitation n'est plus en attente (statut: " + (inviteData?.status ?? "inconnu") + ")."
        );
      }

      const email = normalizeEmail(inviteData?.email);
      if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "Invitation sans email.");
      }

      try {
        await auth.getUserByEmail(email);
        throw new functions.https.HttpsError("already-exists", "Un compte existe déjà pour cet email.");
      } catch (e: any) {
        if (e instanceof functions.https.HttpsError) throw e;
        if (e?.code !== "auth/user-not-found") throw e;
      }

      const userRecord = await auth.createUser({
        email,
        emailVerified: true,
      });
      const uid = userRecord.uid;

      const rawRole = inviteData?.role ?? "user";
      const companyId = inviteData?.companyId ?? null;
      const agencyId = inviteData?.agencyId ?? null;
      const roleNorm = String(rawRole).toLowerCase().trim();
      const canonicalRole =
        roleNorm === "comptable" && agencyId ? "agency_accountant"
          : roleNorm === "comptable" ? "company_accountant"
          : roleNorm === "company_ceo" ? "admin_compagnie"
          : roleNorm;
      const displayName = inviteData?.fullName ?? inviteData?.name ?? undefined;
      const phone = inviteData?.phone ?? undefined;

      await setClaims(uid, {
        role: canonicalRole,
        companyId: companyId || null,
        agencyId: agencyId || null,
      });

      const isAgency = Boolean(companyId && agencyId && isAgencyScopeRole(canonicalRole));

      if (isAgency) {
        const cId = String(companyId);
        const aId = String(agencyId);
        if (canonicalRole === "agency_accountant") {
          const hasAcc = await hasAgencyAccountantForAgency(cId, aId);
          if (hasAcc) {
            await auth.deleteUser(uid);
            throw new functions.https.HttpsError(
              "failed-precondition",
              "Un comptable existe déjà pour cette agence."
            );
          }
        }

        const needsStaffCode = canonicalRole === "guichetier" || canonicalRole === "agency_accountant";
        const counterRef = db
          .collection("companies")
          .doc(cId)
          .collection("agences")
          .doc(aId)
          .collection("counters")
          .doc(canonicalRole);
        const userRef = db.collection("users").doc(uid);
        const agencyUserRef = db
          .collection("companies")
          .doc(cId)
          .collection("agences")
          .doc(aId)
          .collection("users")
          .doc(uid);

        await db.runTransaction(async (t) => {
          let staffCode: string | undefined;
          if (needsStaffCode) {
            const counterSnap = await t.get(counterRef);
            const lastSeq = (counterSnap.data() as any)?.lastSeq ?? 0;
            const newSeq = lastSeq + 1;
            t.set(counterRef, {
              lastSeq: newSeq,
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            staffCode =
              canonicalRole === "guichetier"
                ? "G" + String(newSeq).padStart(3, "0")
                : "ACC" + String(newSeq).padStart(3, "0");
          }

          const userPayload: Record<string, unknown> = {
            uid,
            role: canonicalRole,
            companyId: cId,
            agencyId: aId,
            status: "active",
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          userPayload.email = email;
          if (displayName) userPayload.displayName = displayName;
          if (phone) userPayload.phoneNumber = phone;
          if (staffCode) {
            userPayload.staffCode = staffCode;
            userPayload.codeCourt = staffCode;
          }

          t.set(userRef, userPayload, { merge: true });

          const agencyPayload: Record<string, unknown> = {
            uid,
            role: canonicalRole,
            companyId: cId,
            agencyId: aId,
            active: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };
          agencyPayload.email = email;
          if (displayName) agencyPayload.displayName = displayName;
          if (phone) agencyPayload.telephone = phone;
          if (staffCode) {
            agencyPayload.staffCode = staffCode;
            agencyPayload.codeCourt = staffCode;
          }
          t.set(agencyUserRef, agencyPayload, { merge: true });
        });
      } else {
        const userRef = db.collection("users").doc(uid);
        const userPayload: any = {
          uid,
          email,
          role: canonicalRole,
          companyId,
          agencyId,
          status: "active",
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (displayName) userPayload.displayName = displayName;
        if (phone) userPayload.phoneNumber = phone;
        await userRef.set(userPayload, { merge: true });
      }

      await inviteRef.update({
        status: "accepted",
        acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
        acceptedUid: uid,
      });

      const resetLink = await auth.generatePasswordResetLink(email);

      return {
        success: true,
        resetLink,
      };
    } catch (err: any) {
      functions.logger.error("claimInvitation FAILED", err);
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", "claimInvitation failed");
    }
  });

/* -------------------------------------------------------
   1c) createInvitation (CALLABLE)
   - Appelant authentifié ; permissions via custom claims (admin_plateforme, admin_compagnie, chefAgence).
   - Crée un document invitations avec status "pending", retourne l’URL d’acceptation.
------------------------------------------------------- */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;

interface CreateInvitationPayload {
  email: string;
  role: string;
  companyId?: string;
  agencyId?: string;
  fullName?: string;
  phone?: string;
}

export const createInvitation = functions
  .region("europe-west1")
  .https.onCall(async (data, context) => {
    try {
      assertAuthenticated(context);
      const uid = context.auth!.uid;
      const t = (context.auth!.token as any) || {};
      const callerRole = String(t.role || "").toLowerCase().trim();
      const callerCompanyId = (t.companyId as string) || "";
      const callerAgencyId = (t.agencyId as string) || "";

      const payload = data as CreateInvitationPayload | undefined;
      const email = normalizeEmail(payload?.email);
      if (!email) {
        throw new functions.https.HttpsError("invalid-argument", "email manquant.");
      }
      if (!EMAIL_REGEX.test(email)) {
        throw new functions.https.HttpsError("invalid-argument", "Format d’email invalide.");
      }
      const role = String(payload?.role ?? "").trim();
      if (!role) {
        throw new functions.https.HttpsError("invalid-argument", "role manquant.");
      }
      const companyId = payload?.companyId != null ? String(payload.companyId).trim() : undefined;
      const agencyId = payload?.agencyId != null ? String(payload.agencyId).trim() : undefined;
      const fullName = payload?.fullName != null ? String(payload.fullName).trim() : undefined;
      const phone = payload?.phone != null ? normalizePhone(payload.phone) : undefined;

      // Vérification des permissions selon le rôle de l’appelant
      if (isPlatform(context)) {
        // admin_plateforme : peut inviter staff plateforme ou propriétaire compagnie (aucune restriction de scope)
      } else if (callerRole === "admin_compagnie" || callerRole === "admin compagnie") {
        if (!callerCompanyId) {
          throw new functions.https.HttpsError("permission-denied", "Compagnie non associée.");
        }
        if (companyId !== callerCompanyId) {
          throw new functions.https.HttpsError("permission-denied", "Vous ne pouvez inviter que pour votre compagnie.");
        }
        if (agencyId) {
          const agencyRef = db.collection("companies").doc(companyId).collection("agences").doc(agencyId);
          const agencySnap = await agencyRef.get();
          if (!agencySnap.exists) {
            throw new functions.https.HttpsError("invalid-argument", "Agence introuvable.");
          }
        }
      } else if (callerRole === "chefagence" || callerRole === "chef_agence") {
        if (!callerCompanyId || !callerAgencyId) {
          throw new functions.https.HttpsError("permission-denied", "Agence non associée.");
        }
        if (companyId !== callerCompanyId || agencyId !== callerAgencyId) {
          throw new functions.https.HttpsError("permission-denied", "Vous ne pouvez inviter que pour votre agence.");
        }
      } else {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Seuls admin plateforme, admin compagnie ou chef d’agence peuvent créer une invitation."
        );
      }

      // Pas d’invitation en attente pour le même email et le même scope
      const normCompany = companyId ?? "";
      const normAgency = agencyId ?? "";
      const pendingSnap = await db
        .collection("invitations")
        .where("email", "==", email)
        .where("status", "==", "pending")
        .get();
      const existing = pendingSnap.docs.find((d) => {
        const dta = d.data();
        const dCompany = (dta.companyId as string) ?? "";
        const dAgency = (dta.agencyId as string) ?? "";
        return dCompany === normCompany && dAgency === normAgency;
      });
      if (existing) {
        throw new functions.https.HttpsError(
          "already-exists",
          "Une invitation en attente existe déjà pour cet email dans ce périmètre."
        );
      }

      const inviteRef = db.collection("invitations").doc();
      const inviteId = inviteRef.id;
      const inviteData: Record<string, unknown> = {
        email,
        role,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: uid,
      };
      if (companyId !== undefined && companyId !== "") inviteData.companyId = companyId;
      if (agencyId !== undefined && agencyId !== "") inviteData.agencyId = agencyId;
      if (fullName) inviteData.fullName = fullName;
      if (phone) inviteData.phone = phone;

      await inviteRef.set(inviteData);

      const url = `${FRONTEND_URL}/accept-invitation/${inviteId}`;
      return { success: true, inviteId, url };
    } catch (err: any) {
      functions.logger.error("createInvitation FAILED", err);
      if (err instanceof functions.https.HttpsError) throw err;
      throw new functions.https.HttpsError("internal", "createInvitation failed");
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

/* =======================================================
   SCHEDULED: checkSubscriptionExpiration
   Runs daily at 02:00 UTC to handle subscription lifecycle.
======================================================= */
import { runSubscriptionExpirationCheck } from "./scheduled/checkSubscriptionExpiration";

export const checkSubscriptionExpiration = functions
  .runWith({ timeoutSeconds: 120, memory: "256MB" })
  .pubsub.schedule("every day 02:00")
  .timeZone("UTC")
  .onRun(async () => {
    const logs = await runSubscriptionExpirationCheck();
    if (logs.length > 0) {
      functions.logger.info("Subscription expiration check completed", {
        transitions: logs.length,
        details: logs,
      });
    } else {
      functions.logger.info("Subscription expiration check: no transitions needed.");
    }
    return null;
  });

/* =======================================================
   CALLABLE: validateCompanyPayment
   Admin validates a manual payment -> reactivate subscription.
======================================================= */
import { processPaymentValidation } from "./scheduled/validatePayment";

export const validateCompanyPayment = functions.https.onCall(async (data, context) => {
  assertAuthenticated(context);
  await assertPlatformAdmin(context);

  const { companyId, paymentId } = data as { companyId?: string; paymentId?: string };
  if (!companyId || !paymentId) {
    throw new functions.https.HttpsError("invalid-argument", "companyId and paymentId are required.");
  }

  try {
    const result = await processPaymentValidation({
      companyId,
      paymentId,
      validatedBy: context.auth!.uid,
    });
    return result;
  } catch (err: any) {
    throw new functions.https.HttpsError("internal", err?.message || "Payment validation failed.");
  }
});

/* =======================================================
   CALLABLE: updateCompanyRevenue
   Track digital revenue when an online reservation is completed.
======================================================= */
export const updateCompanyRevenue = functions.https.onCall(async (data, context) => {
  assertAuthenticated(context);

  const { companyId, reservationAmount } = data as { companyId?: string; reservationAmount?: number };
  if (!companyId || !reservationAmount || reservationAmount <= 0) {
    throw new functions.https.HttpsError("invalid-argument", "companyId and positive reservationAmount required.");
  }

  const companyRef = db.doc(`companies/${companyId}`);
  const companySnap = await companyRef.get();
  if (!companySnap.exists) {
    throw new functions.https.HttpsError("not-found", "Company not found.");
  }

  const companyData = companySnap.data()!;
  const digitalFeePercent = Number(companyData.digitalFeePercent) || 0;
  const feeAmount = Math.round((reservationAmount * digitalFeePercent) / 100);

  await companyRef.update({
    totalDigitalRevenueGenerated: admin.firestore.FieldValue.increment(reservationAmount),
    totalDigitalFeesCollected: admin.firestore.FieldValue.increment(feeAmount),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return { success: true, feeAmount, digitalFeePercent };
});
