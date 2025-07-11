// ✅ COMPOSANT Header amélioré pour meilleure lisibilité et structure

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
  const logoFallback = '/default-logo.png'; // chemin vers un logo par défaut

  return (
    <header
      className={`sticky top-0 z-50 px-4 py-3 ${classes.header}`}
      style={{
        backgroundColor: hexToRgba(colors.primary, 0.95),
        backdropFilter: 'blur(10px)',
      }}
    >
      <div className="flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-white shadow-md border border-gray-200 overflow-hidden">
            <LazyLoadImage
              src={company.logoUrl || logoFallback}
              alt={`Logo ${company.nom || 'Compagnie'}`}
              effect="opacity"
              className="w-full h-full object-contain"
              onError={(e: any) => (e.target.src = logoFallback)}
            />
          </div>

          <h1
            className="text-xl font-bold tracking-tight ml-2"
            style={{
              color: safeTextColor(colors.primary),
              textShadow: '0 1px 3px rgba(0,0,0,0.4)',
            }}
          >
            {company.nom || t('ourCompany')}
          </h1>

          <div className="ml-4 hidden md:block">
            <LanguageSwitcher />
          </div>
        </div>

        {/* ✅ Mobile Menu */}
        <div className="md:hidden flex items-center">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={`p-2 rounded-md transition-all ${menuOpen ? 'bg-white/10' : ''}`}
            style={{
              color: safeTextColor(colors.primary),
              border: `1px solid ${hexToRgba(safeTextColor(colors.primary), 0.2)}`,
            }}
            aria-label="Menu"
          >
            {menuOpen ? <X className="h-6 w-6" strokeWidth={2.5} /> : <Menu className="h-6 w-6" strokeWidth={2.5} />}
          </button>
        </div>

        {/* ✅ Desktop Menu */}
        <nav className="hidden md:flex gap-6 items-center text-sm">
          <button
            onClick={() => setShowAgences(true)}
            className={`font-medium ${config.animations}`}
            style={{ color: safeTextColor(colors.primary) }}
          >
            {t('ourAgencies')}
          </button>
          <button
            onClick={() => navigate(`/compagnie/${slug}/mes-reservations`)}
            className={`font-medium ${config.animations}`}
            style={{ color: safeTextColor(colors.primary) }}
          >
            {t('myBookings')}
          </button>

          <button
            onClick={() => navigate('/login')}
            className={`p-2 rounded-full ${classes.button}`}
            style={{
              backgroundColor: colors.secondary || hexToRgba(safeTextColor(colors.primary), 0.2),
              color: safeTextColor(colors.primary),
            }}
            aria-label={t('login')}
            title={t('login')}
          >
            <Settings className="h-5 w-5" />
          </button>
        </nav>
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
