import React, { useState, useCallback } from "react";
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  getIdTokenResult,
} from "firebase/auth";
import { auth, db } from "../firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { permissionsByRole } from "@/roles-permissions";
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2, Loader2, LogOut, ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext"; // ← pour logout

type AnyRole = keyof typeof permissionsByRole | string;

const normalizeRole = (r?: string): AnyRole => {
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

const routeForRole = (role: AnyRole) => {
  switch (role) {
    case "admin_platforme":
      return "/admin/dashboard";
    case "admin_compagnie":
    case "compagnie":
      return "/compagnie/dashboard";
    case "chefAgence":
    case "superviseur":
    case "agentCourrier":
      return "/agence/dashboard";
    case "guichetier":
      return "/agence/guichet";
    case "embarquement":
      return "/agence/embarquement";
    case "comptable":
      return "/agence/comptabilite";
    default:
      return "/";
  }
};

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const MIN_PWD = 6;

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [motDePasse, setMotDePasse] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [pwdError, setPwdError] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error" | "">("");

  const navigate = useNavigate();
  const { logout } = useAuth();

  const resolveRoleAndRedirect = useCallback(async (uid: string) => {
    const claims = (await getIdTokenResult(auth.currentUser!)).claims as any;
    let role: AnyRole | undefined = claims?.role ? normalizeRole(String(claims.role)) : undefined;

    if (!role || !(role in permissionsByRole)) {
      const snap = await getDoc(doc(db, "users", uid));
      if (snap.exists()) role = normalizeRole((snap.data() as any)?.role);
    }
    if (!role || !(role in permissionsByRole)) {
      setMessage("Votre compte n'a pas encore de rôle valide. Contactez un administrateur.");
      setMessageType("error");
      return;
    }
    navigate(routeForRole(role), { replace: true });
  }, [navigate]);

  // ❌ IMPORTANT : pas d’auto-redir si auth.currentUser existe.
  // (Si tu veux forcer une reconnexion obligatoire, tu peux décommenter ceci:)
  // useEffect(() => { logout().catch(() => {}); }, [logout]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setMessageType("");

    const emailOK = isValidEmail(email);
    const pwdOK = motDePasse.length >= MIN_PWD;
    setEmailError(emailOK ? "" : "Adresse e-mail invalide.");
    setPwdError(pwdOK ? "" : `Au moins ${MIN_PWD} caractères.`);
    if (!emailOK || !pwdOK || isLoading) return;

    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), motDePasse);
      await getIdTokenResult(cred.user); // pas de refresh forcé
      await resolveRoleAndRedirect(cred.user.uid);
    } catch (err: any) {
      console.error("login error:", err);
      setMessage("Erreur de connexion : " + (err?.message || ""));
      setMessageType("error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setMessage("");
    setMessageType("");
    if (!email.trim()) return setEmailError("Renseigne ton e-mail pour réinitialiser le mot de passe.");
    if (!isValidEmail(email)) return setEmailError("Adresse e-mail invalide.");
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Un e-mail de réinitialisation t'a été envoyé.");
      setMessageType("success");
    } catch (err: any) {
      setMessage("Échec de l'envoi : " + (err?.message || ""));
      setMessageType("error");
    }
  };

  const disabled =
    isLoading || !isValidEmail(email) || motDePasse.length < MIN_PWD || !!emailError || !!pwdError;

  const already = !!auth.currentUser; // ← session active ?

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="relative bg-white border border-orange-100 rounded-2xl shadow-xl shadow-orange-100/50">
          {/* Bandeau si déjà connecté */}
          {already && (
            <div className="px-6 py-3 bg-amber-50 border-b border-amber-200 rounded-t-2xl text-sm text-amber-800 flex items-center justify-between gap-3">
              <span>Vous êtes déjà connecté.</span>
              <div className="flex gap-2">
                <button
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 bg-orange-600 text-white text-xs font-medium hover:bg-orange-700"
                  onClick={async () => {
                    const claims = (await getIdTokenResult(auth.currentUser!)).claims as any;
                    const role = normalizeRole(claims?.role);
                    navigate(routeForRole(role), { replace: true });
                  }}
                >
                  Continuer <ArrowRight className="h-3.5 w-3.5" />
                </button>
                <button
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 bg-white text-amber-800 text-xs font-medium border border-amber-300 hover:bg-amber-100"
                  onClick={() => logout()}
                >
                  <LogOut className="h-3.5 w-3.5" /> Se déconnecter
                </button>
              </div>
            </div>
          )}

          {/* Formulaire de connexion (toujours visible) */}
          <div className="px-8 pt-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-orange-600">
                <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15" />
                <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="12" cy="12" r="2" fill="currentColor" />
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Connexion</h1>
            <p className="mt-1 text-sm text-slate-600">Accédez à votre espace en toute sécurité.</p>
          </div>

          <form onSubmit={handleLogin} className="px-8 pb-8 pt-6 space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">Adresse e-mail</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="exemple@domaine.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`w-full rounded-xl border bg-white pl-10 pr-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-2 ring-transparent transition ${
                    emailError ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:border-orange-500 focus:ring-orange-100"
                  }`}
                  autoComplete="email"
                />
              </div>
              {emailError && <p className="text-xs text-red-600">{emailError}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">Mot de passe</label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  placeholder="••••••••"
                  value={motDePasse}
                  onChange={(e) => setMotDePasse(e.target.value)}
                  className={`w-full rounded-xl border bg-white pl-10 pr-10 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-2 ring-transparent transition ${
                    pwdError ? "border-red-300 focus:ring-red-100" : "border-slate-200 focus:border-orange-500 focus:ring-orange-100"
                  }`}
                  autoComplete="current-password"
                  minLength={MIN_PWD}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition"
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwdError && <p className="text-xs text-red-600">{pwdError}</p>}
            </div>

            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 select-none">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-0" />
                Se souvenir de moi
              </label>
              <button type="button" className="text-sm font-medium text-orange-600 hover:text-orange-700" onClick={handleResetPassword}>
                Mot de passe oublié ?
              </button>
            </div>

            {message && (
              <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
                messageType === "success" ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
              }`}>
                {messageType === "success" ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                )}
                <p className={`text-sm ${messageType === "success" ? "text-emerald-800" : "text-red-700"}`}>{message}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={disabled}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition ${
                disabled ? "bg-orange-300/70 cursor-not-allowed" : "bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-lg shadow-orange-600/20"
              }`}
            >
              {isLoading ? (<><Loader2 className="h-4 w-4 animate-spin" />Connexion en cours...</>) : "Se connecter"}
            </button>

            <p className="text-center text-xs text-slate-500">
              En vous connectant, vous acceptez nos Conditions et notre Politique de confidentialité.
            </p>
          </form>
        </div>

        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500">
            Propulsé par <span className="font-semibold text-orange-700">Teliya</span>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
