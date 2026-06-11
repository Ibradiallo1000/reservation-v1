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
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-[var(--public-line)] bg-white/95 shadow-sm backdrop-blur-xl dark:bg-[var(--public-dark-deep)]/95">
      <div
        className="absolute inset-0 transition-all duration-300"
        style={{
          boxShadow: scrolled
            ? `0 10px 28px color-mix(in srgb, ${primary} 10%, transparent)`
            : 'none',
        }}
      />

      <div className="relative z-10 mx-auto flex h-14 max-w-6xl items-center justify-between px-3 sm:h-16 sm:px-6">
        <button
          onClick={() => navigate('/')}
          className="flex min-w-0 items-center gap-2.5"
        >
          {company?.logoUrl ? (
            <img
              src={company.logoUrl}
              className="h-9 w-9 rounded-xl object-cover shadow-sm ring-1 ring-[var(--public-line)] sm:h-10 sm:w-10"
              alt={name}
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--public-primary-soft)] text-sm font-bold sm:h-10 sm:w-10" style={{ color: primary }}>
              {name.charAt(0)}
            </div>
          )}

          <span className="max-w-[155px] truncate text-sm font-extrabold uppercase tracking-tight text-[var(--public-ink)] dark:text-white sm:max-w-[300px] sm:text-base">
            {name}
          </span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleLang}
            className="relative h-9 w-[66px] cursor-pointer rounded-full border border-[var(--public-line)] bg-[var(--public-surface)] text-xs font-bold shadow-sm sm:h-10 sm:w-[70px]"
            style={{
              color: 'var(--public-ink)',
            }}
          >
            <div
              className="absolute left-1 top-1 h-7 w-7 rounded-full shadow-md transition-all duration-300 sm:h-8 sm:w-8"
              style={{
                background: `linear-gradient(135deg, ${primary}, ${secondary})`,
                transform: isFr ? 'translateX(0)' : 'translateX(28px)',
              }}
            />
            <div className="absolute inset-0 flex items-center justify-between px-2">
              <span className={isFr ? 'text-white' : 'opacity-60'}>FR</span>
              <span className={!isFr ? 'text-white' : 'opacity-60'}>EN</span>
            </div>
          </button>

          <button
            onClick={() => navigate(loginPath)}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--public-line)] bg-[var(--public-surface)] shadow-sm transition hover:shadow-md sm:h-10 sm:w-10"
            style={{
              color: primary,
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
