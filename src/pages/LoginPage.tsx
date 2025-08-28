// src/pages/LoginPage.tsx
import React, { useEffect, useState } from 'react';
import { signInWithEmailAndPassword, onAuthStateChanged, sendPasswordResetEmail } from 'firebase/auth';
import { auth, db } from '../firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { permissionsByRole } from '@/roles-permissions';
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

type AnyRole = keyof typeof permissionsByRole | string;

/** Normalise les variantes possibles venant de Firestore */
const normalizeRole = (r?: string): AnyRole => {
  const raw = (r || 'user').toString().trim();
  const lc = raw.toLowerCase();
  if (lc === 'chef_agence' || lc === 'chefagence') return 'chefAgence';
  if (lc === 'admin plateforme' || lc === 'admin_platforme') return 'admin_platforme';
  if (lc === 'admin compagnie' || lc === 'admin_compagnie') return 'admin_compagnie';
  if (lc === 'agent_courrier' || lc === 'agentcourrier') return 'agentCourrier';
  if (lc === 'superviseur') return 'superviseur';
  if (lc === 'guichetier') return 'guichetier';
  if (lc === 'comptable') return 'comptable';
  if (lc === 'compagnie') return 'compagnie';
  if (lc === 'embarquement') return 'embarquement';
  return 'user';
};

const routeForRole = (role: AnyRole) => {
  switch (role) {
    case 'admin_platforme':
      return '/admin/dashboard';
    case 'admin_compagnie':
    case 'compagnie':
      return '/compagnie/dashboard';
    case 'chefAgence':
      return '/agence/dashboard';
    case 'guichetier':
      return '/agence/guichet';
    case 'superviseur':
      return '/agence/dashboard';
    case 'agentCourrier':
      return '/agence/dashboard';
    case 'embarquement':
      return '/agence/embarquement';
    case 'comptable':
      return '/agence/comptabilite';
    default:
      return '/';
  }
};

// Helpers validation
const isValidEmail = (val: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());
const MIN_PWD = 6;

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // erreurs champ par champ
  const [emailError, setEmailError] = useState<string>('');
  const [pwdError, setPwdError] = useState<string>('');

  // message global (succès/erreur)
  const [message, setMessage] = useState<string>('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');

  const navigate = useNavigate();

  // Redirection auto si déjà connecté
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) return;
      try {
        const snap = await getDoc(doc(db, 'users', u.uid));
        const role = normalizeRole(snap.exists() ? (snap.data() as any).role : 'user');
        const target = routeForRole(role);
        navigate(target, { replace: true });
      } catch {
        // ignore
      }
    });
    return () => unsub();
  }, [navigate]);

  // Validation handlers
  const validateEmail = (val = email) => {
    if (!val.trim()) return setEmailError('Adresse e-mail requise.');
    if (!isValidEmail(val)) return setEmailError('Adresse e-mail invalide.');
    setEmailError('');
  };
  const validatePwd = (val = motDePasse) => {
    if (!val) return setPwdError('Mot de passe requis.');
    if (val.length < MIN_PWD) return setPwdError(`Au moins ${MIN_PWD} caractères.`);
    setPwdError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');

    validateEmail();
    validatePwd();
    if (!email || !motDePasse || emailError || pwdError) return;

    setIsLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), motDePasse);
      const uid = cred.user.uid;

      const snap = await getDoc(doc(db, 'users', uid));
      if (!snap.exists()) {
        setMessage('Aucune information utilisateur trouvée.');
        setMessageType('error');
        return;
      }

      const data = snap.data() as any;
      const role = normalizeRole(data.role);

      if (!(role in permissionsByRole)) {
        setMessage('Rôle utilisateur inconnu ou non autorisé.');
        setMessageType('error');
        return;
      }

      localStorage.setItem('user', JSON.stringify({ uid, email, role, ...data }));
      const target = routeForRole(role);
      navigate(target, { replace: true });
    } catch (err: any) {
      setMessage('Erreur de connexion : ' + (err?.message || ''));
      setMessageType('error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setMessage('');
    setMessageType('');

    if (!email.trim()) {
      setEmailError('Renseigne ton e-mail pour réinitialiser le mot de passe.');
      return;
    }
    if (!isValidEmail(email)) {
      setEmailError('Adresse e-mail invalide.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setMessage("Un e-mail de réinitialisation t'a été envoyé."); // ✅ FIX
      setMessageType('success');
    } catch (err: any) {
      setMessage("Échec de l'envoi : " + (err?.message || ''));
      setMessageType('error');
    }
  };

  const isDisabled = isLoading || !!emailError || !!pwdError || !email.trim() || !motDePasse;

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-orange-50 via-white to-amber-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Carte */}
        <div className="relative bg-white border border-orange-100 rounded-2xl shadow-xl shadow-orange-100/50">
          {/* Header logo + titre */}
          <div className="px-8 pt-8 text-center">
            <div className="mx-auto h-12 w-12 rounded-2xl bg-orange-500/10 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="h-6 w-6 text-orange-600">
                <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.15"/>
                <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5"/>
                <circle cx="12" cy="12" r="2" fill="currentColor"/>
              </svg>
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">
              Connexion
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Accédez à votre espace en toute sécurité.
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="px-8 pb-8 pt-6 space-y-5">
            {/* Email */}
            <div className="space-y-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Adresse e-mail
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="exemple@domaine.com"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); if (emailError) validateEmail(e.target.value); }}
                  onBlur={() => validateEmail()}
                  className={`w-full rounded-xl border bg-white pl-10 pr-3 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-2 ring-transparent transition
                    ${emailError
                      ? 'border-red-300 focus:ring-red-100'
                      : 'border-slate-200 focus:border-orange-500 focus:ring-orange-100'
                    }`}
                  autoComplete="email"
                />
              </div>
              {emailError && (
                <p className="text-xs text-red-600">{emailError}</p>
              )}
            </div>

            {/* Mot de passe */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Mot de passe
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Lock className="h-4 w-4 text-slate-400" />
                </span>
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={motDePasse}
                  onChange={(e) => { setMotDePasse(e.target.value); if (pwdError) validatePwd(e.target.value); }}
                  onBlur={() => validatePwd()}
                  className={`w-full rounded-xl border bg-white pl-10 pr-10 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none ring-2 ring-transparent transition
                    ${pwdError
                      ? 'border-red-300 focus:ring-red-100'
                      : 'border-slate-200 focus:border-orange-500 focus:ring-orange-100'
                    }`}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition"
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {pwdError && (
                <p className="text-xs text-red-600">{pwdError}</p>
              )}
            </div>

            {/* Options */}
            <div className="flex items-center justify-between">
              <label className="inline-flex items-center gap-2 text-sm text-slate-600 select-none">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-0" />
                Se souvenir de moi
              </label>
              <button
                type="button"
                className="text-sm font-medium text-orange-600 hover:text-orange-700"
                onClick={handleResetPassword}
              >
                Mot de passe oublié ?
              </button>
            </div>

            {/* Message global */}
            {message && (
              <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5
                ${messageType === 'success'
                  ? 'border-emerald-200 bg-emerald-50'
                  : 'border-red-200 bg-red-50'
                }`}
              >
                {messageType === 'success'
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5" />
                  : <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                }
                <p className={`text-sm ${messageType === 'success' ? 'text-emerald-800' : 'text-red-700'}`}>
                  {message}
                </p>
              </div>
            )}

            {/* Bouton */}
            <button
              type="submit"
              disabled={isDisabled}
              className={`w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white transition
                ${isDisabled
                  ? 'bg-orange-300/70 cursor-not-allowed'
                  : 'bg-orange-600 hover:bg-orange-700 active:bg-orange-800 shadow-lg shadow-orange-600/20'
                }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Connexion en cours...
                </>
              ) : (
                'Se connecter'
              )}
            </button>

            {/* Légende */}
            <p className="text-center text-xs text-slate-500">
              En vous connectant, vous acceptez nos Conditions et notre Politique de confidentialité.
            </p>
          </form>
        </div>

        {/* Footer brand */}
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
