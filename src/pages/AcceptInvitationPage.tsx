import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { auth, db } from "@/firebaseConfig";

type InvitationData = {
  email: string;
  role: string;
  companyId: string;
  agencyId?: string;
  status: "pending" | "accepted";
};

const routeForRole = (role: string) => {
  switch (role) {
    case "admin_compagnie":
    case "compagnie":
      return "/compagnie/dashboard";
    case "chefAgence":
    case "superviseur":
      return "/agence/dashboard";
    case "guichetier":
      return "/agence/guichet";
    case "comptable":
      return "/agence/comptabilite";
    default:
      return "/";
  }
};

const AcceptInvitationPage = () => {
  const { invitationId } = useParams();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* =========================
     Charger invitation
  ========================= */
  useEffect(() => {
    if (!invitationId) return;

    (async () => {
      try {
        const ref = doc(db, "invitations", invitationId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
          setError("Invitation introuvable.");
          return;
        }

        const data = snap.data() as InvitationData;

        if (data.status !== "pending") {
          setError("Cette invitation a déjà été utilisée.");
          return;
        }

        setInvitation(data);
      } catch {
        setError("Erreur lors du chargement de l’invitation.");
      } finally {
        setLoading(false);
      }
    })();
  }, [invitationId]);

  /* =========================
     Activation compte
  ========================= */
  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;

    setError(null);

    if (password.length < 6) {
      setError("Mot de passe trop court (minimum 6 caractères).");
      return;
    }

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    try {
      const cred = await createUserWithEmailAndPassword(
        auth,
        invitation.email,
        password
      );

      const uid = cred.user.uid;

      await setDoc(doc(db, "users", uid), {
        uid,
        email: invitation.email,
        role: invitation.role,
        companyId: invitation.companyId,
        agencyId: invitation.agencyId ?? null,
        status: "actif",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "invitations", invitationId!), {
        status: "accepted",
        acceptedAt: serverTimestamp(),
        userId: uid,
      });

      navigate(routeForRole(invitation.role), { replace: true });
    } catch (err: any) {
      setError(err.message || "Erreur lors de l’activation.");
    }
  };

  if (loading) return <div className="p-8 text-center">Chargement…</div>;

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="bg-white border rounded-xl p-6 text-red-600 font-medium">
          {error}
        </div>
      </div>
    );
  }

  if (!invitation) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleActivate}
        className="bg-white p-8 rounded-2xl shadow w-full max-w-md space-y-5"
      >
        <h1 className="text-xl font-bold text-center text-orange-600">
          Activer votre compte
        </h1>

        {/* EMAIL */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            value={invitation.email}
            disabled
            className="w-full border rounded-lg px-3 py-2 bg-gray-100 text-gray-700"
          />
        </div>

        {/* MOT DE PASSE */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Mot de passe
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            required
          />
        </div>

        {/* CONFIRMATION */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Confirmer le mot de passe
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border rounded-lg px-3 py-2"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-orange-600 text-white py-2.5 rounded-lg font-medium hover:bg-orange-700 transition"
        >
          Activer mon compte
        </button>
      </form>
    </div>
  );
};

export default AcceptInvitationPage;
