// src/modules/compagnie/public/layout/CompanyPublicHeader.tsx
// Header fused directly on the hero: full-width bar, logo + company name (left), language + login (right)
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
  navigate,
  t,
}) => {
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const maxScroll = 140;
      const current = window.scrollY;
      setScrollProgress(Math.min(current / maxScroll, 1));
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

  const textColor = scrollProgress > 0.6 ? '#111827' : 'white';
  const bgOpacity = scrollProgress > 0.5 ? 0.92 : 0;
  const borderOpacity = scrollProgress > 0.5 ? 0.15 : 0;

  const name =
    company?.nom || t('ourCompany', { defaultValue: 'Notre compagnie' });

  return (
    <header
      className="public-site-header fixed top-0 left-0 right-0 w-full z-50 flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 pointer-events-none"
      style={{ color: textColor }}
    >
      <div
        style={{
          backgroundColor: `rgba(255,255,255,${bgOpacity})`,
          borderBottom: borderOpacity > 0 ? `1px solid rgba(0,0,0,${borderOpacity})` : 'none',
        }}
        className="absolute inset-0 backdrop-blur-sm transition-all duration-300 pointer-events-auto"
        aria-hidden
      />
      <div className="relative z-10 flex items-center justify-between w-full max-w-6xl mx-auto pointer-events-auto">
        {/* Left: logo + company name */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 sm:gap-3 min-w-0 select-none"
          aria-label={name}
        >
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              alt=""
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full object-cover ring-2 ring-white/30 shrink-0"
            />
          ) : (
            <span
              className="h-9 w-9 sm:h-10 sm:w-10 rounded-full flex items-center justify-center font-semibold text-sm shrink-0 ring-2 ring-white/30 bg-white/20"
              style={{ color: textColor }}
            >
              {(name || 'C').trim().charAt(0).toUpperCase()}
            </span>
          )}
          <span className="font-semibold text-sm sm:text-base tracking-wide truncate max-w-[120px] sm:max-w-[200px]">
            {name}
          </span>
        </button>

        {/* Right: language + login */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <LanguageSwitcher variant="floating" scrollTextColor={textColor} />
          <button
            onClick={() => navigate('/login')}
            className="p-2 rounded-lg opacity-90 hover:opacity-100 hover:bg-black/10 transition inline-flex items-center justify-center min-h-[40px] min-w-[40px]"
            aria-label={t('login')}
          >
            <User className="h-5 w-5 sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
