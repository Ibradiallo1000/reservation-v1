// src/pages/FinishSignIn.tsx
// =============================================
// Finalise la connexion par lien e-mail
// - Vérifie le sign-in link
// - Récupère l'invite la plus récente (status in ["pending","sent"])
// - Crée / merge users/{uid}
// - Appelle la Cloud Function `claimInvite` (si invite existante)
// - Force refresh du token pour récupérer les custom claims
// - Redirige vers l'agence / compagnie / accueil selon claims
// =============================================

import React, { useEffect, useState } from "react";
import { auth, db } from "@/firebaseConfig";
import {
  isSignInWithEmailLink,
  signInWithEmailLink,
  updateProfile,
} from "firebase/auth";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  doc as firestoreDoc,
  setDoc,
  serverTimestamp,
  DocumentData,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { useNavigate } from "react-router-dom";
import PageLoader from "@/components/PageLoaderComponent";

const normalizeEmail = (s: string) => s.trim().toLowerCase();

type Invite = {
  email: string;
  name?: string;
  phone?: string;
  role?: string;
  companyId?: string | null;
  agencyId?: string | null;
  status: "pending" | "sent" | "consumed" | "accepted";
  createdAt?: any;
};

const FinishSignIn: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [needEmail, setNeedEmail] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const finalizeWithEmail = async (rawEmail: string) => {
    setBusy(true);
    setErr(null);

    try {
      const normEmail = normalizeEmail(rawEmail);

      // 1) vérifier que l'URL contient bien un sign-in link
      if (!isSignInWithEmailLink(auth, window.location.href)) {
        throw new Error("Lien invalide ou expiré.");
      }

      // 2) sign in with email link
      const cred = await signInWithEmailLink(
        auth,
        normEmail,
        window.location.href
      );
      // nettoyer localStorage
      try {
        window.localStorage.removeItem("emailForSignIn");
      } catch {}

      const user = cred.user;
      const uid = user.uid;
      const effectiveEmail = user.email || normEmail;

      // 3) récupérer la dernière invite (pending | sent)
      //    Note: Firestore TS overload pour where(..., "in", ...) peut être strict,
      //    on caste en any sur la valeur d'array pour contourner l'ergonomie TS.
      const invitesQ = query(
        collection(db, "invites"),
        where("email", "==", normEmail),
        where("status", "in" as any, ["pending", "sent"]),
        orderBy("createdAt", "desc"),
        limit(1)
      );

      const invitesSnap = await getDocs(invitesQ);

      let inviteId: string | null = null;
      let inviteData: Invite | null = null;

      if (!invitesSnap.empty) {
        const docInv = invitesSnap.docs[0];
        inviteId = docInv.id;
        inviteData = docInv.data() as Invite;
      }

      // 4) essayer de mettre à jour displayName depuis l'invite
      if (inviteData?.name) {
        try {
          await updateProfile(user, { displayName: inviteData.name });
        } catch (e) {
          // non bloquant
          console.warn("updateProfile échoué:", e);
        }
      }

      // 5) créer / merge le document users/{uid}
      await setDoc(
        firestoreDoc(db, "users", uid),
        {
          uid,
          email: effectiveEmail,
          displayName: user.displayName || inviteData?.name || "",
          phoneNumber: user.phoneNumber || inviteData?.phone || "",
          role: inviteData?.role || "user",
          companyId: inviteData?.companyId || null,
          agencyId: inviteData?.agencyId || null,
          status: "active",
          provider: "emailLink",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 6) si invite existante -> appeler la Cloud Function pour la "claim"
      if (inviteId) {
        try {
          const functions = getFunctions();
          const claimInvite = httpsCallable(functions, "claimInvite");
          await claimInvite({ inviteId });
        } catch (fnErr) {
          // on log mais on ne bloque pas l'accès client
          console.error("Erreur claimInvite:", fnErr);
        }

        // forcer le refresh du token pour récupérer les claims fraichement posés
        try {
          await auth.currentUser?.getIdToken(true);
        } catch (tErr) {
          console.warn("Impossible de forcer refresh token:", tErr);
        }
      }

      // 7) rediriger selon les claims (priorité aux claims, sinon fallback inviteData)
      try {
        const idTokenResult = await auth.currentUser?.getIdTokenResult();
        const claims = idTokenResult?.claims || {};

        if (claims.agencyId) {
          navigate(`/agence/${claims.agencyId}/dashboard`, { replace: true });
          return;
        }
        if (claims.companyId) {
          navigate("/compagnie/dashboard", { replace: true });
          return;
        }
      } catch (e) {
        // ignore, on essaiera fallback
      }

      // fallback : si inviteData contient agencyId / companyId
      if (inviteData?.agencyId) {
        navigate(`/agence/${inviteData.agencyId}/dashboard`, { replace: true });
      } else if (inviteData?.companyId) {
        navigate("/compagnie/dashboard", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (error: any) {
      console.error("FinishSignIn error:", error);
      setErr(error?.message || "Échec de la connexion.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        if (!isSignInWithEmailLink(auth, window.location.href)) {
          setErr("Lien invalide ou expiré.");
          return;
        }

        const stored = window.localStorage.getItem("emailForSignIn");
        if (!stored) {
          setNeedEmail(true);
          return;
        }

        await finalizeWithEmail(stored);
      } catch (e: any) {
        console.error(e);
        setErr(e?.message || "Échec de la connexion.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (!email) return;
    await finalizeWithEmail(email);
  };

  if (err) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm">
          <h1 className="text-xl font-semibold mb-2">Erreur</h1>
          <p className="text-red-600 mb-4">{err}</p>
          <a href="/" className="text-blue-600 underline">
            Retour à l’accueil
          </a>
        </div>
      </div>
    );
  }

  if (needEmail) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <form
          onSubmit={submitEmail}
          className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm"
        >
          <h1 className="text-xl font-semibold mb-2">Confirmer votre e-mail</h1>
          <p className="text-sm text-gray-600 mb-4">
            Entrez l’adresse e-mail sur laquelle vous avez reçu le lien.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value.trim().toLowerCase())}
            className="w-full border rounded px-3 py-2 mb-4"
            placeholder="exemple@domaine.com"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded px-4 py-2 disabled:opacity-60"
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
