import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const CityAutocomplete: React.FC<Props> = ({ label, value, onChange }) => {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);

  useEffect(() => {
    const fetchCities = async () => {
      const snap = await getDocs(collection(db, 'cities'));
      const cities = snap.docs.map((doc) => doc.data().name);
      setSuggestions(cities);
    };
    fetchCities();
  }, []);

  useEffect(() => {
    if (value.length >= 2) {
      const f = suggestions.filter(city =>
        city.toLowerCase().includes(value.toLowerCase())
      ).slice(0, 5);
      setFiltered(f);
    } else {
      setFiltered([]);
    }
  }, [value, suggestions]);

  return (
    <div className="relative">
      <label className="block text-sm font-semibold mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border rounded bg-white/20 text-white placeholder-white"
        placeholder={`Choisir ${label.toLowerCase()}`}
      />
      {filtered.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow text-black">
          {filtered.map((city, index) => (
            <li
              key={index}
              onClick={() => {
                onChange(city);
                setFiltered([]);
              }}
              className="px-3 py-2 hover:bg-gray-100 cursor-pointer"
            >
              {city}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default CityAutocomplete;