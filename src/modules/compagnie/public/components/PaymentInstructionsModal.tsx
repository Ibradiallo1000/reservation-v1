import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

const PAYMENT_INSTRUCTIONS_SEEN_KEY = 'paymentInstructionsSeen';

export function getPaymentInstructionsSeen(): boolean {
  try {
    return localStorage.getItem(PAYMENT_INSTRUCTIONS_SEEN_KEY) === 'true';
  } catch {
    return false;
  }
}

export interface PaymentInstructionsModalProps {
  primaryColor: string;
  secondaryColor: string;
  onClose: (dontShowAgain: boolean) => void;
}

/**
 * Modal shown once on PaymentMethodPage with payment instructions.
 * Optional "Ne plus afficher" checkbox; "J'ai compris" closes and optionally persists.
 */
const PaymentInstructionsModal: React.FC<PaymentInstructionsModalProps> = ({
  primaryColor,
  secondaryColor,
  onClose,
}) => {
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleUnderstood = () => {
    try {
      localStorage.setItem(PAYMENT_INSTRUCTIONS_SEEN_KEY, dontShowAgain ? 'true' : 'false');
    } catch { /* ignore */ }
    onClose(dontShowAgain);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="payment-instructions-title"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl border"
        style={{
          borderColor: `${secondaryColor}4D`,
          boxShadow: '0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(0,0,0,0.05)',
        }}
      >
        <h2
          id="payment-instructions-title"
          className="text-lg font-bold text-gray-900 mb-4"
        >
          Instructions de paiement
        </h2>

        <ol className="list-none space-y-3 text-sm text-gray-700 mb-4">
          <li className="flex gap-2">
            <span className="flex-shrink-0" aria-hidden>1️⃣</span>
            <span>Choisissez un moyen de paiement.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0" aria-hidden>2️⃣</span>
            <span>Effectuez le paiement lorsque le menu USSD s&apos;ouvre automatiquement.</span>
          </li>
          <li className="flex gap-2">
            <span className="flex-shrink-0" aria-hidden>3️⃣</span>
            <span>Revenez ensuite dans l&apos;application pour envoyer votre preuve de paiement.</span>
          </li>
        </ol>

        <div
          className="rounded-xl p-3 mb-5 flex gap-3"
          style={{
            backgroundColor: `${primaryColor}12`,
            borderLeft: `4px solid ${primaryColor}`,
          }}
        >
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: primaryColor }} aria-hidden />
          <div className="text-sm text-gray-800">
            <span className="font-semibold">Important</span>
            <p className="mt-1 text-gray-700">
              Après avoir effectué le paiement, revenez dans l&apos;application pour envoyer votre preuve afin de confirmer votre réservation.
            </p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span>Ne plus afficher</span>
        </label>

        <button
          type="button"
          onClick={handleUnderstood}
          className="w-full rounded-xl py-3.5 font-semibold text-white shadow-md transition hover:opacity-95 active:scale-[0.98]"
          style={{
            background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`,
            boxShadow: `0 8px 20px ${secondaryColor}55`,
          }}
        >
          J&apos;ai compris
        </button>
      </div>
    </div>
  );
};

export default PaymentInstructionsModal;
