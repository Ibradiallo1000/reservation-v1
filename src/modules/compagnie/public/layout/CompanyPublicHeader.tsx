// src/modules/compagnie/public/layout/CompanyPublicHeader.tsx

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
  slug: _slug,
  colors,
  navigate,
  t,
}) => {
  const { i18n } = useTranslation();
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

  const primary = colors?.primary || '#3b82f6';
  const textColor = scrollProgress > 0.5 ? primary : '#ffffff';
  const bgOpacity = scrollProgress > 0.5 ? 0.92 : 0;
  const borderOpacity = scrollProgress > 0.5 ? 0.15 : 0;

  const name =
    company?.nom || t('ourCompany', { defaultValue: 'Notre compagnie' });

  const isFr = i18n.language === 'fr';

  const toggleLang = () => {
    i18n.changeLanguage(isFr ? 'en' : 'fr');
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 w-full z-50 flex items-center justify-between h-14 sm:h-16 px-4 sm:px-6 pointer-events-none"
      style={{ color: textColor }}
    >
      <div
        style={{
          backgroundColor: `rgba(255,255,255,${bgOpacity})`,
          borderBottom:
            borderOpacity > 0
              ? `1px solid rgba(0,0,0,${borderOpacity})`
              : 'none',
        }}
        className="absolute inset-0 backdrop-blur-sm transition-all duration-300 pointer-events-auto"
      />

      <div className="relative z-10 flex items-center justify-between w-full max-w-6xl mx-auto pointer-events-auto">

        {/* LEFT */}
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 min-w-0"
        >
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-white/40 shadow"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
              {name.charAt(0)}
            </div>
          )}

          <span
            className="font-bold text-base sm:text-lg truncate max-w-[180px]"
            style={{ color: textColor }}
          >
            {name}
          </span>
        </button>

        {/* RIGHT */}
        <div className="flex items-center gap-3">

          {/* LANGUAGE SWITCH */}
          <button
            onClick={toggleLang}
            className="relative w-[60px] h-[30px] rounded-full bg-white/20 backdrop-blur flex items-center px-1"
          >
            <div
              className="absolute w-[26px] h-[26px] rounded-full shadow transition-all duration-300"
              style={{
                backgroundColor: primary,
                transform: isFr ? 'translateX(0)' : 'translateX(30px)',
              }}
            />

            <div className="w-full flex justify-between text-[10px] font-bold px-1 z-10">
              <span className={isFr ? 'text-white' : 'text-gray-600'}>
                FR
              </span>
              <span className={!isFr ? 'text-white' : 'text-gray-600'}>
                EN
              </span>
            </div>
          </button>

          {/* LOGIN */}
          <button
            onClick={() => navigate('/login')}
            className="p-2 rounded-lg hover:bg-black/10 transition"
          >
            <User className="h-5 w-5" />
          </button>

        </div>
      </div>
    </header>
  );
};

export default Header;