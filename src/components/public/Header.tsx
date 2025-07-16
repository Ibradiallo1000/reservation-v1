import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
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

const isColorDark = (hex: string): boolean => {
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness < 128;
};

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
  const logoFallback = '/default-logo.png';
  const primaryColor = colors.primary || '#facc15';
  const secondaryColor = colors.secondary || '#e2e8f0';

  const companyNameColor = isColorDark(primaryColor)
    ? primaryColor
    : secondaryColor || '#1f2937';

  return (
    <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-transparent border-b border-white/10">
      <div className="absolute top-0 left-0 w-full h-[32px] bg-transparent overflow-hidden">
        <svg viewBox="0 0 1440 100" preserveAspectRatio="none" className="w-full h-full">
          <path
            d="M0,0 C480,40 960,0 1440,50 L1440,0 L0,0 Z"
            fill={secondaryColor}
          />
        </svg>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-2 rounded-md border border-gray-300 bg-white shadow"
            aria-label="Menu"
          >
            {menuOpen ? (
              <X className="h-6 w-6 text-slate-800" />
            ) : (
              <Menu className="h-6 w-6 text-slate-800" />
            )}
          </button>

          <div className="h-10 w-10 rounded-full bg-white border border-gray-200 overflow-hidden shadow-sm">
            <LazyLoadImage
              src={company.logoUrl || logoFallback}
              alt={`Logo ${company.nom || 'Compagnie'}`}
              className="w-full h-full object-contain"
              onError={(e: any) => (e.target.src = logoFallback)}
            />
          </div>

          <span
            className="text-xl font-bold truncate max-w-[180px]"
            style={{ color: companyNameColor }}
            title={company.nom || t('ourCompany')}
          >
            {company.nom || t('ourCompany')}
          </span>
        </div>

        <div className="hidden md:block">
          <LanguageSwitcher />
        </div>

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
            colors={colors}
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
