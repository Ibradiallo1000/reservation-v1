import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { Menu, X, Settings } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import MobileMenu from './MobileMenu';
import LanguageSwitcher from '../ui/LanguageSwitcher';
import { hexToRgba, safeTextColor } from '@/utils/color';
import { Company } from '@/types/companyTypes';

interface HeaderProps {
  company: Company;
  slug: string;
  colors: any;
  classes: any;
  config: any;
  menuOpen: boolean;
  setMenuOpen: (val: boolean) => void;
  setShowAgences: (val: boolean) => void;
  navigate: (path: string) => void;
  t: (key: string) => string;
}

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
  const background = '#ffffff'; // fond blanc par défaut
  const textColor = safeTextColor(colors.primary || '#ffffff');

  return (
    <header
      className="relative z-50 w-full shadow-sm"
      style={{
        background: background,
      }}
    >
      {/* ✅ Bande décorative SVG */}
      <svg
        viewBox="0 0 1440 100"
        className="absolute bottom-0 left-0 w-full h-20"
        preserveAspectRatio="none"
      >
        <path
          fill={colors.secondary || colors.primary || '#facc15'}
          d="M0,0 C480,100 960,0 1440,100 L1440,0 L0,0 Z"
        />
      </svg>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white border border-gray-200 overflow-hidden shadow">
            <LazyLoadImage
              src={company.logoUrl || logoFallback}
              alt={`Logo ${company.nom || 'Compagnie'}`}
              className="w-full h-full object-contain"
              onError={(e: any) => (e.target.src = logoFallback)}
            />
          </div>

          <h1 className="text-xl font-bold tracking-tight ml-2 text-slate-800">
            {company.nom || t('ourCompany')}
          </h1>

          <div className="ml-4 hidden md:block">
            <LanguageSwitcher />
          </div>
        </div>

        {/* ✅ Menu Desktop */}
        <nav className="hidden md:flex gap-6 items-center text-sm">
          <button
            onClick={() => setShowAgences(true)}
            className="font-medium text-slate-700 hover:text-slate-900 transition"
          >
            {t('ourAgencies')}
          </button>
          <button
            onClick={() => navigate(`/compagnie/${slug}/mes-reservations`)}
            className="font-medium text-slate-700 hover:text-slate-900 transition"
          >
            {t('myBookings')}
          </button>
          <button
            onClick={() => navigate('/login')}
            className="p-2 rounded-full bg-slate-100 hover:bg-slate-200 transition"
            aria-label={t('login')}
          >
            <Settings className="h-5 w-5 text-slate-700" />
          </button>
        </nav>

        {/* ✅ Menu Mobile */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-2 rounded-md border border-gray-300 bg-white shadow"
            aria-label="Menu"
          >
            {menuOpen ? (
              <X className="h-6 w-6 text-slate-800" />
            ) : (
              <Menu className="h-6 w-6 text-slate-800" />
            )}
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
