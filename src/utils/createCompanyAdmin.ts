// utils/createCompanyAdmin.ts
import { initializeApp, deleteApp, FirebaseApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/firebaseConfig";
import { firebaseConfig } from "@/firebaseConfig"; // ton objet de config

export async function createCompanyAdminOnClient(opts: {
  email: string;
  fullName: string;
  phone?: string;
  companyId: string;
}) {
  const { email, fullName, phone, companyId } = opts;

  // 1) Secondary app pour ne pas toucher la session courante
  const secondaryName = "admin-secondary";
  let secondary: FirebaseApp | null = null;
  try {
    secondary = initializeApp(firebaseConfig, secondaryName);
    const secAuth = getAuth(secondary);

    // 2) Créer le compte avec un mot de passe temporaire
    const tempPwd = Math.random().toString(36).slice(-10) + "Aa!1";
    const cred = await createUserWithEmailAndPassword(secAuth, email, tempPwd);

    // 3) Mettre un displayName
    await updateProfile(cred.user, { displayName: fullName });

    const uid = cred.user.uid;

    // 4) Créer le doc users/{uid} avec le rôle & l’affectation
    await setDoc(doc(db, "users", uid), {
      uid,
      email,
      displayName: fullName,
      phone: phone || null,
      role: "admin_compagnie",
      companyId,
      status: "active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    // 5) Forcer une réinitialisation de mot de passe (l’utilisateur choisira son vrai mot de passe)
    // Si tu N’AS PAS activé "Email link (passwordless)", ceci fonctionne quand même.
    await sendPasswordResetEmail(secAuth, email);

    return { ok: true, uid };
  } finally {
    if (secondary) await deleteApp(secondary);
  }
}
