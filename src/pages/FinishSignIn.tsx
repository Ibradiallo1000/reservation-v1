// =============================================
// src/pages/FinishSignIn.tsx
// - Finalise la connexion par lien e-mail
// - Lit l'invitation (invites) et crée users/{uid} avec role/companyId/agencyId
// - Marque l'invitation comme "consumed"
// =============================================
import React, { useEffect, useState } from "react";
import { auth, db } from "@/firebaseConfig";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
} from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import PageLoader from "@/components/PageLoaderComponent";

const FinishSignIn: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [needEmail, setNeedEmail] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        if (!isSignInWithEmailLink(auth, window.location.href)) {
          setErr("Lien invalide ou expiré.");
          return;
        }
        // email en localStorage (si ouverture sur le même navigateur)
        const stored = window.localStorage.getItem("emailForSignIn");
        if (!stored) {
          // demande le mail si on ne l'a pas
          setNeedEmail(true);
          return;
        }
        setEmail(stored);

        // Connexion
        const cred = await signInWithEmailLink(auth, stored, window.location.href);
        window.localStorage.removeItem("emailForSignIn");

        // Chercher l'invitation la plus récente pour cet email
        const q = query(
          collection(db, "invites"),
          where("email", "==", stored),
          where("status", "==", "pending"),
          limit(1)
        );
        const snap = await getDocs(q);

        let companyId: string | null = null;
        let agencyId: string | null = null;
        let role = "chefAgence";
        let inviteId: string | null = null;

        if (!snap.empty) {
          const d = snap.docs[0];
          const data = d.data() as any;
          companyId = data.companyId || null;
          agencyId = data.agencyId || null;
          role = data.role || "chefAgence";
          inviteId = d.id;
        }

        // Créer /users/{uid}
        const uid = cred.user.uid;
        await setDoc(doc(db, "users", uid), {
          uid,
          email: cred.user.email,
          displayName: cred.user.displayName || "",
          phoneNumber: cred.user.phoneNumber || "",
          role,
          companyId,
          agencyId,
          status: "active",
          provider: "emailLink",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });

        // marquer l'invitation comme consommée
        if (inviteId) {
          await updateDoc(doc(db, "invites", inviteId), {
            status: "consumed",
            consumedAt: serverTimestamp(),
            consumedBy: uid,
          });
        }

        // Rediriger selon le rôle
        if (agencyId) {
          navigate("/agence/dashboard", { replace: true });
        } else if (companyId) {
          navigate("/compagnie/dashboard", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      } catch (e: any) {
        console.error(e);
        setErr(e?.message || "Échec de la connexion.");
      }
    };
    run();
  }, [navigate]);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    try {
      if (!email) return;
      // Connexion si le lien est encore valide
      const cred = await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem("emailForSignIn");

      // Même logique que ci-dessus pour invitation
      const q = query(
        collection(db, "invites"),
        where("email", "==", email),
        where("status", "==", "pending"),
        limit(1)
      );
      const snap = await getDocs(q);

      let companyId: string | null = null;
      let agencyId: string | null = null;
      let role = "chefAgence";
      let inviteId: string | null = null;

      if (!snap.empty) {
        const d = snap.docs[0];
        const data = d.data() as any;
        companyId = data.companyId || null;
        agencyId = data.agencyId || null;
        role = data.role || "chefAgence";
        inviteId = d.id;
      }

      const uid = cred.user.uid;
      await setDoc(doc(db, "users", uid), {
        uid,
        email: cred.user.email,
        displayName: cred.user.displayName || "",
        phoneNumber: cred.user.phoneNumber || "",
        role,
        companyId,
        agencyId,
        status: "active",
        provider: "emailLink",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      if (inviteId) {
        await updateDoc(doc(db, "invites", inviteId), {
          status: "consumed",
          consumedAt: serverTimestamp(),
          consumedBy: uid,
        });
      }

      if (agencyId) {
        navigate("/agence/dashboard", { replace: true });
      } else if (companyId) {
        navigate("/compagnie/dashboard", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Échec de la connexion.");
    }
  };

  if (err) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-2">Erreur</h1>
          <p className="text-red-600 mb-4">{err}</p>
          <a href="/" className="text-blue-600 underline">Retour à l’accueil</a>
        </div>
      </div>
    );
  }

  if (needEmail) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <form onSubmit={submitEmail} className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-2">Confirmer votre e-mail</h1>
          <p className="text-sm text-gray-600 mb-4">
            Entrez l’adresse e-mail sur laquelle vous avez reçu le lien.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.trim())}
            className="w-full border rounded px-3 py-2 mb-4"
            placeholder="exemple@domaine.com"
          />
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2"
          >
            Continuer
          </button>
        </form>
      </div>
    );
  }

  return <PageLoader fullScreen />;
};

export default FinishSignIn;
