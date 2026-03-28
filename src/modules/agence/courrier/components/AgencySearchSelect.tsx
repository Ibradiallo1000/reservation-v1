// Searchable destination agency select — live filter, keyboard accessible, mobile friendly.

import React, { useRef, useEffect, useState, useMemo, useCallback } from "react";

export interface AgencyOption {
  id: string;
  nomAgence?: string;
  nom?: string;
  ville?: string;
  city?: string;
  nomVille?: string;
}

const getRawLabel = (a: AgencyOption) => String(a.nomAgence ?? a.nom ?? a.id).trim();

export function agencyCityFromOption(a: AgencyOption): string {
  return String(a.ville ?? a.city ?? a.nomVille ?? "").trim();
}

function normCity(s: string): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Retire ville / « Agence [ville] » en tête du nom quand la ville est déjà connue ailleurs. */
function stripRedundantCityFromAgencyName(agencyName: string, city: string): string {
  let n = agencyName.trim();
  const c = city.trim();
  if (!n || !c) return n;
  const escaped = escapeRegExp(c);
  const rePatterns = [
    new RegExp(`^agence\\s+${escaped}\\s*$`, "i"),
    new RegExp(`^ag\\.?\\s*${escaped}\\s*$`, "i"),
    new RegExp(`^${escaped}\\s*[-–—:]\\s*`, "i"),
    new RegExp(`^agence\\s+${escaped}\\s*[-–—:]?\\s*`, "i"),
    new RegExp(`^${escaped}\\s+`, "i"),
  ];
  for (const re of rePatterns) {
    const next = n.replace(re, "").trim();
    if (next.length > 0) n = next;
  }
  return n.trim();
}

/**
 * Libellé pour le champ agence : si la ville est déjà choisie et correspond à l’agence,
 * n’affiche que la partie distinctive (ex. « Sogoniko » au lieu de répéter « Bamako »).
 * Sinon : « Ville — Nom agence » pour lever l’ambiguïté.
 */
/** Agences dont la ville (ou le libellé) correspond à la ville choisie — même logique que le filtre du combobox. */
export function filterAgenciesBySelectedCity(
  options: AgencyOption[],
  selectedCity: string,
  excludeAgencyId?: string
): AgencyOption[] {
  let base = options;
  if (excludeAgencyId) base = base.filter((a) => a.id !== excludeAgencyId);
  const sc = String(selectedCity ?? "").trim();
  if (!sc) return base;
  const target = normCity(sc);
  const matches = base.filter((a) => {
    const c = agencyCityFromOption(a);
    if (c && normCity(c) === target) return true;
    const n = normCity(getRawLabel(a));
    return n === target || n.includes(target) || target.includes(n);
  });
  return matches.length > 0 ? matches : base;
}

/** Filtre strict (sans repli sur toutes les agences) — étapes guichet / courrier. */
export function filterAgenciesStrictInCity(
  options: AgencyOption[],
  selectedCity: string,
  excludeAgencyId?: string
): AgencyOption[] {
  let base = options;
  if (excludeAgencyId) base = base.filter((a) => a.id !== excludeAgencyId);
  const sc = String(selectedCity ?? "").trim();
  if (!sc) return [];
  const target = normCity(sc);
  return base.filter((a) => {
    const c = agencyCityFromOption(a);
    if (c && normCity(c) === target) return true;
    const n = normCity(getRawLabel(a));
    return n === target || n.includes(target) || target.includes(n);
  });
}

export function formatAgencyDestinationLabel(agency: AgencyOption, selectedCity?: string): string {
  const raw = getRawLabel(agency);
  const cityField = agencyCityFromOption(agency);
  const sc = String(selectedCity ?? "").trim();

  if (!sc) {
    if (cityField && normCity(cityField) !== normCity(raw)) return `${cityField} — ${raw}`;
    return raw;
  }

  if (normCity(cityField) !== normCity(sc)) {
    return cityField ? `${cityField} — ${raw}` : raw;
  }

  const stripped = stripRedundantCityFromAgencyName(raw, sc);
  return stripped || raw;
}

export interface AgencySearchSelectProps {
  options: AgencyOption[];
  value: string;
  onChange: (agencyId: string) => void;
  placeholder?: string;
  "aria-label"?: string;
  /** Champ plus bas (guichet compact) */
  dense?: boolean;
  /** Ville déjà sélectionnée (tuile) — évite les doublons visuels et filtre les agences */
  selectedCity?: string;
  /** Exclure l’agence d’origine (pas d’envoi vers soi-même) */
  excludeAgencyId?: string;
  /**
   * Si une ville est sélectionnée, ne proposer que les agences de cette ville (avec repli si aucune).
   * @default true
   */
  restrictToSelectedCity?: boolean;
}

export default function AgencySearchSelect({
  options,
  value,
  onChange,
  placeholder = "Rechercher une agence…",
  "aria-label": ariaLabel = "Agence de destination",
  dense = false,
  selectedCity = "",
  excludeAgencyId,
  restrictToSelectedCity = true,
}: AgencySearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const baseOptions = useMemo(() => {
    let list = options;
    if (excludeAgencyId) list = list.filter((a) => a.id !== excludeAgencyId);
    return list;
  }, [options, excludeAgencyId]);

  const cityScopedOptions = useMemo(() => {
    if (!restrictToSelectedCity) return baseOptions;
    return filterAgenciesBySelectedCity(baseOptions, selectedCity);
  }, [baseOptions, selectedCity, restrictToSelectedCity]);

  const selected = useMemo(
    () => cityScopedOptions.find((a) => a.id === value) ?? baseOptions.find((a) => a.id === value),
    [cityScopedOptions, baseOptions, value]
  );

  const pick = useCallback(
    (a: AgencyOption) => formatAgencyDestinationLabel(a, selectedCity),
    [selectedCity]
  );

  const displayValue = selected ? pick(selected) : "";
  const normalizedQuery = query.trim().toLowerCase();
  const filtered =
    normalizedQuery === ""
      ? cityScopedOptions
      : cityScopedOptions.filter((a) => pick(a).toLowerCase().includes(normalizedQuery));
  const slice = filtered.slice(0, 30);

  useEffect(() => {
    if (!open) setHighlight(0);
  }, [open]);

  useEffect(() => {
    if (open && listRef.current) {
      const el = listRef.current.children[highlight] as HTMLElement;
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [open, highlight]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h < slice.length - 1 ? h + 1 : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h > 0 ? h - 1 : slice.length - 1));
      return;
    }
    if (e.key === "Enter" && slice[highlight]) {
      e.preventDefault();
      onChange(slice[highlight].id);
      setQuery("");
      setOpen(false);
    }
  };

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={open ? query : displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-autocomplete="list"
        role="combobox"
        className={`w-full border border-gray-300 bg-white text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-orange-500 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100 ${
          dense
            ? "h-9 rounded-md px-2 py-0 text-xs"
            : "min-h-[44px] rounded-lg px-3 py-2.5"
        }`}
      />
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {slice.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-gray-500">Aucune agence trouvée</li>
          ) : (
            slice.map((a, i) => (
              <li
                key={a.id}
                role="option"
                aria-selected={a.id === value}
                className={`flex min-h-[44px] cursor-pointer items-center px-3 py-2.5 text-sm ${
                  i === highlight ? "bg-orange-50 text-orange-900" : "text-gray-900 hover:bg-gray-50"
                } ${a.id === value ? "font-medium" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(a.id);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{pick(a)}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export interface AgencyDestinationChipListProps {
  options: AgencyOption[];
  value: string;
  onChange: (agencyId: string) => void;
  selectedCity: string;
  primaryColor: string;
  "aria-label"?: string;
}

/** Liste compacte d’agences (étape 2) — uniquement si plusieurs choix ; sinon ne rien afficher côté parent. */
export function AgencyDestinationChipList({
  options,
  value,
  onChange,
  selectedCity,
  primaryColor,
  "aria-label": ariaLabel = "Choisir l'agence de destination",
}: AgencyDestinationChipListProps) {
  if (options.length <= 1) return null;

  return (
    <div className="min-w-0" role="radiogroup" aria-label={ariaLabel}>
      <div className="-mx-0.5 flex flex-nowrap gap-1 overflow-x-auto px-0.5 pb-0.5 scrollbar-none">
        {options.map((a) => {
          const active = a.id === value;
          const label = formatAgencyDestinationLabel(a, selectedCity);
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(a.id)}
              className={`h-8 max-w-[min(100%,14rem)] shrink-0 truncate rounded-md border px-2.5 text-left text-xs font-semibold transition-colors ${
                active
                  ? "border-current text-white"
                  : "border-gray-200 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-950 dark:text-gray-100"
              }`}
              style={
                active ? { borderColor: primaryColor, backgroundColor: primaryColor } : undefined
              }
              title={label}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
