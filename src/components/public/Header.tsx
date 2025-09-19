import React, { useEffect, useState } from 'react';
import { Menu, X, Settings } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import MobileMenu from './MobileMenu';
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
  classes: any;
  config: any;
  menuOpen: boolean;
  setMenuOpen: (val: boolean) => void;
  setShowAgences: (val: boolean) => void;
  navigate: (path: string) => void;
  t: (key: string) => string;
  isMobile?: boolean;
}

const BRAND_ORANGE = '#FF6600';

const Header: React.FC<HeaderProps> = ({
  company,
  slug,
  colors,
  classes,
  config,
  menuOpen,
  setMenuOpen,
  setShowAgences,
  navigate,
  t,
}) => {
  const brandColor = colors.primary || BRAND_ORANGE;
  const secondaryColor = colors.secondary || '#e5e7eb';

  const [logoLoaded, setLogoLoaded] = useState(false);

  // Précharge le logo pour éviter le retard d’affichage
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

  // Fallback initial (initiale) si pas de logo
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
      {/* Bande/onde secondaire */}
      <div className="absolute top-0 left-0 w-full h-[80px] overflow-hidden pointer-events-none">
        <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="w-full h-full">
          <path d="M0,0 C480,60 960,0 1440,70 L1440,0 L0,0 Z" fill={secondaryColor} />
        </svg>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-2 flex items-center justify-between">
        {/* Menu + marque */}
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-md border border-gray-300 bg-white"
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-6 w-6 text-slate-800" /> : <Menu className="h-6 w-6 text-slate-800" />}
          </button>

          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 select-none"
            aria-label={company?.nom || 'Accueil'}
          >
            <div className="h-10 w-10 rounded-full bg-white border border-gray-200 overflow-hidden shadow-sm flex items-center justify-center">
              {/* Skeleton pour éviter le “saut” */}
              {!logoLoaded && company?.logoUrl && (
                <div className="w-6 h-6 rounded-full bg-gray-200 animate-pulse" />
              )}

              {company?.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={`Logo ${company.nom || 'Compagnie'}`}
                  width={40}
                  height={40}
                  className={`w-full h-full object-contain ${logoLoaded ? '' : 'opacity-0'}`}
                  loading="eager"
                  decoding="async"
                  {...({ fetchpriority: 'high' } as any)}   // ✅ attribut HTML natif, sans warning
                  onLoad={() => setLogoLoaded(true)}
                />
              ) : (
                <Initials name={company?.nom} />
              )}
            </div>

            <span
              className="text-xl font-bold leading-tight break-words"
              style={{ color: brandColor, maxWidth: '240px' }}
              title={company?.nom || t('ourCompany')}
            >
              {company?.nom || t('ourCompany')}
            </span>
          </button>
        </div>

        {/* Sélecteur de langue (desktop) */}
        <div className="hidden md:block">
          <LanguageSwitcher />
        </div>

        {/* Actions (desktop) */}
        <div className="hidden md:flex items-center gap-4">
          <button
            onClick={() => navigate(`/${slug}/mes-reservations`)}
            className="text-sm font-medium text-gray-700 hover:text-black transition"
          >
            {t('myBookings') || 'Mes réservations'}
          </button>

          <button
            onClick={() => setShowAgences(true)}
            className="text-sm font-medium text-gray-700 hover:text-black transition"
          >
            {t('ourAgencies') || 'Nos agences'}
          </button>

          <button
            onClick={() => navigate('/login')}
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition"
            aria-label={t('login')}
          >
            <Settings className="h-5 w-5 text-gray-700" />
          </button>
        </div>
      </div>

      {/* Menu mobile */}
      <AnimatePresence>
        {menuOpen && (
          <MobileMenu
            onClose={() => setMenuOpen(false)}
            navigate={(path) => {
              navigate(path);
              setMenuOpen(false);
            }}
            onShowAgencies={() => {
              setShowAgences(true);
              setMenuOpen(false);
            }}
            slug={slug}
            colors={{ ...colors, primary: brandColor }}
            classes={classes}
            config={config}
            t={t}
          />
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
