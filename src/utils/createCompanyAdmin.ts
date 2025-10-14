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
import { db } from "@/firebaseConfig";

/**
 * Crée un compte "admin_compagnie" SANS casser la session courante.
 * Utilise une app Firebase "secondaire" (admin-secondary) pour l’opération.
 *
 * ⚠️ Tes règles Firestore exigent que l’utilisateur courant soit admin plateforme
 *    pour écrire dans users/{autreUid}.
 * ⚠️ Le provider Email/Password doit être activé dans Firebase Auth.
 */
export async function createCompanyAdminOnClient(opts: {
  email: string;
  fullName: string;
  phone?: string;
  companyId: string;
}) {
  const { email, fullName, phone, companyId } = opts;

  const secondaryName = "admin-secondary";
  let secondary: FirebaseApp | null = null;

  try {
    // ← IMPORTANT : on réutilise la config de l’app principale
    const baseOptions = getApp().options;

    // Réutilise l’app secondaire si elle existe déjà
    const existing = getApps().find((a) => a.name === secondaryName);
    secondary = existing ?? initializeApp(baseOptions, secondaryName);

    const secAuth = getAuth(secondary);

    // Mot de passe temporaire “fort” pour passer la création
    const tempPwd = Math.random().toString(36).slice(-10) + "Aa!1";

    let cred;
    try {
      cred = await createUserWithEmailAndPassword(secAuth, email, tempPwd);
    } catch (e: any) {
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

    // Display name (non bloquant si ça échoue)
    try {
      await updateProfile(cred.user, { displayName: fullName });
    } catch {}

    const uid = cred.user.uid;

    // Écrit/merge le doc users/{uid} (rôle + affectation)
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

    // Envoie l’e-mail de réinitialisation (l’utilisateur choisira son vrai mot de passe)
    try {
      await sendPasswordResetEmail(secAuth, email);
    } catch (e) {
      console.warn("Impossible d’envoyer l’e-mail de réinitialisation :", e);
    }

    return { ok: true, uid };
  } finally {
    // Nettoyage propre de l’app secondaire
    if (secondary) {
      try {
        await deleteApp(secondary);
      } catch {}
    }
  }
}
