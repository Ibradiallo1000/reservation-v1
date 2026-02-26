// src/core/ui/AccessDenied.tsx
// Shown when a user lacks the required capability for a page/feature.

import React from "react";
import { ShieldX } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface AccessDeniedProps {
  message?: string;
  capability?: string;
}

const AccessDenied: React.FC<AccessDeniedProps> = ({
  message,
  capability,
}) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <ShieldX className="mx-auto h-14 w-14 text-orange-500 mb-4" />
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          Accès non autorisé
        </h1>
        <p className="text-gray-600 mb-1">
          {message ??
            "Votre rôle ou votre plan d'abonnement ne permet pas d'accéder à cette fonctionnalité."}
        </p>
        {capability && (
          <p className="text-xs text-gray-400 mb-4 font-mono">
            Capacité requise : {capability}
          </p>
        )}
        <div className="flex justify-center gap-3 mt-6">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition"
          >
            Retour
          </button>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="px-4 py-2 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700 transition"
          >
            Accueil
          </button>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
