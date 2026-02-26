import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
} from "firebase/auth";
import {
  auth,
  db,
  logAuthConfigCheck,
  checkFirebaseAuthConnectivity,
} from "@/firebaseConfig";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  ArrowRight,
  Loader2,
  AlertCircle,
  LogOut,
} from "lucide-react";

/* ================= Helpers ================= */
const normalizeEmail = (s: string) => s.trim().toLowerCase();
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Canonical roles only. agency_boarding_officer / embarquement → chefEmbarquement. */
const CANONICAL_ROLES = new Set([
  "admin_platforme", "admin_compagnie", "company_accountant", "agency_accountant",
  "chef_garage", "chefagence", "chefembarquement", "guichetier",
  "agency_fleet_controller", "financial_director", "agentcourrier",
]);

const normalizeRole = (r?: string): string => {
  const raw = (r || "").trim().toLowerCase();
  if (raw === "company_ceo") return "admin_compagnie";
  if (raw === "chefagence") return "chefAgence";
  if (raw === "agentcourrier") return "agentCourrier";
  if (raw === "chefembarquement") return "chefEmbarquement";
  if (raw === "agency_boarding_officer" || raw === "embarquement") return "chefEmbarquement";
  return CANONICAL_ROLES.has(raw) ? (raw === "chefagence" ? "chefAgence" : raw) : "unauthenticated";
};

const routeForRole = (role: string): string => {
  switch (role) {
    case "admin_platforme":
      return "/admin/dashboard";
    case "admin_compagnie":
      return "/compagnie/command-center";
    case "company_accountant":
      return "/chef-comptable";
    case "chef_garage":
      return "/compagnie/garage/dashboard";
    case "chefAgence":
      return "/agence/dashboard";
    case "chefEmbarquement":
      return "/agence/boarding";
    case "agency_accountant":
      return "/agence/comptabilite";
    case "guichetier":
      return "/agence/guichet";
    case "agentCourrier":
      return "/agence/courrier";
    default:
      return "/login";
  }
};

const LoginPage: React.FC = () => {
  const nav = useNavigate();

  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const hasNavigated = useRef(false);

  const handleEmail = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isValidEmail(email)) {
      setError("Adresse e-mail invalide");
      return;
    }
    setStep("password");
  }, [email]);

  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasNavigated.current) return;

    setError("");
    setLoading(true);

    const stepLog = (step: string) => {
      console.info("[LoginPage] step:", step, new Date().toISOString());
    };

    try {
      stepLog("before setPersistence");
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      );
      stepLog("after setPersistence, before signInWithEmailAndPassword");

      const cred = await signInWithEmailAndPassword(
        auth,
        normalizeEmail(email),
        password
      );
      stepLog("after signInWithEmailAndPassword (Auth OK)");

      const snap = await getDoc(doc(db, "users", cred.user.uid));
      stepLog("after getDoc(users)");
      const userData = snap.exists() ? snap.data() : {};
      const rawRole = userData.role;

      // Legacy: resolve "comptable" before normalization (until migration runs)
      let roleToNormalize = rawRole;
      if (rawRole === "comptable" && userData.agencyId) {
        roleToNormalize = "agency_accountant";
      } else if (rawRole === "comptable" && !userData.agencyId) {
        roleToNormalize = "company_accountant";
      }
      const role = normalizeRole(roleToNormalize);

      const companyId = (userData.companyId ?? "") as string;
      const agencyId = (userData.agencyId ?? "") as string;

      console.info("[LoginPage] post-getDoc:", {
        role,
        companyId: companyId || "(empty)",
        agencyId: agencyId || "(empty)",
        rawRole,
      });

      if (role === "unauthenticated") {
        console.error("[LoginPage] role normalized to unauthenticated; raw role:", userData.role);
        setError("Profil incomplet (rôle manquant ou invalide). Contactez l’administrateur.");
        setLoading(false);
        return;
      }

      let path = routeForRole(role);
      if (role === "chefEmbarquement") {
        path = "/agence/boarding";
        hasNavigated.current = true;
        nav(path, { replace: true });
        setLoading(false);
        return;
      }
      if (role === "admin_compagnie" && companyId) {
        path = `/compagnie/${companyId}/command-center`;
      } else if (role === "admin_compagnie" && !companyId) {
        console.warn("[LoginPage] admin_compagnie without companyId, redirecting to /login");
        path = "/login";
      } else if (role === "chef_garage" && companyId) {
        path = `/compagnie/${companyId}/garage/dashboard`;
      } else if (role === "chef_garage" && !companyId) {
        console.warn("[LoginPage] chef_garage without companyId, redirecting to /login");
        path = "/login";
      }
      if (role === "company_accountant" && companyId) {
        path = `/compagnie/${companyId}/finances`;
      }

      if (!path || path === "") {
        path = role === "guichetier" ? "/agence/guichet" : "/login";
        console.warn("[LoginPage] path was empty, using fallback:", path);
      }
      console.info("[LoginPage] navigating to:", path);
      hasNavigated.current = true;
      nav(path, { replace: true });
    } catch (err: any) {
      const code = err?.code;
      const message = err?.message || "Erreur inconnue";
      console.error("❌ LoginPage - Erreur de connexion:", err);
      console.error("❌ LoginPage - Code:", code, "Message:", message);
      logAuthConfigCheck();

      hasNavigated.current = false;

      if (code === "auth/network-request-failed") {
        setError(
          "Erreur réseau (auth/network-request-failed). Vérifiez votre connexion, les domaines autorisés (Firebase Console > Auth > Paramètres), et que identitytoolkit.googleapis.com / securetoken.googleapis.com ne sont pas bloqués (proxy, pare-feu)."
        );
        checkFirebaseAuthConnectivity().then((ok) => {
          console.info("[LoginPage] Firebase Auth connectivity check:", ok);
        });
      } else if (code === "auth/wrong-password") {
        setError("Mot de passe incorrect.");
      } else if (code === "auth/user-not-found") {
        setError("Aucun compte associé à cet e-mail.");
      } else if (code === "auth/invalid-email") {
        setError("Format d'email invalide.");
      } else if (code === "auth/too-many-requests") {
        setError("Trop de tentatives. Réessayez plus tard.");
      } else {
        setError(`Connexion impossible: ${message}`);
      }
    } finally {
      setLoading(false);
    }
  }, [email, password, remember, nav]);

  const displayName = useMemo(() => {
    const p = email.split("@")[0] || "Utilisateur";
    return p.charAt(0).toUpperCase() + p.slice(1);
  }, [email]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{
        background: "linear-gradient(160deg, #fafafa 0%, #f1f5f9 50%, #e2e8f0 100%)",
      }}
      aria-busy={loading}
    >
      <div
        className="w-full max-w-[420px] bg-white rounded-2xl shadow-lg p-8 sm:p-10 animate-fadein"
        style={{
          boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Branding */}
        <div className="text-center mb-8">
          <img
            src="/images/teliya-logo.jpg"
            alt="Teliya"
            className="h-12 w-auto mx-auto mb-4 object-contain"
          />
          <h1 className="text-xl font-semibold text-slate-800 tracking-tight">
            Teliya
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Plateforme de gestion transport
          </p>
        </div>

        {/* Step title */}
        <h2 className="text-lg font-medium text-slate-800 mb-6">
          {step === "email" ? "Connexion" : `Bonjour ${displayName}`}
        </h2>

        {step === "email" && (
          <form onSubmit={handleEmail} className="space-y-5">
            <div>
              <label htmlFor="login-email" className="sr-only">
                Adresse e-mail
              </label>
              <div className="relative">
                <Mail
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none"
                  aria-hidden
                />
                <input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  className="w-full border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 transition-shadow"
                  placeholder="email@domaine.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-email-error" : undefined}
                />
              </div>
            </div>
            {error && (
              <p
                id="login-email-error"
                className="text-sm text-red-600 flex items-center gap-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-slate-800 text-white py-3 px-4 rounded-xl font-medium hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors"
            >
              Continuer
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label htmlFor="login-password" className="sr-only">
                Mot de passe
              </label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none"
                  aria-hidden
                />
                <input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full border border-slate-200 rounded-xl pl-11 pr-4 py-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 focus:border-slate-300 transition-shadow"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoFocus
                  aria-invalid={!!error}
                  aria-describedby={error ? "login-password-error" : undefined}
                />
              </div>
            </div>

            {error && (
              <p
                id="login-password-error"
                className="text-sm text-red-600 flex items-center gap-2"
                role="alert"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </p>
            )}

            <div className="text-right text-sm">
              <a
                href="/forgot-password"
                className="text-slate-500 hover:text-slate-700 focus:outline-none focus:underline"
              >
                Mot de passe oublié ?
              </a>
            </div>
            <div className="flex justify-between items-center text-sm">
              <label className="flex items-center gap-2 text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-slate-300 text-slate-700 focus:ring-slate-400"
                />
                Se souvenir de moi
              </label>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                  setError("");
                }}
                className="flex items-center gap-1.5 text-slate-600 hover:text-slate-800 focus:outline-none focus:underline"
              >
                <LogOut className="h-4 w-4" aria-hidden />
                Changer d'email
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-slate-800 text-white py-3 px-4 rounded-xl font-medium flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-colors"
              aria-busy={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                  Connexion en cours...
                </>
              ) : (
                <>
                  Connexion
                  <ArrowRight className="h-5 w-5" aria-hidden />
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <a
                href="/test-firebase"
                className="text-sm text-slate-500 hover:text-slate-700 focus:outline-none focus:underline"
              >
                Problèmes de connexion ? Testez Firebase ici
              </a>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
