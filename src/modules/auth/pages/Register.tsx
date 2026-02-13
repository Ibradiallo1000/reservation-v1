// src/pages/Register.tsx
import React, { useEffect, useState } from "react";
import { getAuth, isSignInWithEmailLink, signInWithEmailLink } from "firebase/auth";
import { app } from "@/firebaseConfig";
import { useNavigate, useLocation } from "react-router-dom";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/firebaseConfig";

function useQuery() {
  const { search } = useLocation();
  return Object.fromEntries(new URLSearchParams(search).entries());
}

export default function Register() {
  const auth = getAuth(app);
  const navigate = useNavigate();
  const q = useQuery();

  const companyId = q.companyId || "";
  const [email, setEmail] = useState(localStorage.getItem("invitedEmail") || "");
  const [message, setMessage] = useState("");
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const href = window.location.href;
        const withLink = isSignInWithEmailLink(auth, href);
        setProcessing(true);

        // si on arrive sans l'email (ex: sur mobile), on affiche le champ
        if (withLink && !email) {
          setProcessing(false);
          return;
        }

        if (withLink && email) {
          const result = await signInWithEmailLink(auth, email, href);
          localStorage.removeItem("invitedEmail");

          const user = result.user;
          // Si on a une invitation, appliquer le rôle + companyId
          if (companyId) {
            const inviteRef = doc(db, `companies/${companyId}/invites/${email.toLowerCase()}`);
            const inviteSnap = await getDoc(inviteRef);
            if (inviteSnap.exists()) {
              const inv = inviteSnap.data() as any;

              // users/{uid}
              await setDoc(
                doc(db, "users", user.uid),
                {
                  uid: user.uid,
                  email: user.email,
                  fullName: inv?.fullName || user.displayName || "",
                  phone: inv?.phone || null,
                  role: "admin_compagnie",
                  companyId,
                  status: "actif",
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );

              // companies/{companyId}/personnel/{uid}
              await setDoc(
                doc(db, `companies/${companyId}/personnel/${user.uid}`),
                {
                  uid: user.uid,
                  email: user.email,
                  fullName: inv?.fullName || user.displayName || "",
                  phone: inv?.phone || null,
                  role: "admin_compagnie",
                  createdAt: serverTimestamp(),
                  updatedAt: serverTimestamp(),
                },
                { merge: true }
              );

              // (optionnel) supprimer l'invite
              // await deleteDoc(inviteRef);

              setMessage("✅ Inscription réussie. Rôle admin compagnie appliqué.");
              navigate("/compagnie/dashboard", { replace: true });
              return;
            }
          }

          // Aucun contexte d'invite → simple utilisateur
          await setDoc(
            doc(db, "users", user.uid),
            {
              uid: user.uid,
              email: user.email,
              fullName: user.displayName || "",
              phone: user.phoneNumber || null,
              role: "user",
              status: "actif",
              updatedAt: serverTimestamp(),
            },
            { merge: true }
          );

          setMessage("✅ Inscription réussie.");
          navigate("/", { replace: true });
        } else {
          setProcessing(false);
        }
      } catch (e: any) {
        console.error(e);
        setMessage(`❌ Erreur d'inscription: ${e?.message || e?.code || "inconnue"}`);
        setProcessing(false);
      }
    })();
  }, [auth, email, companyId, navigate]);

  if (processing) {
    return <div className="p-6">Traitement…</div>;
  }

  // Form fallback si l’email n’était pas présent (cas d’ouverture sur un autre device)
  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold mb-2">Confirmer votre email</h1>
      <p className="text-sm text-gray-700 mb-4">
        Entrez l’adresse email à laquelle le lien a été envoyé pour terminer la connexion.
      </p>
      {message && <p className="mb-3 text-blue-700">{message}</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          localStorage.setItem("invitedEmail", email.trim());
          window.location.reload();
        }}
        className="grid gap-3"
      >
        <input
          className="border rounded px-3 py-2"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="votre@email.com"
          required
        />
        <button className="bg-orange-600 text-white px-4 py-2 rounded hover:bg-orange-700">
          Continuer
        </button>
      </form>
    </div>
  );
}
