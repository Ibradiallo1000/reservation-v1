/**
 * AcceptInvitationPage — Spark-compatible invitation activation.
 *
 * Flow:
 *   1. Admin creates company → invitation doc with `token` is written to Firestore.
 *   2. Admin copies the activation link and shares it manually.
 *   3. CEO opens `/accept-invitation/:token`.
 *   4. This page queries Firestore for `invitations` where token == param.
 *   5. CEO sets a password.
 *   6. Firebase Auth user is created client-side (createUserWithEmailAndPassword).
 *   7. Firestore `users` doc is created, invitation marked "accepted".
 *   8. CEO is redirected to login.
 *
 * No Cloud Function required. Works on Firebase Spark plan.
 */

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import {
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, db } from "@/firebaseConfig";
import { useOnlineStatus } from "@/shared/hooks/useOnlineStatus";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InvitationData {
  id: string;
  email: string;
  role: string;
  fullName?: string;
  companyId?: string;
  agencyId?: string;
  status: "pending" | "accepted";
  token: string;
}

/** Normalize invitation role to canonical role before writing user document. */
function normalizeInvitationRole(role: string, agencyId?: string): string {
  if (role === "company_ceo") return "admin_compagnie";
  if (role === "comptable" && agencyId) return "agency_accountant";
  if (role === "comptable") return "company_accountant";
  return role;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const AcceptInvitationPage = () => {
  const isOnline = useOnlineStatus();
  const { invitationId: token } = useParams<{ invitationId: string }>();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Form fields
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");

  /* ── Load invitation by token ── */
  useEffect(() => {
    if (!token) {
      setError("Lien d'invitation invalide.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        // 1) Lookup by token field (new invitations)
        const q = query(
          collection(db, "invitations"),
          where("token", "==", token),
        );
        const snap = await getDocs(q);

        let docSnap: any = snap.docs[0] ?? null;

        // 2) Fallback: lookup by document ID (legacy invitations without token field)
        if (!docSnap) {
          const directRef = doc(db, "invitations", token!);
          const directSnap = await getDoc(directRef);
          if (directSnap.exists()) {
            docSnap = directSnap;
          }
        }

        if (!docSnap) {
          setError("Invitation introuvable. Le lien est peut-être expiré ou invalide.");
          return;
        }

        const data = docSnap.data();

        if (data.status !== "pending") {
          setError("Cette invitation a déjà été utilisée.");
          return;
        }

        const inv: InvitationData = {
          id: docSnap.id,
          email: data.email || "",
          role: data.role || "",
          fullName: data.fullName,
          companyId: data.companyId,
          agencyId: data.agencyId,
          status: data.status,
          token: data.token,
        };

        setInvitation(inv);
        if (inv.fullName) setDisplayName(inv.fullName);
      } catch (err) {
        console.error("Error loading invitation:", err);
        setError("Erreur lors du chargement de l'invitation.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token, reloadKey]);

  /* ── Handle account creation ── */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    // Validation
    if (password.length < 6) {
      setError("Le mot de passe doit contenir au moins 6 caractères.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    if (!displayName.trim()) {
      setError("Le nom complet est requis.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      // 1. Create Firebase Auth user
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        invitation.email,
        password,
      );
      const firebaseUser = userCredential.user;

      // 2. Set display name
      await updateProfile(firebaseUser, {
        displayName: displayName.trim(),
      });

      const canonicalRole = normalizeInvitationRole(
        invitation.role,
        invitation.agencyId
      );

      // 3. Create user document in Firestore
      await setDoc(doc(db, "users", firebaseUser.uid), {
        uid: firebaseUser.uid,
        email: invitation.email,
        nom: displayName.trim(),
        role: canonicalRole,
        companyId: invitation.companyId || "",
        agencyId: invitation.agencyId || "",
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        invitationId: invitation.id,
      });

      // 4. Mark invitation as accepted
      await updateDoc(doc(db, "invitations", invitation.id), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
        uid: firebaseUser.uid,
      });

      // 5. Sync invitation pending in agency subcollection (ManagerTeamPage flow)
      if (invitation.companyId && invitation.agencyId) {
        const agencyUserRef = doc(
          db,
          "companies",
          invitation.companyId,
          "agences",
          invitation.agencyId,
          "users",
          invitation.id
        );
        try {
          await updateDoc(agencyUserRef, {
            invitationPending: false,
            uid: firebaseUser.uid,
          });
        } catch {
          // Doc may not exist (AgencePersonnelPage flow); ignore
        }
      }

      // 6. Sign out (user will log in fresh on the login page)
      await signOut(auth);

      setSuccess(true);
    } catch (err: any) {
      console.error("Account creation error:", err);

      if (err?.code === "auth/email-already-in-use") {
        setError(
          "Un compte existe déjà avec cet email. Connectez-vous directement ou contactez l'administrateur.",
        );
      } else if (err?.code === "auth/weak-password") {
        setError("Le mot de passe est trop faible. Utilisez au moins 6 caractères.");
      } else {
        setError(err?.message || "Erreur lors de la création du compte.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render: Loading ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Chargement de l'invitation…</p>
        </div>
      </div>
    );
  }

  /* ── Render: Error (no invitation) ── */
  if (error && !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white border border-red-200 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Invitation invalide</h2>
          <p className="text-sm text-red-600 mb-4">{error}</p>
          {!isOnline && (
            <p className="text-xs text-amber-700 mb-4">
              Connexion indisponible. Vérifiez le réseau puis réessayez.
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mb-3">
            <button
              onClick={() => setReloadKey((v) => v + 1)}
              className="text-sm px-3 py-1.5 border rounded-lg hover:bg-gray-50"
            >
              Réessayer
            </button>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="text-sm text-orange-600 hover:underline"
          >
            Aller à la page de connexion
          </button>
        </div>
      </div>
    );
  }

  /* ── Render: Success ── */
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white border border-green-200 rounded-xl p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Compte créé avec succès !</h2>
          <p className="text-sm text-gray-600 mb-6">
            Votre compte a été activé. Vous pouvez maintenant vous connecter avec votre email et mot de passe.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full bg-orange-600 text-white py-2.5 rounded-lg font-medium hover:bg-orange-700 transition"
          >
            Se connecter
          </button>
        </div>
      </div>
    );
  }

  if (!invitation) return null;

  /* ── Render: Form ── */
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow-sm border w-full max-w-md space-y-5"
      >
        {!isOnline && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3">
            <p className="text-xs text-amber-800">
              Connexion instable: la création de compte peut échouer.
            </p>
          </div>
        )}
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900">Activer votre compte</h1>
          <p className="text-sm text-gray-500 mt-1">
            Définissez votre mot de passe pour accéder à la plateforme.
          </p>
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            value={invitation.email}
            disabled
            className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 text-gray-600 text-sm"
          />
        </div>

        {/* Full name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Nom complet <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            placeholder="Votre nom complet"
            required
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Mot de passe <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            placeholder="Minimum 6 caractères"
            minLength={6}
            required
          />
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirmer le mot de passe <span className="text-red-500">*</span>
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
            placeholder="Retapez votre mot de passe"
            minLength={6}
            required
          />
        </div>

        {/* Role info */}
        <div className="rounded-lg bg-orange-50 border border-orange-200 px-4 py-3">
          <p className="text-xs text-orange-800">
            <strong>Rôle attribué :</strong>{" "}
            {invitation.role === "company_ceo" ? "Administrateur Compagnie (CEO)" : invitation.role}
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-600 text-white py-2.5 rounded-lg font-medium hover:bg-orange-700 transition disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {submitting ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Création du compte…
            </span>
          ) : (
            "Créer mon compte"
          )}
        </button>
      </form>
    </div>
  );
};

export default AcceptInvitationPage;
