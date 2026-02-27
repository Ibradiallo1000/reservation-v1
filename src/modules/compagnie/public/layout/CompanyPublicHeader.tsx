// src/modules/compagnie/public/layout/CompanyPublicHeader.tsx
// Stable header: fixed glass surface, no scroll-based style switching
import React, { useEffect, useState } from 'react';
import { User, Sun, Moon } from 'lucide-react';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { Company } from '@/types/companyTypes';

const THEME_STORAGE_KEY = 'public-theme-dark';

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

const BRAND_ORANGE = '#FF6600';

const Header: React.FC<HeaderProps> = ({
  company,
  slug: _slug,
  colors,
  navigate,
  t,
}) => {
  const brandColor = colors.primary || BRAND_ORANGE;
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.documentElement.classList.contains('dark');
  });
  useEffect(() => {
    if (!company?.logoUrl) return;
    const img = new Image();
    img.src = company.logoUrl;
  }, [company?.logoUrl]);

  const toggleDark = () => {
    const currentlyDark = document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark');
    const next = !currentlyDark;
    setIsDark(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, String(next));
    } catch (_) {}
  };

  const name =
    company?.nom || t('ourCompany', { defaultValue: 'Notre compagnie' });

  const Initials = ({ name }: { name?: string }) => {
    const letter = (name || 'C').trim().charAt(0).toUpperCase();
    return (
      <div
        className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold"
        style={{ backgroundColor: brandColor }}
      >
        {letter}
      </div>
    );
  };

  return (
    <header
      className="fixed top-0 left-0 right-0 h-[72px] z-50 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-gray-200 dark:border-neutral-800"
      style={
        {
          ['--teliya-primary' as string]: brandColor,
          ['--teliya-secondary' as string]: colors.secondary || brandColor,
        } as React.CSSProperties
      }
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-3 min-w-0 select-none"
          aria-label={name}
        >
          <div
            className="h-10 w-10 rounded-full bg-white overflow-hidden grid place-items-center shadow-sm shrink-0"
            style={{ border: `2px solid ${brandColor}` }}
          >
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={`Logo ${name}`}
                className="w-full h-full object-contain"
                loading="eager"
                decoding="async"
              />
            ) : (
              <Initials name={name} />
            )}
          </div>
          <span className="text-lg md:text-xl font-bold tracking-tight truncate max-w-[140px] sm:max-w-[200px] md:max-w-none text-[var(--teliya-primary)] dark:!text-white">
            {name}
          </span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 text-gray-900 dark:text-white">
          <LanguageSwitcher
            primaryColor={brandColor}
            secondaryColor={colors.secondary || brandColor}
          />

          <button
            type="button"
            onClick={toggleDark}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition"
            aria-label={isDark ? t('themeLight') : t('themeDark')}
            style={{ color: brandColor }}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          <button
            onClick={() => navigate('/login')}
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-full bg-black/10 dark:bg-white/20 ring-1 ring-black/10 dark:ring-white/30 hover:opacity-90 transition"
            aria-label={t('login')}
            style={{ color: brandColor }}
          >
            <User className="h-5 w-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
