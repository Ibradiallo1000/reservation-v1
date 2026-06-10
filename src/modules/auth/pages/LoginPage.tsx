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
import { useNavigate, useLocation } from "react-router-dom";
import { TENANT_MISMATCH_ERROR } from "../components/TenantGuard";
import type { Company } from "@/types/companyTypes";
import { getPublicPathBase } from "@/modules/compagnie/public/utils/subdomain";
import {
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  Loader2,
  AlertCircle,
  LogOut,
  Users,
} from "lucide-react";

/* ================= Helpers ================= */
const normalizeEmail = (s: string) => s.trim().toLowerCase();
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Canonical roles only. agency_boarding_officer / embarquement → chefEmbarquement. */
const CANONICAL_ROLES = new Set([
  "admin_platforme", "admin_compagnie", "company_accountant", "operator_digital", "agency_accountant",
  "responsable_logistique", "chefagence", "chefembarquement", "guichetier",
  "agency_fleet_controller", "financial_director", "agentcourrier",
  "escale_agent", "escale_manager",
]);

const normalizeRole = (r?: string): string => {
  const raw = (r || "").trim().toLowerCase();
  if (raw === "company_ceo") return "admin_compagnie";
  if (raw === "chefagence") return "chefAgence";
  if (raw === "agentcourrier") return "agentCourrier";
  if (raw === "chefembarquement") return "chefEmbarquement";
  if (raw === "agency_boarding_officer" || raw === "embarquement") return "chefEmbarquement";
  if (raw === "chef_garage" || raw === "chefgarage") return "responsable_logistique";
  return CANONICAL_ROLES.has(raw) ? (raw === "chefagence" ? "chefAgence" : raw) : "unauthenticated";
};

const routeForRole = (role: string): string => {
  switch (role) {
    case "admin_platforme":
      return "/admin/dashboard";
    case "admin_compagnie":
      return "/compagnie/command-center";
    case "company_accountant":
      return "/role-landing";
    case "operator_digital":
      return "/role-landing";
    case "responsable_logistique":
      return "/compagnie/garage/dashboard";
    case "chefAgence":
      return "/agence/activite";
    case "chefEmbarquement":
      return "/agence/boarding";
    case "agency_accountant":
      return "/agence/comptabilite";
    case "guichetier":
      return "/agence/guichet";
    case "agentCourrier":
      return "/agence/courrier";
    case "escale_agent":
    case "escale_manager":
      return "/agence/escale";
    default:
      return "/login";
  }
};

interface LoginPageProps {
  company?: Company | null;
}

const LoginPage: React.FC<LoginPageProps> = ({ company }) => {
  const nav = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const urlError = searchParams.get("error");
  const isCompanyContext = !!company;
  const pathBase = getPublicPathBase(company?.slug ?? "");
  const companyHomePath = pathBase ? `/${pathBase}` : "/";
  const primaryColor = company?.couleurPrimaire ?? "#334155";

  const [step, setStep] = useState<"email" | "password">("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);

  const [error, setError] = useState(
    urlError === TENANT_MISMATCH_ERROR
      ? "Vous n'avez pas accès à cet espace. Connectez-vous avec un compte de cette compagnie."
      : ""
  );
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

      let snap = await getDoc(doc(db, "users", cred.user.uid));
      stepLog("after getDoc(users)");
      let userData = snap.exists() ? snap.data() : {};
      let rawRole = userData.role;

      if (!rawRole) {
        stepLog("pas de rôle encore (invitation en cours?) — attente 2s puis retry getDoc");
        await new Promise((r) => setTimeout(r, 2000));
        snap = await getDoc(doc(db, "users", cred.user.uid));
        userData = snap.exists() ? snap.data() : {};
        rawRole = userData.role;
      }

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
        console.warn("[LoginPage] rôle manquant ou invalide après lecture du profil; raw role:", userData.role);
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
      } else if (role === "responsable_logistique" && companyId) {
        path = `/compagnie/${companyId}/garage/dashboard`;
      } else if (role === "responsable_logistique" && !companyId) {
        console.warn("[LoginPage] responsable_logistique without companyId, redirecting to /login");
        path = "/login";
      }
      if ((role === "company_accountant" || role === "financial_director") && companyId) {
        path = `/compagnie/${companyId}/accounting`;
      }
      if (role === "operator_digital" && companyId) {
        path = `/compagnie/${companyId}/digital-cash`;
      } else if (role === "operator_digital" && !companyId) {
        console.warn("[LoginPage] operator_digital without companyId, redirecting to /login");
        path = "/login";
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
        className={`w-full bg-white rounded-2xl shadow-lg sm:p-10 animate-fadein ${
          isCompanyContext ? "max-w-[460px] p-6" : "max-w-[420px] p-8"
        }`}
        style={{
          boxShadow: "0 4px 24px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        {/* Branding */}
        {isCompanyContext ? (
          <div className="mb-7">
            <button
              type="button"
              onClick={() => nav(companyHomePath)}
              className="mb-6 inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Retour à l’accueil
            </button>

            <div className="text-center">
              {company?.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={company.nom || "Compagnie"}
                  className="mx-auto mb-3 h-16 w-16 rounded-2xl object-cover shadow-sm"
                />
              ) : (
                <div
                  className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl text-xl font-bold text-white shadow-sm"
                  style={{ backgroundColor: primaryColor }}
                >
                  {(company?.nom || "C").charAt(0)}
                </div>
              )}
              <p className="text-sm font-semibold" style={{ color: primaryColor }}>
                {company?.nom}
              </p>
              <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-900">
                Espace réservé au personnel
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Accès réservé aux employés et collaborateurs autorisés.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {["Guichetiers", "Agents d’embarquement", "Gestionnaires", "Comptables", "Administrateurs"].map((role) => (
                  <span
                    key={role}
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{
                      color: primaryColor,
                      backgroundColor: `color-mix(in srgb, ${primaryColor} 9%, white)`,
                    }}
                  >
                    <Users className="h-3 w-3" aria-hidden />
                    {role}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
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
        )}

        {/* Step title */}
        <h2 className="text-lg font-medium text-slate-800 mb-6">
          {step === "email" ? (isCompanyContext ? "Se connecter" : "Connexion") : `Bonjour ${displayName}`}
        </h2>

        {isCompanyContext && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="company-login-email" className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <div className="relative">
                <Mail
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="company-login-email"
                  type="email"
                  autoComplete="email"
                  required
                  className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="email@domaine.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label htmlFor="company-login-password" className="mb-1.5 block text-sm font-medium text-slate-700">
                Mot de passe
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
                  aria-hidden
                />
                <input
                  id="company-login-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-200 py-3 pl-11 pr-4 text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="flex items-center gap-2 text-sm text-red-600" role="alert">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </p>
            )}

            <div className="flex items-center justify-between gap-3 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-slate-300 text-slate-700 focus:ring-slate-400"
                />
                Se souvenir de moi
              </label>
              <a href="/forgot-password" className="text-slate-500 hover:text-slate-700">
                Mot de passe oublié ?
              </a>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-medium text-white transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{ backgroundColor: primaryColor }}
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ArrowRight className="h-5 w-5" aria-hidden />}
              {loading ? "Connexion en cours..." : "Se connecter"}
            </button>
          </form>
        )}

        {step === "email" && !isCompanyContext && (
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
              style={isCompanyContext ? { backgroundColor: primaryColor } : undefined}
            >
              Continuer
            </button>
          </form>
        )}

        {step === "password" && !isCompanyContext && (
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
              style={isCompanyContext ? { backgroundColor: primaryColor } : undefined}
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

            <div className={isCompanyContext ? "hidden" : "text-center pt-2"}>
              <a
                href="/test-firebase"
                className="text-sm text-slate-500 hover:text-slate-700 focus:outline-none focus:underline"
              >
                Problèmes de connexion ? Testez Firebase ici
              </a>
            </div>
          </form>
        )}

        {isCompanyContext && (
          <>
            <div className="mt-7 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-center">
              <h2 className="text-sm font-semibold text-slate-900">
                Vous souhaitez réserver un billet ?
              </h2>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                Les voyageurs n’ont pas besoin de compte pour effectuer une réservation.
              </p>
              <button
                type="button"
                onClick={() => nav(companyHomePath)}
                className="mt-3 inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition hover:bg-white"
                style={{ borderColor: primaryColor, color: primaryColor }}
              >
                Retour à l’accueil
              </button>
            </div>
            <p className="mt-6 text-center text-xs text-slate-400">
              Propulsé par Teliya
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
