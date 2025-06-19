// ✅ COMPOSANT : HeaderContent
// Affiche l'en-tête de la page publique d'une compagnie avec logo, navigation et menu mobile

import React from 'react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import { motion, AnimatePresence } from 'framer-motion';
import { Menu, X, Settings, MapPin, Shield, Phone } from 'lucide-react';
import MobileMenuModern from './MobileMenu';
import { safeTextColor } from '../../utils/color';
import { Company } from '@/types/companyTypes';

interface HeaderContentProps {
  company: Company;
  colors: { primary: string; [key: string]: string };
  menuOpen: boolean;
  setMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setShowAgences: React.Dispatch<React.SetStateAction<boolean>>;
  slug: string;
  t: (key: string) => string;
  navigate: (path: string) => void;
}

const HeaderContent = ({
  company,
  colors,
  menuOpen,
  setMenuOpen,
  setShowAgences,
  slug,
  t,
  navigate
}: HeaderContentProps) => {
  return (
    <div className="flex justify-between items-center max-w-7xl mx-auto">
      {/* ✅ LOGO & NOM DE LA COMPAGNIE */}
      <div className="flex items-center gap-3">
        <LazyLoadImage 
          src={company.logoUrl} 
          alt={`Logo ${company.nom}`} 
          effect="blur"
          className="h-12 w-12 rounded-full object-cover border-2"
          style={{ borderColor: safeTextColor(colors.primary) }}
        />
        <h1 className="text-xl font-bold tracking-tight" style={{ color: safeTextColor(colors.primary) }}>
          {company.nom}
        </h1>
      </div>

      {/* ✅ MENU MOBILE (icône) */}
      <div className="md:hidden">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition"
          aria-label={t('menu')}
        >
          {menuOpen ? (
            <X className="h-6 w-6 text-white" />
          ) : (
            <Menu className="h-6 w-6 text-white" />
          )}
        </button>
      </div>

      {/* ✅ MENU DESKTOP */}
      <nav className="hidden md:flex gap-6 items-center">
        <button onClick={() => setShowAgences(true)} className="hover:underline">
          {t('ourAgencies')}
        </button>
        <button onClick={() => navigate(`/compagnie/${slug}/mes-reservations`)} className="hover:underline">
          {t('myBookings')}
        </button>
        <button onClick={() => navigate(`/compagnie/${slug}/contact`)} className="hover:underline">
          {t('contact')}
        </button>
        <button onClick={() => navigate('/login')} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition" aria-label={t('login')}>
          <Settings className="h-5 w-5" />
        </button>
      </nav>

      {/* ✅ MENU MOBILE (contenu animé) */}
      <AnimatePresence>
        {menuOpen && (
          <MobileMenuModern 
            onShowAgencies={() => {
              setShowAgences(true);
              setMenuOpen(false);
            } }
            slug={slug}
            t={t}
            navigate={navigate}
            onClose={() => setMenuOpen(false)}
            colors={colors} classes={undefined} config={undefined}          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default HeaderContent;
