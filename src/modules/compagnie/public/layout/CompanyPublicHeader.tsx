// ✅ CompanyPublicHeader.tsx — VERSION PRO

import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  colors,
  navigate,
  t,
}) => {
  const { i18n } = useTranslation();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const primary = colors?.primary || '#3b82f6';
  const secondary = colors?.secondary || '#6366f1';

  const name =
    company?.nom || t('ourCompany', { defaultValue: 'Notre compagnie' });

  const isFr = i18n.language === 'fr';

  const toggleLang = () => {
    i18n.changeLanguage(isFr ? 'en' : 'fr');
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50">

      {/* BACKGROUND */}
      <div
        className="absolute inset-0 transition-all duration-300 backdrop-blur-md"
        style={{
          background: scrolled
            ? 'rgba(255,255,255,0.95)'
            : 'linear-gradient(to bottom, rgba(0,0,0,0.6), transparent)',
          borderBottom: scrolled ? '1px solid rgba(0,0,0,0.08)' : 'none',
        }}
      />

      <div className="relative z-10 flex items-center justify-between h-16 px-4 sm:px-6 max-w-6xl mx-auto">

        {/* LEFT */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 min-w-0"
        >
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              className="h-11 w-11 rounded-full object-cover shadow-md ring-2 ring-white/50"
            />
          ) : (
            <div className="h-11 w-11 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold text-white">
              {name.charAt(0)}
            </div>
          )}

          <span
            className="font-bold text-lg truncate max-w-[180px]"
            style={{
              color: scrolled ? '#111827' : '#ffffff',
            }}
          >
            {name}
          </span>
        </button>

        {/* RIGHT */}
        <div className="flex items-center gap-3">

          {/* SWITCH LANGUE PRO */}
          <div
            onClick={toggleLang}
            className="relative w-[64px] h-[32px] rounded-full cursor-pointer"
            style={{
              backgroundColor: scrolled ? '#f3f4f6' : 'rgba(255,255,255,0.2)',
            }}
          >
            {/* SLIDER */}
            <div
              className="absolute top-[3px] w-[26px] h-[26px] rounded-full shadow-md transition-all duration-300"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                transform: isFr
                  ? 'translateX(4px)'
                  : 'translateX(34px)',
              }}
            />

            {/* LABELS */}
            <div className="absolute inset-0 flex items-center justify-between px-2 text-[10px] font-semibold">
              <span className={isFr ? 'text-white' : 'text-gray-500'}>
                FR
              </span>
              <span className={!isFr ? 'text-white' : 'text-gray-500'}>
                EN
              </span>
            </div>
          </div>

          {/* LOGIN */}
          <button
            onClick={() => navigate('/login')}
            className="p-2 rounded-lg transition"
            style={{
              backgroundColor: scrolled ? '#f3f4f6' : 'rgba(255,255,255,0.2)',
              color: scrolled ? primary : '#ffffff',
            }}
          >
            <User className="h-5 w-5" />
          </button>

        </div>
      </div>
    </header>
  );
};

export default Header;