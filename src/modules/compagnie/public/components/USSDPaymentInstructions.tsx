import React, { useState } from 'react';
import { Phone } from 'lucide-react';

export interface USSDPaymentInstructionsProps {
  ussdCode: string;
  primaryColor: string;
  secondaryColor: string;
  onSendProof: () => void;
  onRecompose: () => void;
}

/**
 * Intermediate step before opening USSD: instructions + clickable code, then confirmation block.
 * Premium UI: gradient buttons, 3D cards, consistent spacing.
 */
const USSDPaymentInstructions: React.FC<USSDPaymentInstructionsProps> = ({
  ussdCode,
  primaryColor,
  secondaryColor,
  onSendProof,
  onRecompose,
}) => {
  const [hasClickedUssd, setHasClickedUssd] = useState(false);

  const handleUssdClick = () => {
    setHasClickedUssd(true);
    window.location.href = `tel:${encodeURIComponent(ussdCode)}`;
  };

  return (
    <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-6 pb-24 space-y-6">
      {/* Instructions card — 3D style */}
      <div
        className="relative bg-white rounded-2xl p-5 shadow-xl border"
        style={{
          borderColor: `${secondaryColor}4D`,
          boxShadow: `0 12px 25px rgba(0,0,0,0.15), 0 0 0 1px ${secondaryColor}4D`,
        }}
      >
        <h2 className="text-lg font-bold text-gray-900 mb-4">
          Comment effectuer votre paiement
        </h2>
        <ol className="list-decimal list-inside space-y-3 text-sm text-gray-700">
          <li>Composez le code USSD ci-dessous.</li>
          <li>Effectuez le paiement demandé.</li>
          <li>Revenez ensuite dans l&apos;application pour envoyer votre preuve.</li>
        </ol>

        {/* Large clickable USSD button */}
        <button
          type="button"
          onClick={handleUssdClick}
          className="mt-6 w-full rounded-2xl py-4 px-4 flex items-center justify-center gap-3 font-semibold text-white shadow-lg transition active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            boxShadow: `0 10px 25px ${secondaryColor}66`,
          }}
        >
          <Phone className="w-6 h-6" aria-hidden />
          <span className="text-lg tracking-wide select-all">{ussdCode}</span>
        </button>
      </div>

      {/* Confirmation block — shown after user clicked USSD */}
      {hasClickedUssd && (
        <div
          className="relative bg-white rounded-2xl p-5 shadow-xl border"
          style={{
            borderColor: `${secondaryColor}4D`,
            boxShadow: `0 12px 25px rgba(0,0,0,0.15), 0 0 0 1px ${secondaryColor}4D`,
          }}
        >
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Avez-vous terminé le paiement ?
          </h2>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={onSendProof}
              className="w-full rounded-xl py-3.5 font-semibold text-white shadow-md transition hover:opacity-95 active:scale-[0.98]"
              style={{
                background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
                boxShadow: `0 8px 20px ${secondaryColor}55`,
              }}
            >
              Oui, envoyer ma preuve
            </button>
            <button
              type="button"
              onClick={onRecompose}
              className="w-full rounded-xl py-3 font-medium border-2 transition hover:bg-gray-50 active:scale-[0.98]"
              style={{
                borderColor: `${primaryColor}99`,
                color: primaryColor,
              }}
            >
              Recomposer le code
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default USSDPaymentInstructions;
