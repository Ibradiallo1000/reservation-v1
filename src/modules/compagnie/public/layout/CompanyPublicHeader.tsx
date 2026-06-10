// ✅ CompanyPublicHeader.tsx — VERSION PRO

import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Company } from '@/types/companyTypes';
import { getPublicPathBase } from '../utils/subdomain';

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
  slug,
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

  const primary = colors.primary;
  const secondary = colors.secondary || colors.primary;
  const pathBase = getPublicPathBase(slug);
  const loginPath = pathBase ? `/${pathBase}/login` : '/login';

  const name =
    company?.nom || t('ourCompany', { defaultValue: 'Notre compagnie' });

  const isFr = i18n.language === 'fr';

  const toggleLang = () => {
    i18n.changeLanguage(isFr ? 'en' : 'fr');
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-3 pt-3 sm:px-6 sm:pt-4">
      <div
        className="absolute inset-x-3 top-3 h-16 rounded-2xl border transition-all duration-300 backdrop-blur-xl sm:inset-x-6 sm:top-4"
        style={{
          background: scrolled
            ? 'color-mix(in srgb, white 92%, transparent)'
            : 'color-mix(in srgb, black 20%, transparent)',
          borderColor: scrolled
            ? `color-mix(in srgb, ${primary} 12%, transparent)`
            : 'color-mix(in srgb, white 22%, transparent)',
          boxShadow: scrolled
            ? `0 14px 40px color-mix(in srgb, ${primary} 14%, transparent)`
            : '0 14px 40px color-mix(in srgb, black 16%, transparent)',
        }}
      />

      <div className="relative z-10 mx-auto flex h-16 max-w-6xl items-center justify-between px-3 sm:px-5">
        <button
          onClick={() => navigate('/')}
          className="flex min-w-0 items-center gap-2.5 sm:gap-3"
        >
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              className="h-10 w-10 rounded-full object-cover shadow-md ring-2 ring-white/50 sm:h-11 sm:w-11"
              alt={name}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold text-white sm:h-11 sm:w-11">
              {name.charAt(0)}
            </div>
          )}

          <span
            className="max-w-[145px] truncate text-sm font-extrabold uppercase tracking-tight sm:max-w-[280px] sm:text-lg"
            style={{
              color: scrolled ? 'var(--public-ink)' : 'white',
            }}
          >
            {name}
          </span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={toggleLang}
            className="relative h-10 w-[70px] cursor-pointer rounded-full border text-xs font-bold shadow-sm"
            style={{
              color: scrolled ? 'var(--public-ink)' : 'white',
              backgroundColor: scrolled
                ? 'color-mix(in srgb, white 88%, var(--public-primary))'
                : 'color-mix(in srgb, white 12%, transparent)',
              borderColor: scrolled ? 'var(--public-line)' : 'color-mix(in srgb, white 24%, transparent)',
            }}
          >
            <div
              className="absolute left-1 top-1 h-8 w-8 rounded-full shadow-md transition-all duration-300"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                transform: isFr ? 'translateX(0)' : 'translateX(30px)',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-2.5">
              <span className={isFr ? 'text-white' : 'opacity-60'}>FR</span>
              <span className={!isFr ? 'text-white' : 'opacity-60'}>EN</span>
            </div>
          </button>

          <button
            onClick={() => navigate(loginPath)}
            className="flex h-10 w-10 items-center justify-center rounded-full border transition"
            style={{
              backgroundColor: scrolled
                ? 'color-mix(in srgb, white 88%, var(--public-primary))'
                : 'color-mix(in srgb, white 12%, transparent)',
              borderColor: scrolled ? 'var(--public-line)' : 'color-mix(in srgb, white 24%, transparent)',
              color: scrolled ? primary : 'white',
            }}
            aria-label={t('account', { defaultValue: 'Compte' })}
          >
            <User className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
