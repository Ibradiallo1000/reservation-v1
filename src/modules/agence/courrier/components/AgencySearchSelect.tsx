// Searchable destination agency select — live filter, keyboard accessible, mobile friendly.

import React, { useRef, useEffect, useState } from "react";

export interface AgencyOption {
  id: string;
  nomAgence?: string;
  nom?: string;
}

const getLabel = (a: AgencyOption) => a.nomAgence ?? a.nom ?? a.id;

export interface AgencySearchSelectProps {
  options: AgencyOption[];
  value: string;
  onChange: (agencyId: string) => void;
  placeholder?: string;
  "aria-label"?: string;
}

export default function AgencySearchSelect({
  options,
  value,
  onChange,
  placeholder = "Rechercher une agence…",
  "aria-label": ariaLabel = "Agence de destination",
}: AgencySearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = options.find((a) => a.id === value);
  const displayValue = selected ? getLabel(selected) : "";
  const normalizedQuery = query.trim().toLowerCase();
  const filtered =
    normalizedQuery === ""
      ? options
      : options.filter((a) => getLabel(a).toLowerCase().includes(normalizedQuery));
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
        className="w-full border border-gray-300 rounded-lg px-3 py-2.5 min-h-[44px] bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
      />
      {open && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1"
        >
          {slice.length === 0 ? (
            <li className="px-3 py-2.5 text-gray-500 text-sm">Aucune agence trouvée</li>
          ) : (
            slice.map((a, i) => (
              <li
                key={a.id}
                role="option"
                aria-selected={a.id === value}
                className={`px-3 py-2.5 min-h-[44px] flex items-center cursor-pointer text-sm ${
                  i === highlight ? "bg-orange-50 text-orange-900" : "text-gray-900 hover:bg-gray-50"
                } ${a.id === value ? "font-medium" : ""}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(a.id);
                  setQuery("");
                  setOpen(false);
                }}
              >
                {getLabel(a)}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
