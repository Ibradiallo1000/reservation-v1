import React from "react";
import { Power, Lock, AlertCircle } from "lucide-react";

interface Props {
  status: "pending" | "none" | "closed";
  locked: boolean;
  primaryColor: string;
  secondaryColor: string;
  onStart: () => void;
  onRefresh: () => void;
}

export const ClosedOverlay: React.FC<Props> = ({
  status, locked, primaryColor, secondaryColor, onStart, onRefresh,
}) => {
  const gradient = `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`;

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full opacity-20 animate-ping" style={{ backgroundColor: primaryColor }} />
          <div className="relative w-24 h-24 rounded-full bg-gray-100 grid place-items-center mx-auto">
            {locked ? (
              <Lock className="w-10 h-10 text-gray-400" />
            ) : status === "pending" ? (
              <div className="w-10 h-10 rounded-full border-4 border-gray-300 border-t-current animate-spin"
                style={{ borderTopColor: primaryColor }} />
            ) : (
              <Power className="w-10 h-10 text-gray-400" />
            )}
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            {locked
              ? "Comptoir verrouillé"
              : status === "pending"
                ? "Activation en cours…"
                : "Comptoir fermé"}
          </h2>
          <p className="text-gray-500 mt-2 text-sm max-w-xs mx-auto">
            {locked
              ? "Ce poste est déjà ouvert sur un autre appareil. Fermez-le là-bas ou contactez la comptabilité."
              : status === "pending"
                ? "Votre demande a été envoyée. La comptabilité doit activer votre poste."
                : "Ouvrez le comptoir pour commencer à vendre des billets."}
          </p>
        </div>

        {locked ? (
          <div className="flex items-center gap-2 justify-center text-sm text-amber-700 bg-amber-50 rounded-xl p-3">
            <AlertCircle className="w-4 h-4" />
            <span>Session verrouillée par un autre appareil</span>
          </div>
        ) : status === "pending" ? (
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-medium border-2 border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition"
          >
            Vérifier le statut
          </button>
        ) : (
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-lg font-bold text-white shadow-xl hover:shadow-2xl hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            style={{ background: gradient }}
          >
            <Power className="w-5 h-5" />
            Ouvrir le comptoir
          </button>
        )}
      </div>
    </div>
  );
};
