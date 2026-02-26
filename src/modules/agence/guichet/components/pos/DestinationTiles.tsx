import React, { useState, useMemo } from "react";
import { MapPin, ArrowRight, Search } from "lucide-react";

interface Props {
  departure: string;
  arrivals: string[];
  selected: string;
  onSelect: (city: string) => void;
  primaryColor: string;
  /** Affiche une seule ligne "Départ : X" au lieu de répéter dans la page parente */
  showDepartureLabel?: boolean;
}

export const DestinationTiles: React.FC<Props> = ({
  departure,
  arrivals,
  selected,
  onSelect,
  primaryColor,
  showDepartureLabel = false,
}) => {
  const [search, setSearch] = useState("");

  const filteredArrivals = useMemo(() => {
    if (!search.trim()) return arrivals;
    const q = search.trim().toLowerCase();
    return arrivals.filter((city) => city.toLowerCase().includes(q));
  }, [arrivals, search]);

  if (arrivals.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-gray-200 p-8 text-center">
        <MapPin className="w-8 h-8 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-500">Départ : <strong>{departure || "—"}</strong></p>
        <p className="text-sm text-gray-400 mt-2">Aucune destination configurée. Contactez l&apos;administrateur.</p>
      </div>
    );
  }

  return (
    <div>
      {showDepartureLabel && (
        <p className="text-sm text-gray-500 mb-2">
          Départ : <strong className="text-gray-900">{departure || "—"}</strong>
        </p>
      )}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une destination..."
          className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ ["--tw-ring-color" as string]: `${primaryColor}40` }}
          autoComplete="off"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5">
        {filteredArrivals.map((city) => {
          const active = selected.toLowerCase() === city.toLowerCase();
          return (
            <button
              key={city}
              type="button"
              onClick={() => onSelect(city)}
              className={`group relative flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 transition-all duration-200 text-left ${
                active
                  ? "border-current shadow-md scale-[1.02]"
                  : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
              }`}
              style={active ? { borderColor: primaryColor, backgroundColor: `${primaryColor}08` } : undefined}
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  active ? "text-white" : "bg-gray-100 text-gray-400 group-hover:bg-gray-200"
                }`}
                style={active ? { backgroundColor: primaryColor } : undefined}
              >
                <ArrowRight className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <p
                  className={`font-semibold truncate ${active ? "" : "text-gray-900"}`}
                  style={active ? { color: primaryColor } : undefined}
                >
                  {city}
                </p>
                <p className="text-[11px] text-gray-400 truncate">{departure} → {city}</p>
              </div>
            </button>
          );
        })}
      </div>
      {filteredArrivals.length === 0 && search.trim() && (
        <p className="text-sm text-amber-600 mt-2">Aucune ville ne correspond à « {search} ». Modifiez la recherche ou choisissez une autre destination.</p>
      )}
    </div>
  );
};
