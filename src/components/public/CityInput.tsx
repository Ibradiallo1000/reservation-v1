// ✅ COMPOSANT : CityInput
// Champ de saisie intelligent pour une ville (départ ou arrivée)
// Affiche automatiquement des suggestions filtrées selon la saisie de l'utilisateur

import React, { useState } from 'react';
import { motion } from 'framer-motion';

interface CityInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  onSelectSuggestion: (city: string) => void;
  icon: React.ReactNode;
  placeholder: string;
  classes: any;
}

const CityInput: React.FC<CityInputProps> = ({
  label,
  value,
  onChange,
  suggestions,
  onSelectSuggestion,
  icon,
  placeholder,
  classes
}) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <div className="relative">
      {/* ✅ Libellé du champ */}
      <label className="block text-sm font-medium text-white/90 mb-1">
        {label}
      </label>

      {/* ✅ Conteneur de l'input avec icône */}
      <div className="relative">
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2">
          {icon}
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder={placeholder}
          required
          className={`pl-10 w-full bg-white/20 h-12 rounded-lg text-base text-white placeholder-white/60 ${classes.input}`}
        />

        {/* ✅ Liste déroulante des suggestions */}
        {isFocused && suggestions.length > 0 && (
          <motion.ul
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute z-10 mt-1 w-full bg-white rounded-md shadow-lg max-h-60 overflow-auto"
            role="listbox"
          >
            {suggestions.map((city, index) => (
              <li key={index} role="option">
                <button
                  type="button"
                  onClick={() => {
                    onSelectSuggestion(city);
                    setIsFocused(false);
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-gray-100 text-gray-800"
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {city}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </div>
    </div>
  );
};

export default CityInput;
