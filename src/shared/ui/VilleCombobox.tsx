// src/shared/ui/VilleCombobox.tsx
// Combobox villes : filtre en temps réel, ouverture au focus, pas de logique bloquante

import React, { useState, useEffect, useRef, useMemo } from "react";
import { MapPin } from "lucide-react";
import { useVilles } from "@/shared/hooks/useVilles";

type VilleComboboxProps = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
};

const VilleCombobox: React.FC<VilleComboboxProps> = ({
  value,
  onChange,
  placeholder = "Ville…",
  required = false,
}) => {
  const { villes } = useVilles();
  const [showList, setShowList] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const normalize = (text: string) =>
    text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/['’`-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  // Filtrage robuste: ignore accents/casse/tirets/apostrophes et priorise startsWith.
  const filtered = useMemo(() => {
    const q = normalize(value);
    if (!q) return villes;
    const startsWithMatches: string[] = [];
    const includesMatches: string[] = [];

    for (const city of villes) {
      const normalizedCity = normalize(city);
      if (normalizedCity.startsWith(q)) {
        startsWithMatches.push(city);
      } else if (normalizedCity.includes(q)) {
        includesMatches.push(city);
      }
    }

    return [...startsWithMatches, ...includesMatches];
  }, [villes, value]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered]);

  // Focus → ouvrir la liste si des villes sont chargées
  const handleFocus = () => {
    if (villes.length > 0) setShowList(true);
  };

  // Clic extérieur → fermer
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowList(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const choose = (val: string) => {
    onChange(val);
    setShowList(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showList || filtered.length === 0) {
      if (e.key === "Escape") setShowList(false);
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((i) => Math.max(0, i - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightedIndex]) choose(filtered[highlightedIndex]);
        break;
      case "Escape":
        e.preventDefault();
        setShowList(false);
        break;
      default:
        break;
    }
  };

  const displayList = showList && filtered.length > 0;

  return (
    <div ref={containerRef} className="flex-1 relative z-20">
      <div className="flex items-center border border-gray-200 rounded-xl px-3 py-2 bg-white">
        <MapPin className="h-5 w-5 text-gray-500 mr-2 shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          className="flex-1 outline-none text-gray-900 placeholder-gray-400 bg-white caret-gray-900 min-w-0"
          autoComplete="off"
        />
      </div>

      {displayList && (
        <ul
          className="absolute top-full left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl bg-white border border-gray-200 shadow-lg z-50"
          role="listbox"
        >
          {filtered.map((c, i) => (
            <li
              key={c}
              className={`px-3 py-2 text-gray-900 hover:bg-gray-100 cursor-pointer ${
                i === highlightedIndex ? "bg-gray-100" : ""
              }`}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(c);
              }}
            >
              {c}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VilleCombobox;
