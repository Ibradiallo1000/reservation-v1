import React, { useCallback, useMemo, useState } from "react";
import {
  signInWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import { auth, db } from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  ArrowRight,
  User2,
  Shield,
  Loader2,
  AlertCircle,
  LogOut,
} from "lucide-react";

// ----------------- Helpers
const normalizeEmail = (s: string) => s.trim().toLowerCase();
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const normalizeRole = (r?: string) => {
  const raw = (r || "user").toString().trim().toLowerCase();
  if (raw === "chef_agence" || raw === "chefagence") return "chefAgence";
  if (raw === "admin plateforme" || raw === "admin_platforme") return "admin_platforme";
  if (raw === "admin compagnie" || raw === "admin_compagnie") return "admin_compagnie";
  if (raw === "agent_courrier" || raw === "agentcourrier") return "agentCourrier";
  if (raw === "superviseur") return "superviseur";
  if (raw === "guichetier") return "guichetier";
  if (raw === "comptable") return "comptable";
  if (raw === "compagnie") return "compagnie";
  if (raw === "embarquement") return "embarquement";
  return "user";
};

const routeForRole = (role: string) => {
  switch (role) {
    case "admin_platforme": return "/admin/dashboard";
    case "admin_compagnie":
    case "compagnie":       return "/compagnie/dashboard";
    case "chefAgence":
    case "superviseur":
    case "agentCourrier":   return "/agence/dashboard";
    case "guichetier":      return "/agence/guichet";
    case "embarquement":    return "/agence/embarquement";
    case "comptable":       return "/agence/comptabilite";
    default:                return "/";
  }
};

// Hash SHA256 (pour publicProfiles/{hash(email)})
async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

type PublicProfile = {
  displayName?: string;
  roleLabel?: string;
};

// ========================================
// LoginPage (2 étapes)
// ========================================
const LoginPage: React.FC = () => {
  const nav = useNavigate();

  const [step, setStep] = useState<"identify"|"password">("identify");
  const [email, setEmail] = useState("");
  const [profile, setProfile] = useState<PublicProfile|null>(null);
  const [idError, setIdError] = useState("");
  const [loadingId, setLoadingId] = useState(false);

  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [authError, setAuthError] = useState("");
  const [loadingAuth, setLoadingAuth] = useState(false);

  // ============ Étape 1 : Identification (profil public d'abord)
  const handleIdentify = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setIdError("");
    setProfile(null);

    const mail = normalizeEmail(email);
    if (!isValidEmail(mail)) {
      setIdError("Adresse e-mail invalide");
      return;
    }

    setLoadingId(true);
    try {
      // 1) Source de vérité pour l’étape 1 : publicProfiles
      const key = await sha256Hex(mail);
      const snap = await getDoc(doc(db, "publicProfiles", key));
      if (!snap.exists()) {
        setIdError("Aucun compte trouvé pour cet e-mail");
        return;
      }
      setProfile(snap.data() as PublicProfile);

      // 2) Vérification Auth (non bloquante, juste informative)
      try {
        const methods = await fetchSignInMethodsForEmail(auth, mail);
        if (!methods.length) {
          console.warn("Aucun compte Auth pour cet e-mail (profil public présent).");
        }
      } catch { /* ignore */ }

      setStep("password");
    } catch (err: any) {
      setIdError(err?.message || "Erreur réseau");
    } finally {
      setLoadingId(false);
    }
  }, [email]);

  // ============ Étape 2 : Authentification (Auth + users/{uid} pour rôle)
  const handleAuth = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    setLoadingAuth(true);
    try {
      await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);

      // Lecture du rôle complet depuis Firestore
      const snap = await getDoc(doc(db, "users", cred.user.uid));
      const role = normalizeRole((snap.exists() ? (snap.data() as any)?.role : undefined) as string);
      nav(routeForRole(role), { replace: true });
    } catch (err: any) {
      const code = err?.code || "";
      if (code === "auth/user-not-found") {
        setAuthError("Aucun compte Auth pour cet e-mail. Demandez une invitation à un administrateur.");
      } else if (code === "auth/wrong-password") {
        setAuthError("Mot de passe incorrect.");
      } else if (code === "auth/too-many-requests") {
        setAuthError("Trop d’essais. Réessayez plus tard.");
      } else {
        setAuthError("Connexion impossible : " + (err?.message || "erreur inconnue"));
      }
    } finally {
      setLoadingAuth(false);
    }
  }, [email, password, remember, nav]);

  const displayName = useMemo(() => {
    if (profile?.displayName) return profile.displayName;
    const localPart = email.split("@")[0]?.replace(/[._-]+/g, " ") ?? "";
    return localPart ? localPart.charAt(0).toUpperCase() + localPart.slice(1) : "Utilisateur";
  }, [profile, email]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white border border-orange-100 rounded-2xl shadow-xl shadow-orange-100/50">
        <div className="px-8 pt-8">
          <div className="h-12 w-12 rounded-2xl bg-orange-500/10 grid place-content-center">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-orange-600">
              <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15" />
              <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">
            {step === "identify" ? "Connexion" : "Confirmez votre identité"}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            {step === "identify"
              ? "Entrez votre e-mail pour continuer."
              : "Vérifiez votre profil puis saisissez votre mot de passe."}
          </p>
        </div>

        <div className="px-8 pb-8 pt-6">
          {step === "identify" && (
            <form onSubmit={handleIdentify} className="space-y-5">
              <div>
                <label className="text-sm font-medium text-slate-700">Adresse e-mail</label>
                <div className="relative mt-1">
                  <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="email"
                    className="w-full rounded-xl border pl-10 pr-3 py-3 text-sm border-slate-200 focus:border-orange-500 focus:ring-orange-100 outline-none"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="exemple@domaine.com"
                    autoFocus
                  />
                </div>
                {idError && <p className="text-xs text-red-600 mt-1">{idError}</p>}
              </div>

              <button
                type="submit"
                disabled={loadingId || !isValidEmail(email)}
                className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
                  loadingId
                    ? "bg-orange-300/70 cursor-not-allowed"
                    : "bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-600/20"
                }`}
              >
                {loadingId ? (<><Loader2 className="h-4 w-4 animate-spin" /> Vérification…</>) : "Continuer"}
              </button>
            </form>
          )}

          {step === "password" && (
            <div className="space-y-6">
              <div className="rounded-xl border divide-y">
                <Row icon={<User2 />} label="Nom" value={displayName} />
                {profile?.roleLabel && <Row icon={<Shield />} label="Rôle" value={profile.roleLabel} />}
              </div>

              <form onSubmit={handleAuth} className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-slate-700">Mot de passe</label>
                  <div className="relative mt-1">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full rounded-xl border pl-10 pr-3 py-3 text-sm border-slate-200 focus:border-orange-500 focus:ring-orange-100 outline-none"
                      autoFocus
                    />
                  </div>
                  {authError && (
                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3.5 w-3.5" /> {authError}
                    </p>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <label className="inline-flex items-center gap-2 text-sm text-slate-600 select-none">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-0"
                    />
                    Se souvenir de moi
                  </label>
                  <button
                    type="button"
                    onClick={() => { setStep("identify"); setPassword(""); setAuthError(""); }}
                    className="text-sm text-slate-600 hover:text-slate-800 flex items-center gap-1"
                  >
                    <LogOut className="h-3.5 w-3.5" /> Changer d’e-mail
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loadingAuth || !password}
                  className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
                    loadingAuth
                      ? "bg-orange-300/70 cursor-not-allowed"
                      : "bg-orange-600 hover:bg-orange-700 shadow-lg shadow-orange-600/20"
                  }`}
                >
                  {loadingAuth ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Connexion…</>
                  ) : (
                    <>Continuer <ArrowRight className="h-4 w-4" /></>
                  )}
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div className="text-sm text-slate-600 flex items-center gap-2">
        <span className="text-slate-400">{icon}</span>{label}
      </div>
      <div className="text-sm font-medium text-slate-900 truncate">{value}</div>
    </div>
  );
}

export default LoginPage;
