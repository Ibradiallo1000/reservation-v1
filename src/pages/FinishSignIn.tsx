// =============================================
// src/pages/FinishSignIn.tsx
// - Finalise la connexion par lien e-mail
// - Lit l'invitation (invites) la plus récente (status in ["pending","sent"])
// - Crée/merge users/{uid} avec role/companyId/agencyId
// - Marque l'invitation comme "consumed"
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
  doc,
  setDoc,
  updateDoc,
  serverTimestamp,
  orderBy,
  limit,
} from "firebase/firestore";
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
};

const FinishSignIn: React.FC = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [needEmail, setNeedEmail] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // --- logique factorisée pour éviter la duplication
  const finalizeWithEmail = async (rawEmail: string) => {
    setBusy(true);
    try {
      const normEmail = normalizeEmail(rawEmail);

      // 1) sécurité : lien encore valide ?
      if (!isSignInWithEmailLink(auth, window.location.href)) {
        throw new Error("Lien invalide ou expiré.");
      }

      // 2) authentifier avec le lien e-mail
      const cred = await signInWithEmailLink(auth, normEmail, window.location.href);
      window.localStorage.removeItem("emailForSignIn");

      // 3) récupérer la dernière invitation "pending" ou "sent" pour cet email
      //    (nécessite un index composite si Firestore le demande : status + orderBy)
      const qInv = query(
        collection(db, "invites"),
        where("email", "==", normEmail),
        where("status", "in", ["pending", "sent"] as any),
        orderBy("createdAt", "desc"),
        limit(1)
      );
      const snapInv = await getDocs(qInv);

      let companyId: string | null = null;
      let agencyId: string | null = null;
      let role = "chefAgence";
      let inviteId: string | null = null;
      let inviteData: Invite | null = null;

      if (!snapInv.empty) {
        const docInv = snapInv.docs[0];
        inviteId = docInv.id;
        inviteData = docInv.data() as Invite;
        companyId = inviteData.companyId ?? null;
        agencyId = inviteData.agencyId ?? null;
        role = inviteData.role || "chefAgence";
      }

      // 4) optionnel: mettre à jour le displayName depuis l’invitation
      if (inviteData?.name) {
        try {
          await updateProfile(cred.user, { displayName: inviteData.name });
        } catch {
          // non bloquant
        }
      }

      // 5) créer/mettre à jour users/{uid}
      const uid = cred.user.uid;
      const effectiveEmail = cred.user.email || normEmail; // parfois email est null en sign-in link
      await setDoc(
        doc(db, "users", uid),
        {
          uid,
          email: effectiveEmail,
          displayName: cred.user.displayName || inviteData?.name || "",
          phoneNumber: cred.user.phoneNumber || inviteData?.phone || "",
          role,
          companyId,
          agencyId,
          status: "active",
          provider: "emailLink",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 6) marquer l'invitation comme consommée (si existait)
      if (inviteId) {
        await updateDoc(doc(db, "invites", inviteId), {
          status: "consumed",
          consumedAt: serverTimestamp(),
          consumedBy: uid,
        });
      }

      // 7) rediriger (précise l’ID d’agence si présent)
      if (agencyId) {
        navigate(`/agence/${agencyId}/dashboard`, { replace: true });
      } else if (companyId) {
        navigate("/compagnie/dashboard", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e: any) {
      console.error(e);
      setErr(e?.message || "Échec de la connexion.");
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
          setNeedEmail(true); // demander l'email si on ne l'a pas
          return;
        }
        // email récupéré du même navigateur
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
