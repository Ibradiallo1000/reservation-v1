// src/components/home/ui/VilleCombobox.tsx
import React, { useState } from "react";
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
  const [filtered, setFiltered] = useState<string[]>([]);
  const [showList, setShowList] = useState(false);

  const handleInput = (val: string) => {
    onChange(val);
    if (val) {
      const low = val.toLowerCase();
      setFiltered(villes.filter((c) => c.toLowerCase().includes(low)).slice(0, 50));
      setShowList(true);
    } else {
      setFiltered([]);
      setShowList(false);
    }
  };

  const choose = (val: string) => {
    onChange(val);
    setShowList(false);
  };

  return (
    <div className="flex-1 relative">
      <div className="flex items-center border rounded px-3 py-2 bg-white">
        <MapPin className="h-5 w-5 text-orange-500 mr-2" />
        <input
          type="text"
          value={value}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => value ? setShowList(true) : void 0}
          placeholder={placeholder}
          required={required}
          className="flex-1 outline-none"
        />
      </div>

      {showList && filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-white shadow">
          {filtered.map((c) => (
            <li
              key={c}
              className="px-3 py-2 hover:bg-orange-50 cursor-pointer"
              onMouseDown={() => choose(c)} // onMouseDown pour éviter blur avant le click
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
