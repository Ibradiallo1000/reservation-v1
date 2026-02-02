// src/hooks/useAttachInvitation.ts
import { useEffect, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/firebaseConfig";

type AttachState = {
  loading: boolean;
  attached: boolean;
  error: string | null;
};

export function useAttachInvitation() {
  const [state, setState] = useState<AttachState>({
    loading: true,
    attached: false,
    error: null,
  });

  useEffect(() => {
    const auth = getAuth();

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user || !user.email) {
        setState({ loading: false, attached: false, error: null });
        return;
      }

      try {
        // 1️⃣ Chercher une invitation pending pour cet email
        const q = query(
          collection(db, "invitations"),
          where("email", "==", user.email),
          where("status", "==", "pending")
        );

        const snap = await getDocs(q);

        if (snap.empty) {
          // Pas d’invitation → rien à faire
          setState({ loading: false, attached: false, error: null });
          return;
        }

        // 2️⃣ On prend la première invitation (une seule attendue)
        const invite = snap.docs[0];
        const data = invite.data();

        // 3️⃣ Créer / mettre à jour le profil utilisateur
        await setDoc(
          doc(db, "users", user.uid),
          {
            email: user.email,
            role: data.role, // "admin", "chef_agence", etc.
            companyId: data.companyId,
            agencyId: data.agencyId ?? null,
            emailVerified: user.emailVerified,
            createdAt: serverTimestamp(),
          },
          { merge: true }
        );

        // 4️⃣ Marquer l’invitation comme acceptée
        await updateDoc(invite.ref, {
          status: "accepted",
          acceptedAt: serverTimestamp(),
          uid: user.uid,
        });

        setState({ loading: false, attached: true, error: null });
      } catch (e: any) {
        console.error("attach invitation error:", e);
        setState({
          loading: false,
          attached: false,
          error: "Impossible de rattacher l’invitation.",
        });
      }
    });

    return () => unsub();
  }, []);

  return state;
}
