// src/components/public/Header.tsx
import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';
import { Company } from '@/types/companyTypes';

interface HeaderProps {
  company: Company;
  slug: string;
  colors: {
    primary: string;
    secondary?: string;
    accent?: string;
    tertiary?: string;
    [key: string]: string | undefined;
  };
  // conservés pour compat: ne sont plus utilisés ici
  classes?: any;
  config?: any;
  menuOpen?: boolean;
  setMenuOpen?: (val: boolean) => void;
  setShowAgences?: (val: boolean) => void;
  navigate: (path: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
  isMobile?: boolean;
}

const BRAND_ORANGE = '#FF6600';

const Header: React.FC<HeaderProps> = ({
  company,
  slug,
  colors,
  navigate,
  t,
}) => {
  const brandColor = colors.primary || BRAND_ORANGE;
  const secondaryColor = colors.secondary || '#e5e7eb';

  const [logoLoaded, setLogoLoaded] = useState(false);

  // Précharge le logo (évite le flash)
  useEffect(() => {
    if (!company?.logoUrl) return;
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = 'image';
    link.href = company.logoUrl;
    link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
    return () => {
      try { document.head.removeChild(link); } catch {}
    };
  }, [company?.logoUrl]);

  // Fallback texte
  const name = company?.nom || t('ourCompany', { defaultValue: 'Notre compagnie' });
  const nameIsLong = (name || '').length > 18; // ajuste si nécessaire

  const Initials = ({ name }: { name?: string }) => {
    const letter = (name || 'C').trim().charAt(0).toUpperCase();
    return (
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: brandColor }}
      >
        {letter}
      </div>
    );
  };

  return (
    <header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur border-b border-gray-100">
      {/* ❗ Décoration conservée telle quelle */}
      <div className="absolute top-0 left-0 w-full h-[90px] overflow-hidden pointer-events-none">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,0 C480,60 960,0 1440,70 L1440,0 L0,0 Z" fill={secondaryColor} />
        </svg>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        {/* Logo + Nom (pas d’ellipse, peut passer sur 2 lignes) */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 min-w-0 select-none"
          aria-label={name}
          title={name}
        >
          <div
            className="h-10 w-10 rounded-full bg-white overflow-hidden shadow-sm grid place-items-center border-2"
            style={{ borderColor: brandColor }} // cercle + bordure marque
          >
            {!logoLoaded && company?.logoUrl && (
              <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" />
            )}
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={`Logo ${name}`}
                width={40}
                height={40}
                className={`w-full h-full object-contain ${logoLoaded ? '' : 'opacity-0'}`}
                loading="eager"
                decoding="async"
                onLoad={() => setLogoLoaded(true)}
              />
            ) : (
              <Initials name={name} />
            )}
          </div>

          <span
            className={`leading-tight break-words whitespace-normal ${
              nameIsLong ? 'text-lg md:text-xl' : 'text-xl md:text-2xl'
            } font-bold`}
            style={{ color: brandColor, maxWidth: '80vw' }}
          >
            {name}
          </span>
        </button>

        {/* Langue (toujours visible) */}
        <div className="hidden md:block">
          <LanguageSwitcher />
        </div>

        {/* Actions desktop */}
        <div className="hidden md:flex items-center gap-3">
          <button
            onClick={() => navigate(`/${slug}/mes-reservations`)}
            className="inline-flex items-center gap-2 px-3.5 h-9 rounded-full text-white font-semibold shadow-sm hover:brightness-110 transition"
            style={{ background: `linear-gradient(90deg, ${brandColor}, ${brandColor})` }}
          >
            {/* billet icône simple inline pour éviter imports supplémentaires */}
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M4 7h16v4a2 2 0 0 1 0 2v4H4v-4a2 2 0 0 1 0-2V7zM7 9h2v2H7V9zm0 4h2v2H7v-2z" />
            </svg>
            {t('myBookings', { defaultValue: 'Mes réservations' })}
          </button>

          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white ring-1 ring-black/10 hover:shadow-md transition"
            style={{ color: brandColor }}
            aria-label={t('login', { defaultValue: 'Connexion' })}
            title={t('login', { defaultValue: 'Connexion' })}
          >
            <User className="h-5 w-5" />
          </button>
        </div>

        {/* Actions mobile (pas de burger) */}
        <div className="flex md:hidden items-center gap-2">
          <LanguageSwitcher />

          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-white ring-1 ring-black/10"
            style={{ color: brandColor }}
            aria-label={t('login', { defaultValue: 'Connexion' })}
          >
            <User className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
