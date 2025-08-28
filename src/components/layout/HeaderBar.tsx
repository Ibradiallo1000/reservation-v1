import React, { useEffect, useRef, useState } from 'react';
import { Building2, Cog, User as UserIcon, LogOut } from 'lucide-react';
import { theme as baseTheme } from '@/theme';
import { useAuth } from '@/contexts/AuthContext';
import useCompanyTheme from '@/hooks/useCompanyTheme';

/**
 * Header réutilisable avec :
 * - branding compagnie + agence (si dispo)
 * - titre + sous-titre
 * - capsule de contexte (ex: "Comptabilité", "Guichet")
 * - menu compte (roue dentée ou avatar) : nom, email/code, rôle, déconnexion
 */
type Props = {
  title?: string;
  subtitle?: string;
  contextBadge?: string;          // ex: 'Comptabilité', 'Guichet', 'Chef d’agence'
  useGearIcon?: boolean;          // true = roue dentée ; false = avatar
  className?: string;
  rightExtra?: React.ReactNode;   // boutons d’action à droite si besoin
};

export default function HeaderBar({
  title,
  subtitle,
  contextBadge,
  useGearIcon = true,
  rightExtra,
  className = '',
}: Props) {
  const { user, company, logout } = useAuth() as any;
  const companyTheme = useCompanyTheme(company);
  const t = companyTheme ? { primary: companyTheme.primary, secondary: companyTheme.secondary } : { primary: baseTheme.colors.primary, secondary: baseTheme.colors.secondary };

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Fermeture du menu au clic extérieur / ESC
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const displayName =
    user?.displayName || user?.nom || user?.email || user?.staffCode || 'Utilisateur';
  const subInfo =
    user?.email || user?.staffCode || user?.codeCourt || user?.code || '';
  const role =
    Array.isArray(user?.role) ? user.role.join(', ') : (user?.role || '');

  return (
    <div
      className={`sticky top-0 z-10 border-b bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/65 ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        {/* Branding + titre */}
        <div className="flex items-center gap-3">
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt="logo"
              className="h-10 w-10 rounded-xl object-contain border bg-white p-1"
            />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-gray-200 grid place-items-center">
              <Building2 className="h-5 w-5 text-gray-600" />
            </div>
          )}

          <div>
            {title ? (
              <div
                className="text-lg font-extrabold tracking-tight"
                style={{
                  background: `linear-gradient(90deg, ${t.primary}, ${t.secondary})`,
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {title}
              </div>
            ) : (
              <div className="text-lg font-extrabold tracking-tight text-gray-900">
                {company?.nom || 'Application'}
              </div>
            )}
            {subtitle && (
              <div className="text-xs text-gray-600">{subtitle}</div>
            )}
          </div>
        </div>

        {/* Actions à droite : badge + extra + menu compte */}
        <div className="flex items-center gap-2">
          {contextBadge && (
            <span className="px-3 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-700 shadow-sm">
              {contextBadge}
            </span>
          )}

          {rightExtra}

          {/* Menu compte */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setOpen((v) => !v)}
              className="ml-2 inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg border bg-white hover:bg-slate-50 shadow-sm"
              title="Compte"
            >
              {useGearIcon ? (
                <Cog className="h-4 w-4" />
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">{displayName}</span>
            </button>

            {open && (
              <div className="absolute right-0 mt-2 w-72 rounded-xl border bg-white shadow-lg p-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-100 grid place-items-center border text-gray-700">
                    {displayName?.[0]?.toUpperCase?.() || <UserIcon className="h-5 w-5"/>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{displayName}</div>
                    {subInfo && (
                      <div className="text-xs text-gray-500 truncate">{subInfo}</div>
                    )}
                    {role && (
                      <div className="mt-1 inline-flex px-2 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700">
                        {role}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-3 py-2 rounded-lg border text-sm bg-white hover:bg-slate-50"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={async () => {
                      setOpen(false);
                      await logout?.();
                      // Redirigera si ton AuthProvider gère déjà la redirection.
                      // Sinon tu peux utiliser navigate('/login') ici si nécessaire.
                    }}
                    className="px-3 py-2 rounded-lg text-white text-sm shadow-sm"
                    style={{
                      background: `linear-gradient(90deg, ${t.primary}, ${t.secondary})`,
                    }}
                  >
                    <LogOut className="h-4 w-4 inline mr-1" />
                    Se déconnecter
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
