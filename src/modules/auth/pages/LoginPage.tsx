import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  signInWithEmailAndPassword,
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
  Loader2,
  AlertCircle,
  LogOut,
} from "lucide-react";

/* ================= Helpers ================= */
const normalizeEmail = (s: string) => s.trim().toLowerCase();
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

const normalizeRole = (r?: string) => {
  const raw = (r || "user").toLowerCase();
  
  // Nouveaux rôles
  if (raw === "company_accountant" || raw === "comptable_compagnie") return "company_accountant";
  if (raw === "financial_director" || raw === "daf") return "financial_director";
  
  // Rôles existants
  if (raw === "admin_platforme") return "admin_platforme";
  if (raw === "admin_compagnie" || raw === "compagnie") return "admin_compagnie";
  if (raw === "chefagence" || raw === "chef_agence" || raw === "superviseur" || raw === "agentcourrier") return "chefAgence";
  if (raw === "agency_accountant" || raw === "comptable_agence") return "agency_accountant";
  if (raw === "guichetier") return "guichetier";
  if (raw === "embarquement") return "embarquement";
  
  return "user";
};

const routeForRole = (role: string) => {
  switch (role) {
    case "admin_platforme": 
      return "/admin/dashboard";
    
    case "admin_compagnie": 
      return "/compagnie/dashboard";
    
    case "company_accountant":
    case "financial_director": 
      return "/comptable"; // ← CORRIGÉ ICI !
    
    case "chefAgence":
    case "embarquement": 
      return "/agence/dashboard";
    
    case "agency_accountant": 
      return "/agence/comptabilite";
    
    case "guichetier": 
      return "/agence/guichet";
    
    default: 
      return "/";
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

  // 🔒 VERROU ANTI DOUBLE LOGIN
  const hasNavigated = useRef(false);

  /* ===== Step 1 ===== */
  const handleEmail = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isValidEmail(email)) {
      setError("Adresse e-mail invalide");
      return;
    }
    setStep("password");
  }, [email]);

  /* ===== Step 2 ===== */
  const handleLogin = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasNavigated.current) return;

    setError("");
    setLoading(true);
    try {
      await setPersistence(
        auth,
        remember ? browserLocalPersistence : browserSessionPersistence
      );

      console.log("🔍 LoginPage - Tentative de connexion avec:", email);
      const cred = await signInWithEmailAndPassword(
        auth,
        normalizeEmail(email),
        password
      );
      console.log("✅ LoginPage - Firebase Auth réussi, UID:", cred.user.uid);

      const snap = await getDoc(doc(db, "users", cred.user.uid));
      console.log("🔍 LoginPage - Document Firestore:", snap.exists() ? snap.data() : "Non trouvé");
      
      const userData = snap.exists() ? snap.data() : {};
      const role = normalizeRole(userData.role);
      
      console.log("🔍 LoginPage - Rôle brut:", userData.role);
      console.log("🔍 LoginPage - Rôle normalisé:", role);
      console.log("🔍 LoginPage - Redirection vers:", routeForRole(role));

      hasNavigated.current = true; // 🔒
      nav(routeForRole(role), { replace: true });
    } catch (err: any) {
      console.error("❌ LoginPage - Erreur de connexion:", err);
      console.error("❌ LoginPage - Code d'erreur:", err?.code);
      console.error("❌ LoginPage - Message:", err?.message);
      
      hasNavigated.current = false;
      
      if (err?.code === "auth/wrong-password") {
        setError("Mot de passe incorrect.");
      } else if (err?.code === "auth/user-not-found") {
        setError("Aucun compte associé à cet e-mail.");
      } else if (err?.code === "auth/invalid-email") {
        setError("Format d'email invalide.");
      } else if (err?.code === "auth/too-many-requests") {
        setError("Trop de tentatives. Réessayez plus tard.");
      } else {
        setError(`Connexion impossible: ${err?.message || "Erreur inconnue"}`);
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
    <div className="min-h-screen flex items-center justify-center bg-orange-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow p-6 space-y-6">
        <h1 className="text-xl font-bold">
          {step === "email" ? "Connexion" : `Bonjour ${displayName}`}
        </h1>

        {step === "email" && (
          <form onSubmit={handleEmail} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="email"
                className="w-full border rounded-xl pl-10 pr-3 py-3"
                placeholder="email@domaine.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button className="w-full bg-orange-600 text-white py-3 rounded-xl">
              Continuer
            </button>
          </form>
        )}

        {step === "password" && (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="password"
                className="w-full border rounded-xl pl-10 pr-3 py-3"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 flex gap-1 items-center">
                <AlertCircle className="h-4 w-4" /> {error}
              </p>
            )}

            <div className="flex justify-between items-center text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Se souvenir de moi
              </label>
              <button
                type="button"
                onClick={() => { setStep("email"); setPassword(""); }}
                className="flex items-center gap-1 text-gray-600"
              >
                <LogOut className="h-4 w-4" /> Changer d'email
              </button>
            </div>

            <button
              disabled={loading}
              className="w-full bg-orange-600 text-white py-3 rounded-xl flex justify-center gap-2 disabled:opacity-50"
            >
              {loading
                ? <><Loader2 className="animate-spin h-4 w-4" /> Connexion en cours...</>
                : <>Connexion <ArrowRight className="h-4 w-4" /></>}
            </button>
            
            {/* Lien vers la page de test */}
            <div className="text-center mt-4">
              <a 
                href="/test-firebase" 
                className="text-sm text-blue-600 underline hover:text-blue-800"
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