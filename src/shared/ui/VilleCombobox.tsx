// src/shared/ui/VilleCombobox.tsx
// Combobox villes : une seule surface visuelle, design premium, dropdown fluide. Logique métier inchangée.

import React, { useState, useEffect, useRef, useMemo } from "react";
import { MapPin } from "lucide-react";
import { useVilles } from "@/shared/hooks/useVilles";

type VilleComboboxProps = {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  /** Afficher l’icône de localisation (MapPin) à gauche du champ. */
  showLocationIcon?: boolean;
  /** Style du wrapper (conteneur). Le parent contrôle le rendu ; pas de styles contradictoires. */
  wrapperClassName?: string;
  /** Style du champ input (texte/placeholder). Input reste bg-transparent. */
  inputClassName?: string;
};

const BASE_WRAPPER =
  "flex items-center min-w-0 bg-white border border-gray-200 rounded-xl px-4 py-3 min-h-[48px] transition focus-within:ring-2 focus-within:ring-gray-300 focus-within:border-gray-300";

const BASE_INPUT =
  "w-full min-w-0 bg-transparent outline-none font-medium text-gray-900 placeholder-gray-400";

const DROPDOWN_LIST =
  "absolute top-full left-0 right-0 mt-2 max-h-60 overflow-y-auto overflow-x-hidden bg-white border border-gray-200 rounded-xl shadow-lg z-50";

const DROPDOWN_ITEM_BASE =
  "px-4 py-3 cursor-pointer text-gray-800 hover:bg-gray-100";
const DROPDOWN_ITEM_ACTIVE = "bg-gray-100";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[''`-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const VilleCombobox: React.FC<VilleComboboxProps> = ({
  value,
  onChange,
  placeholder = "Ville…",
  required = false,
  showLocationIcon = false,
  wrapperClassName,
  inputClassName,
}) => {
  const { villes } = useVilles();
  const [showList, setShowList] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = normalize(value);
    if (!q) return villes;
    const startsWithMatches: string[] = [];
    const includesMatches: string[] = [];
    for (const city of villes) {
      const n = normalize(city);
      if (n.startsWith(q)) startsWithMatches.push(city);
      else if (n.includes(q)) includesMatches.push(city);
    }
    return [...startsWithMatches, ...includesMatches];
  }, [villes, value]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [filtered]);

  const handleFocus = () => {
    if (villes.length > 0) setShowList(true);
  };

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

  const showDropdown = showList && filtered.length > 0;

  const wrapperCls =
    wrapperClassName != null
      ? `${wrapperClassName} flex items-center min-w-0`
      : BASE_WRAPPER;

  const inputCls =
    inputClassName != null
      ? `${BASE_INPUT} ${inputClassName}`
      : BASE_INPUT;

  return (
    <div ref={containerRef} className="flex-1 min-w-0 relative z-20 w-full">
      <div className={wrapperCls}>
        {showLocationIcon && (
          <MapPin className="h-5 w-5 text-gray-600 shrink-0 mr-3" aria-hidden />
        )}
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          required={required}
          className={inputCls}
          autoComplete="off"
        />
      </div>

      {showDropdown && (
        <ul className={DROPDOWN_LIST} role="listbox">
          {filtered.map((city, i) => (
            <li
              key={city}
              className={`${DROPDOWN_ITEM_BASE} ${i === highlightedIndex ? DROPDOWN_ITEM_ACTIVE : ""}`}
              onMouseEnter={() => setHighlightedIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(city);
              }}
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default VilleCombobox;
