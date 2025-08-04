// ✅ Composant VilleCombobox mis à jour avec chargement des villes depuis Firestore

import React, { useEffect, useState } from 'react';
import { Combobox } from '@headlessui/react';
import { Check, ChevronDown } from 'lucide-react';
import { db } from '@/firebaseConfig';
import { collection, getDocs } from 'firebase/firestore';

interface VilleComboboxProps {
  label: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  highlightColor?: string;
  options: string[]; // ← AJOUTE CETTE LIGNE
}

const VilleCombobox: React.FC<VilleComboboxProps> = ({
  label,
  placeholder = 'Choisissez une ville',
  value,
  onChange,
  highlightColor = '#3B82F6',
}) => {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<string[]>([]);

  useEffect(() => {
    const fetchVilles = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'villes'));
        const villes = snapshot.docs.map((doc) => doc.data().nom).filter(Boolean);
        setOptions(villes);
      } catch (err) {
        console.error('Erreur chargement villes :', err);
      }
    };
    fetchVilles();
  }, []);

  const filtered =
    query === ''
      ? options
      : options.filter((v) =>
          v.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').includes(
            query.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
          )
        );

  return (
    <div className="w-full">
      <Combobox value={value} onChange={onChange}>
        <Combobox.Label className="block text-sm font-medium text-white mb-1">
          {label}
        </Combobox.Label>
        <div className="relative">
          <Combobox.Input
            className="w-full border border-gray-300 rounded-md py-2 pl-3 pr-10 text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
            displayValue={(v: string) => v}
            value={value}
            onChange={(event) => {
              setQuery(event.target.value);
              onChange(event.target.value);
            }}
            placeholder={placeholder}
            autoComplete="off"
          />
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-3">
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </Combobox.Button>

          {filtered.length > 0 && (
            <Combobox.Options className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm">
              {filtered.map((option, index) => (
                <Combobox.Option
                  key={index}
                  value={option}
                  className={({ active }) =>
                    `relative cursor-pointer select-none py-2 pl-10 pr-4 ${
                      active ? 'text-white' : 'text-gray-900'
                    }`
                  }
                >
                  {({ selected, active }) => (
                    <div
                      style={{ backgroundColor: active ? highlightColor : undefined }}
                      className="w-full h-full"
                    >
                      <span
                        className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}
                      >
                        {option}
                      </span>
                      {selected && (
                        <span
                          className="absolute inset-y-0 left-0 flex items-center pl-3"
                          style={{ color: active ? 'white' : highlightColor }}
                        >
                          <Check className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                    </div>
                  )}
                </Combobox.Option>
              ))}
            </Combobox.Options>
          )}
        </div>
      </Combobox>
    </div>
  );
};

export default VilleCombobox;
