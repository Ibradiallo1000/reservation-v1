import React, { useState, useEffect } from "react";
import { MapPin } from "lucide-react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/firebaseConfig";

interface VilleComboboxProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

const VilleCombobox: React.FC<VilleComboboxProps> = ({ label, value, onChange }) => {
  const [cities, setCities] = useState<string[]>([]);
  const [filtered, setFiltered] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);

  useEffect(() => {
    const fetchCities = async () => {
      const snap = await getDocs(collection(db, "villes"));
      setCities(snap.docs.map((doc) => doc.data().nom));
    };
    fetchCities();
  }, []);

  const handleInput = (val: string) => {
    onChange(val);
    if (val) {
      setFiltered(cities.filter((city) => city.toLowerCase().startsWith(val.toLowerCase())));
      setShowList(true);
    } else {
      setFiltered([]);
      setShowList(false);
    }
  };

  return (
    <div className="flex-1 relative">
      <div className="flex items-center border rounded px-3 py-2">
        <MapPin className="h-5 w-5 text-orange-500 mr-2" />
        <input
          type="text"
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          placeholder={label}
          className="flex-1 outline-none"
          required
        />
      </div>
      {showList && filtered.length > 0 && (
        <ul className="absolute z-10 bg-white border mt-1 rounded shadow w-full max-h-40 overflow-y-auto">
          {filtered.map((city, i) => (
            <li
              key={i}
              onClick={() => {
                onChange(city);
                setShowList(false);
              }}
              className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
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
