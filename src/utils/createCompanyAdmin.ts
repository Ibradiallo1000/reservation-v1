// utils/createCompanyAdmin.ts
import {
  initializeApp,
  deleteApp,
  getApps,
  getApp,
  FirebaseApp,
} from "firebase/app";
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db, firebaseConfig } from "@/firebaseConfig";

/**
 * Crée un compte "admin_compagnie" sans casser la session courante :
 * - Utilise une app Firebase "secondaire" dédiée à la création du compte
 * - Écrit users/{uid} avec le rôle et l’affectation companyId
 * - Envoie un e-mail de réinitialisation de mot de passe
 *
 * IMPORTANT :
 * - Tes règles Firestore exigent que l'appelant soit admin plateforme pour écrire users/{autreUid}.
 *   Donc, l’utilisateur actuellement connecté dans l’app principale doit être "admin_platforme".
 * - Le provider Email/Password doit être activé dans Firebase Auth.
 */
export async function createCompanyAdminOnClient(opts: {
  email: string;
  fullName: string;
  phone?: string;
  companyId: string;
}) {
  const { email, fullName, phone, companyId } = opts;

  // 1) Récupère ou crée l’app secondaire pour ne pas toucher la session courante
  const secondaryName = "admin-secondary";
  let secondary: FirebaseApp | null = null;
  try {
    // Réutilise si elle existe déjà
    const existing = getApps().find((a) => a.name === secondaryName);
    secondary = existing ?? initializeApp(firebaseConfig, secondaryName);

    const secAuth = getAuth(secondary);

    // 2) Créer le compte avec un mot de passe temporaire (respecte de base quelques contraintes)
    const tempPwd = Math.random().toString(36).slice(-10) + "Aa!1";

    let cred;
    try {
      cred = await createUserWithEmailAndPassword(secAuth, email, tempPwd);
    } catch (e: any) {
      // Messages plus propres pour les cas fréquents
      if (e?.code === "auth/email-already-in-use") {
        throw new Error("Cet e-mail est déjà utilisé.");
      }
      if (e?.code === "auth/operation-not-allowed") {
        throw new Error("Le provider Email/Password n’est pas activé dans Firebase Auth.");
      }
      if (e?.code === "auth/invalid-email") {
        throw new Error("Adresse e-mail invalide.");
      }
      throw e;
    }

    // 3) Met à jour le displayName
    try {
      await updateProfile(cred.user, { displayName: fullName });
    } catch {
      // Non bloquant si le profile ne peut pas être mis à jour tout de suite
    }

    const uid = cred.user.uid;

    // 4) Créer/Màj le doc users/{uid} avec le rôle & l’affectation
    // ⚠️ Nécessite que l’utilisateur courant (app principale) soit admin plateforme selon tes règles.
    await setDoc(
      doc(db, "users", uid),
      {
        uid,
        email,
        displayName: fullName,
        phone: phone || null,
        role: "admin_compagnie",
        companyId,
        status: "active",
        provider: "password",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    // 5) Force une réinitialisation de mot de passe
    // (l’utilisateur définira son mot de passe final via l’e-mail)
    try {
      await sendPasswordResetEmail(secAuth, email);
    } catch (e: any) {
      // Non bloquant, mais on renvoie l’info au dessus
      console.warn("Impossible d’envoyer l’e-mail de réinitialisation :", e?.code || e);
    }

    return { ok: true, uid };
  } finally {
    // 6) Nettoyage de l’app secondaire pour éviter les fuites de ressources
    if (secondary) {
      try {
        await deleteApp(secondary);
      } catch {
        // ignore
      }
    }
  }
}
