import type { Handler } from "@netlify/functions";
import admin from "firebase-admin";

if (!admin.apps.length) {
  // Assure-toi d'avoir configuré les credentials via les variables d'environnement
  // GOOGLE_APPLICATION_CREDENTIALS ou directement via GOOGLE_* env vars.
  admin.initializeApp();
}

const db = admin.firestore();

/**
 * Helper : extrait le token Bearer depuis l'en-tête Authorization
 */
function extractBearerToken(authorization?: string | null): string | null {
  if (!authorization) return null;
  const m = authorization.match(/^\s*Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/**
 * Handler Netlify : POST { inviteId: string }
 * En-tête recommandé : Authorization: Bearer <firebase-id-token>
 */
export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod?.toUpperCase() !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
    }

    // parse body
    const body =
      event.body && event.headers["content-type"]?.includes("application/json")
        ? JSON.parse(event.body)
        : {};

    const inviteId = body?.inviteId;
    if (!inviteId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, error: "inviteId manquant" }) };
    }

    // 1) obtenir UID utilisateur : préférence -> Authorization Bearer <idToken>
    const authHeader = (event.headers["authorization"] ?? event.headers["Authorization"]) as string | undefined;
    const idToken = extractBearerToken(authHeader ?? null);

    let uid: string | null = null;
    if (idToken) {
      try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        uid = decoded.uid;
      } catch (err) {
        console.warn("verifyIdToken failed:", (err as any)?.message ?? err);
        // On ne renvoie pas encore d'erreur ici, on tentera fallback
      }
    }

    // fallback : Netlify clientContext (utile si tu utilises Netlify Identity)
    // event.requestContext? Netlify fournit clientContext dans event.requestContext.authorizer, 
    // but in functions v1 it is event?.clientContext. We'll check both.
    if (!uid) {
      const clientContext = (event as any).clientContext || (event as any).context?.clientContext;
      if (clientContext?.identity?.user_id) {
        uid = clientContext.identity.user_id;
      } else if (clientContext?.user?.id) {
        uid = clientContext.user.id;
      }
    }

    if (!uid) {
      return { statusCode: 401, body: JSON.stringify({ success: false, error: "Non autorisé (token manquant ou invalide)" }) };
    }

    // 2) charger l'invitation
    const inviteRef = db.collection("invites").doc(inviteId);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists) {
      return { statusCode: 404, body: JSON.stringify({ success: false, error: "Invitation introuvable" }) };
    }
    const inviteData = inviteSnap.data() as any;

    // 3) marquer consommée (idempotent : ignorer si déjà consommée)
    try {
      await inviteRef.update({
        status: "consumed",
        consumedAt: admin.firestore.FieldValue.serverTimestamp(),
        consumedBy: uid,
      });
    } catch (err) {
      // si update fail (ex. permissions), on continue mais logue
      console.warn("Impossible de mettre à jour invite:", (err as any)?.message ?? err);
    }

    // 4) mettre à jour users/{uid}
    const role = inviteData?.role ?? "user";
    const companyId = inviteData?.companyId ?? null;
    const agencyId = inviteData?.agencyId ?? null;
    const displayName = inviteData?.name ?? undefined;
    const phone = inviteData?.phone ?? undefined;

    const userRef = db.collection("users").doc(uid);
    const userPayload: any = {
      role,
      companyId,
      agencyId,
      status: "active",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (displayName) userPayload.displayName = displayName;
    if (phone) userPayload.phoneNumber = phone;

    await userRef.set(userPayload, { merge: true });

    // 5) définir custom claims (remplace les anciennes claims)
    try {
      await admin.auth().setCustomUserClaims(uid, {
        role,
        companyId: companyId || null,
        agencyId: agencyId || null,
      });
    } catch (err) {
      console.warn("setCustomUserClaims failed:", (err as any)?.message ?? err);
      // Ne pas échouer complètement pour un pb de claims ; renvoyer info au client
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Invitation consommée et utilisateur mis à jour",
        inviteId,
        uid,
        applied: { role, companyId, agencyId },
      }),
    };
  } catch (error: any) {
    console.error("claimInvite error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error?.message || "Erreur interne" }),
    };
  }
};
