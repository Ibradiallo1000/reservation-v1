// src/modules/public/layout/CompanyPublecHeader.tsx
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

const BRAND_ORANGE = '#FF6600';

const Header: React.FC<HeaderProps> = ({
  company,
  slug,
  colors,
  navigate,
  t,
}) => {
  const brandColor = colors.primary || BRAND_ORANGE;
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    if (!company?.logoUrl) return;
    const img = new Image();
    img.src = company.logoUrl;
  }, [company?.logoUrl]);

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
    <header className="absolute top-4 left-0 w-full z-50 px-4 sm:px-6">
      <div className="max-w-7xl mx-auto">
        <div
          className="flex items-center justify-between px-4 h-16 rounded-2xl backdrop-blur-md shadow-lg border"
          style={{
            background: 'rgba(255,255,255,0.15)',
            borderColor: 'rgba(255,255,255,0.25)',
          }}
        >
          {/* Logo + Nom */}
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 min-w-0 select-none"
            aria-label={name}
          >
            <div
              className="h-10 w-10 rounded-full bg-white overflow-hidden grid place-items-center shadow-sm"
              style={{ border: `2px solid ${brandColor}` }}
            >
              {company?.logoUrl ? (
                <img
                  src={company.logoUrl}
                  alt={`Logo ${name}`}
                  className="w-full h-full object-contain"
                  loading="eager"
                  decoding="async"
                  onLoad={() => setLogoLoaded(true)}
                />
              ) : (
                <Initials name={name} />
              )}
            </div>

            <span
              className="text-lg md:text-xl font-semibold tracking-tight"
              style={{ color: brandColor }}
            >
              {name}
            </span>
          </button>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block text-white">
              <LanguageSwitcher />
            </div>

            <button
              onClick={() => navigate('/login')}
              className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-white/80 backdrop-blur ring-1 ring-white/40 hover:bg-white transition"
              style={{ color: brandColor }}
              aria-label={t('login', { defaultValue: 'Connexion' })}
            >
              <User className="h-5 w-5" />
            </button>

            <div className="md:hidden text-white">
              <LanguageSwitcher />
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
