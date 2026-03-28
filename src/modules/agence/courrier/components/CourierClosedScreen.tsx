import React from "react";
import { Power } from "lucide-react";
import { useCourierWorkspace } from "../context/CourierWorkspaceContext";

/**
 * Vue plein écran comptoir fermé / attente activation — uniquement sur l’onglet Courrier (hub).
 */
export const CourierClosedScreen: React.FC = () => {
  const w = useCourierWorkspace();
  const { counterUiStatus, primaryColor, secondaryColor, openComptoir, hubLoading } = w;
  const gradient = `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})`;

  if (counterUiStatus === "pending") {
    return (
      <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 p-8 dark:bg-gray-950">
        <div className="w-full max-w-md space-y-6 text-center">
          <div className="relative mx-auto h-24 w-24">
            <div
              className="absolute inset-0 animate-ping rounded-full opacity-20"
              style={{ backgroundColor: primaryColor }}
            />
            <div
              className="relative mx-auto grid h-24 w-24 place-items-center rounded-full border-4 border-gray-200 dark:border-gray-700"
              style={{ borderTopColor: primaryColor }}
            >
              <div
                className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-current dark:border-gray-600"
                style={{ borderTopColor: primaryColor }}
              />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Activation en cours…</h2>
            <p className="mx-auto mt-2 max-w-xs text-sm text-gray-500 dark:text-gray-400">
              Votre demande a été envoyée. Le comptable d&apos;agence doit activer votre comptoir. Cette page se met
              à jour automatiquement.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-gray-50 p-8 dark:bg-gray-950">
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="relative mx-auto h-24 w-24">
          <div
            className="absolute inset-0 animate-ping rounded-full opacity-20"
            style={{ backgroundColor: primaryColor }}
          />
          <div className="relative mx-auto grid h-24 w-24 place-items-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Power className="h-10 w-10 text-gray-400 dark:text-gray-500" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Comptoir fermé</h2>
        </div>
        <button
          type="button"
          onClick={() => void openComptoir()}
          disabled={hubLoading}
          className="inline-flex items-center gap-2 rounded-xl px-8 py-4 text-lg font-bold text-white shadow-xl transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl active:scale-[0.98] disabled:opacity-50"
          style={{ background: gradient }}
        >
          <Power className="h-5 w-5" />
          Ouvrir le comptoir
        </button>
      </div>
    </div>
  );
};
