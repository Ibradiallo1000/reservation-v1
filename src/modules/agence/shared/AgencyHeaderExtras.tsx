import React from "react";
import { WifiOff } from "lucide-react";

interface Props {
  isOnline: boolean;
  darkMode: boolean;
  onDarkModeToggle: () => void;
}

/** Bloc réseau + mode sombre pour header (Manager, Boarding, Fleet, Compta). Aligné avec le guichet. */
export const AgencyHeaderExtras: React.FC<Props> = ({
  isOnline,
  darkMode,
  onDarkModeToggle,
}) => (
  <>
    {!isOnline && (
      <div
        className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-50 text-red-700 text-[10px] font-semibold"
        title="Connexion perdue"
      >
        <WifiOff className="w-3 h-3" />
        <span className="hidden sm:inline">Hors-ligne</span>
      </div>
    )}
    <button
      type="button"
      onClick={onDarkModeToggle}
      className="flex items-center justify-center w-9 h-9 rounded-full border-2 border-slate-300 dark:border-slate-500 bg-white dark:bg-slate-700 text-slate-700 dark:text-gray-200 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
      title={darkMode ? "Mode jour (☀️)" : "Mode nuit (🌙)"}
    >
      {darkMode ? <span className="text-base" aria-hidden>☀️</span> : <span className="text-base" aria-hidden>🌙</span>}
    </button>
  </>
);
