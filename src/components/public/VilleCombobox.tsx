// src/components/public/VilleCombobox.tsx
import React, { useMemo } from "react";

type VilleComboboxProps = {
  value: string;
  onChange: (value: string) => void; // <-- n'accepte QUE string (jamais null)
  placeholder?: string;
  label?: string;
  options?: string[]; // liste simple d'options (nom de villes)
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * VilleCombobox
 * - Composant simple, robuste et typé TS.
 * - Appelle onChange avec une chaîne ("" si vide). Ne transmet jamais null.
 * - Fournit un datalist HTML pour suggestions (compatible SSR/build).
 *
 * Si tu utilises un Combobox plus riche (HeadlessUI), adapte l'implémentation
 * interne ; l'API externe reste stable : onChange(value: string).
 */
const VilleCombobox: React.FC<VilleComboboxProps> = ({
  value,
  onChange,
  placeholder = "Choisir une ville",
  label,
  options = [],
  disabled = false,
  id,
  className,
}) => {
  // id fallback pour associer label/datalist
  const inputId = id || "ville-combobox-" + Math.random().toString(36).slice(2, 9);
  const datalistId = `${inputId}-list`;

  // onChange wrapper : convertit null/undefined en "" avant d'appeler le parent
  const handleChange = (v: string | null | undefined) => {
    const str = v ?? "";
    onChange(str);
  };

  const normalizedOptions = useMemo(
    () =>
      Array.isArray(options)
        ? options.filter(Boolean).map((o) => String(o))
        : [],
    [options]
  );

  return (
    <div className={className}>
      {label && (
        <label htmlFor={inputId} className="block text-xs font-semibold text-gray-700 mb-1">
          {label}
        </label>
      )}

      <div>
        <input
          id={inputId}
          list={datalistId}
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full px-3 py-2 rounded-lg border bg-white text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-orange-400/60 focus:border-orange-500"
          aria-label={label || placeholder}
          autoComplete="off"
        />

        {normalizedOptions.length > 0 && (
          <datalist id={datalistId}>
            {normalizedOptions.map((opt, idx) => (
              <option value={opt} key={idx} />
            ))}
          </datalist>
        )}
      </div>
    </div>
  );
};

export default VilleCombobox;
