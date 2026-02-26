// Phase 1 Stabilization — Plaque Mali : 3 champs (AA | 100 | AF). Valeur finale avec espaces.
import React from "react";
import { formatPlateFromParts, validatePlate } from "./plateValidation";

type PlateInput3PartsProps = {
  country: string;
  part1: string;
  part2: string;
  part3: string;
  onChange: (part1: string, part2: string, part3: string) => void;
  onBlur?: () => void;
  error?: string | null;
  required?: boolean;
  className?: string;
  disabled?: boolean;
};

/** 3 champs : 2 lettres | 3 ou 4 chiffres | 2 lettres. Auto-uppercase lettres, valeur finale "AA 100 AF". */
export default function PlateInput3Parts({
  country,
  part1,
  part2,
  part3,
  onChange,
  onBlur,
  error,
  required = false,
  className = "",
  disabled = false,
}: PlateInput3PartsProps) {
  const handlePart1 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    onChange(v, part2, part3);
  };
  const handlePart2 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.replace(/\D/g, "").slice(0, 4);
    onChange(part1, v, part3);
  };
  const handlePart3 = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
    onChange(part1, part2, v);
  };

  const finalValue = formatPlateFromParts(part1, part2, part3);
  const isValid = !finalValue || validatePlate(country, finalValue);

  return (
    <div className={className}>
      <div className="flex items-center gap-1 flex-wrap">
        <input
          type="text"
          value={part1}
          onChange={handlePart1}
          onBlur={onBlur}
          placeholder="AA"
          maxLength={2}
          disabled={disabled}
          className={`w-12 text-center border rounded-lg px-2 py-2 text-sm font-mono uppercase ${
            error || (finalValue && !isValid) ? "border-red-500" : "border-slate-300"
          }`}
          required={required}
          aria-label="Plaque partie 1 (2 lettres)"
        />
        <span className="text-slate-400 font-medium">|</span>
        <input
          type="text"
          inputMode="numeric"
          value={part2}
          onChange={handlePart2}
          onBlur={onBlur}
          placeholder="100"
          maxLength={4}
          disabled={disabled}
          className={`w-14 text-center border rounded-lg px-2 py-2 text-sm font-mono ${
            error || (finalValue && !isValid) ? "border-red-500" : "border-slate-300"
          }`}
          required={required}
          aria-label="Plaque partie 2 (3 ou 4 chiffres)"
        />
        <span className="text-slate-400 font-medium">|</span>
        <input
          type="text"
          value={part3}
          onChange={handlePart3}
          onBlur={onBlur}
          placeholder="AF"
          maxLength={2}
          disabled={disabled}
          className={`w-12 text-center border rounded-lg px-2 py-2 text-sm font-mono uppercase ${
            error || (finalValue && !isValid) ? "border-red-500" : "border-slate-300"
          }`}
          required={required}
          aria-label="Plaque partie 3 (2 lettres)"
        />
      </div>
      {(error || (finalValue && !isValid)) && (
        <p className="mt-1 text-xs text-red-600">
          {error || "Format plaque invalide. Mali : AA 100 AF (3 chiffres) ou AB 1234 MD (4 chiffres)."}
        </p>
      )}
    </div>
  );
}

export { formatPlateFromParts };
