import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

export interface ReservationStepHeaderProps {
  onBack: () => void;
  primaryColor: string;
  secondaryColor: string;
  /** Step title (e.g. "Mode de paiement", "Confirmation"), NOT company name */
  title: string;
  /** Optional subtitle (e.g. route "Segou → Bamako") */
  subtitle?: string;
  logoUrl?: string;
}

/**
 * Compact premium step header for the online reservation flow.
 * Asymmetric curve (bottom-right only), secondary border accent, step-based title.
 */
export default function ReservationStepHeader({
  onBack,
  primaryColor,
  secondaryColor,
  title,
  subtitle,
  logoUrl,
}: ReservationStepHeaderProps) {
  return (
    <header
      className="sticky top-0 z-50 pt-4 pb-6 px-4 text-white overflow-hidden rounded-br-[36px] border-b-4"
      style={{
        backgroundColor: primaryColor,
        borderColor: secondaryColor,
        boxShadow: `0 8px 20px ${secondaryColor}4D`,
      }}
    >
      <div className="relative z-10 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="p-2 rounded-full hover:bg-white/20 transition flex-shrink-0"
          aria-label="Retour"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-3 min-w-0 flex-1 justify-center">
          {logoUrl && (
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/20 overflow-hidden ring-1 ring-white/30">
              <LazyLoadImage
                src={logoUrl}
                alt=""
                effect="opacity"
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="min-w-0 text-center">
            <h1 className="text-white text-lg font-semibold truncate">{title}</h1>
            {subtitle && (
              <p className="text-white/80 text-sm truncate mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        <div className="w-9 flex-shrink-0" />
      </div>
    </header>
  );
}
