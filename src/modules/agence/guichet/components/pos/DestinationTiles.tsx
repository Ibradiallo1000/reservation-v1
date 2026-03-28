import React, { useState, useMemo } from "react";
import { MapPin, Search } from "lucide-react";

interface Props {
  departure: string;
  arrivals: string[];
  selected: string;
  onSelect: (city: string) => void;
  primaryColor: string;
  /** Affiche une seule ligne "Départ : X" au lieu de répéter dans la page parente */
  showDepartureLabel?: boolean;
  /** Libellé accessibilité du groupe (ex. « Ville d'arrivée ») */
  groupAriaLabel?: string;
  /** Champ de filtre des villes (désactiver si peu de destinations) */
  showSearch?: boolean;
}

/**
 * Sélection de ville : une seule présentation — bandeau horizontal de boutons compacts (h-8) + scroll.
 */
export const DestinationTiles: React.FC<Props> = ({
  departure,
  arrivals,
  selected,
  onSelect,
  primaryColor,
  showDepartureLabel = false,
  groupAriaLabel = "Villes de destination",
  showSearch = true,
}) => {
  const [search, setSearch] = useState("");

  const filteredArrivals = useMemo(() => {
    if (!search.trim()) return arrivals;
    const q = search.trim().toLowerCase();
    return arrivals.filter((city) => city.toLowerCase().includes(q));
  }, [arrivals, search]);

  if (arrivals.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 px-2 py-2 text-center dark:border-gray-600">
        <p className="text-xs text-gray-500">
          Départ : <strong>{departure || "—"}</strong>
        </p>
        <p className="mt-0.5 text-[11px] text-gray-400">
          Aucune destination configurée. Contactez l&apos;administrateur.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 min-w-0">
      {showDepartureLabel && (
        <p className="mb-1 truncate text-[11px] text-gray-500 dark:text-gray-400">
          Départ : <strong className="text-gray-900 dark:text-gray-100">{departure || "—"}</strong>
        </p>
      )}
      {showSearch ? (
        <div className="relative mb-1.5">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrer les villes…"
            aria-label={`Rechercher une ville (${groupAriaLabel})`}
            className="h-8 w-full rounded-md border border-gray-300 py-0 pl-8 pr-2 text-xs focus:border-transparent focus:outline-none focus:ring-1 dark:border-gray-600 dark:bg-gray-950"
            style={{ ["--tw-ring-color" as string]: `${primaryColor}55` }}
            autoComplete="off"
          />
        </div>
      ) : null}
      <div
        className="-mx-0.5 flex flex-nowrap gap-1 overflow-x-auto px-0.5 pb-0.5 scrollbar-none"
        role="group"
        aria-label={groupAriaLabel}
      >
        {filteredArrivals.map((city) => {
          const active = selected.toLowerCase() === city.toLowerCase();
          return (
            <button
              key={city}
              type="button"
              onClick={() => onSelect(city)}
              className={`h-8 shrink-0 rounded-md border px-2.5 text-xs font-semibold transition-colors ${
                active
                  ? "border-current text-white"
                  : "border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
              }`}
              style={
                active ? { borderColor: primaryColor, backgroundColor: primaryColor } : undefined
              }
              title={city}
            >
              {city}
            </button>
          );
        })}
      </div>
      {filteredArrivals.length === 0 && search.trim() && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Aucune ville « {search} »</p>
      )}
    </div>
  );
};
