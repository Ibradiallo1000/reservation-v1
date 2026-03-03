// src/modules/compagnie/public/layout/CompanyPublicHeader.tsx
// Option C: floating ultra minimal — capsule suspendue, Hero full bleed top (toujours mode clair)
import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { Company } from '@/types/companyTypes';

interface HeaderProps {
  company: Company;
  slug: string;
  colors: {
    primary: string;
    secondary?: string;
    [key: string]: string | undefined;
  };
  navigate: (path: string) => void;
  t: (key: string, options?: Record<string, unknown>) => string;
}

const Header: React.FC<HeaderProps> = ({
  company,
  slug: _slug,
  colors,
  navigate,
  t,
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = 120;
      const current = window.scrollY;
      const progress = Math.min(current / maxScroll, 1);
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!company?.logoUrl) return;
    const img = new Image();
    img.src = company.logoUrl;
  }, [company?.logoUrl]);

  const backgroundOpacity = 0.18 + 0.77 * scrollProgress;
  const backgroundColor = `rgba(${Math.round(255 * scrollProgress)},${Math.round(255 * scrollProgress)},${Math.round(255 * scrollProgress)},${backgroundOpacity})`;
  const borderColor =
    scrollProgress > 0.5 ? 'rgba(229,231,235,0.8)' : 'rgba(255,255,255,0.1)';
  const boxShadow =
    scrollProgress > 0.3
      ? '0 4px 20px rgba(0,0,0,0.1)'
      : '0 4px 20px rgba(0,0,0,0.25)';
  const textColor = scrollProgress > 0.6 ? '#111827' : 'white';

  const name =
    company?.nom || t('ourCompany', { defaultValue: 'Notre compagnie' });

  return (
    <header className="fixed top-0 left-0 w-full z-50 flex justify-center pt-4 pointer-events-none">
      <div
        style={{
          backgroundColor,
          border: `1px solid ${borderColor}`,
          boxShadow,
        }}
        className="w-[92%] max-w-sm h-14 flex items-center justify-between px-4 rounded-full backdrop-blur-xl transition-all duration-300 pointer-events-auto"
      >
        {/* Partie gauche : logo + nom */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 min-w-0 select-none"
          aria-label={name}
        >
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt=""
              className="h-8 w-8 rounded-full object-cover ring-1 ring-white/20 shrink-0"
            />
          ) : (
            <span
              className="h-8 w-8 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ring-1 transition-colors duration-300"
              style={{
                backgroundColor: scrollProgress > 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.2)',
                color: textColor,
                borderColor: scrollProgress > 0.5 ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.2)',
              }}
            >
              {(name || 'C').trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span
            className="font-semibold text-sm tracking-wide truncate max-w-[100px] sm:max-w-[140px] transition-colors duration-300"
            style={{ color: textColor }}
          >
            {name}
          </span>
        </button>

        {/* Partie droite : actions compactes */}
        <div
          className="flex items-center gap-1.5 shrink-0 transition-colors duration-300"
          style={{ color: textColor }}
        >
          <LanguageSwitcher variant="floating" scrollTextColor={textColor} />

          <button
            onClick={() => navigate('/login')}
            className="px-2 py-1 rounded-full opacity-80 hover:opacity-100 hover:bg-black/10 transition inline-flex items-center justify-center min-h-[36px] min-w-[36px]"
            style={{ color: textColor }}
            aria-label={t('login')}
          >
            <User className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
