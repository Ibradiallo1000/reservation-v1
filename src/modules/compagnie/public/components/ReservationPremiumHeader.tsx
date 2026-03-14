import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

export interface ReservationPremiumHeaderProps {
  onBack: () => void;
  primaryColor: string;
  secondaryColor: string;
  title: string;
  logoUrl?: string;
  companyName?: string;
  subtitle?: string;
  /** Asymmetric style: primary bg, secondary bottom border, curved bottom-right only, no subtitle in layout */
  variant?: 'default' | 'asymmetric';
}

export default function ReservationPremiumHeader({
  onBack,
  primaryColor,
  secondaryColor,
  title,
  logoUrl,
  subtitle,
  variant = 'default',
}: ReservationPremiumHeaderProps) {
  const isAsymmetric = variant === 'asymmetric';

  if (isAsymmetric) {
    return (
      <header
        className="sticky top-0 z-50 pt-2 pb-3 px-3 sm:px-4 text-white overflow-hidden rounded-br-[20px] border-b-2"
        style={{
          backgroundColor: primaryColor,
          borderColor: secondaryColor,
          boxShadow: `0 4px 12px ${secondaryColor}40`,
        }}
      >
        <div className="relative z-10 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-white/20 transition flex-shrink-0"
            aria-label="Retour"
          >
            <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
          <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
            {logoUrl && (
              <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 overflow-hidden ring-1 ring-white/30">
                <LazyLoadImage
                  src={logoUrl}
                  alt=""
                  effect="opacity"
                  className="w-full h-full object-cover"
                />
              </div>
            )}
            <h1 className="font-semibold text-base truncate">{title}</h1>
          </div>
          <div className="w-7 sm:w-8 flex-shrink-0" />
        </div>
      </header>
    );
  }

  const gradientBackground = `linear-gradient(to bottom right, ${primaryColor}, ${primaryColor}E6, ${primaryColor}CC)`;

  return (
    <header
      className="sticky top-0 z-50 pt-2 pb-3 px-3 sm:px-4 rounded-b-[20px] text-white overflow-hidden"
      style={{
        background: gradientBackground,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
      }}
    >
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundColor: secondaryColor,
          opacity: 0.2,
          filter: 'blur(48px)',
        }}
      />
      <div className="relative z-10 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-full hover:bg-white/20 transition flex-shrink-0"
          aria-label="Retour"
        >
          <ChevronLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1 justify-center">
          {logoUrl && (
            <div className="flex-shrink-0 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/20 overflow-hidden ring-1 ring-white/30">
              <LazyLoadImage
                src={logoUrl}
                alt=""
                effect="opacity"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="min-w-0 text-center">
            <h1 className="font-semibold text-base truncate">{title}</h1>
            {subtitle && (
              <p className="text-white/90 text-xs truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="w-7 sm:w-8 flex-shrink-0" />
      </div>
    </header>
  );
}
