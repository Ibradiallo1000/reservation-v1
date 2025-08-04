// src/components/home/SearchForm.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import VilleCombobox from "@/components/VilleCombobox";

const SearchForm: React.FC = () => {
  const navigate = useNavigate();
  const [departure, setDeparture] = useState("");
  const [arrival, setArrival] = useState("");

  const handleSearch = () => {
    if (!departure || !arrival) return;
    navigate("/platform-search-results", { state: { departure, arrival } });
  };

  return (
    <div className="bg-white shadow-lg rounded-xl p-6 max-w-xl mx-auto">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">
        Trouvez votre prochain trajet
      </h2>
      <div className="space-y-4">
        <VilleCombobox label="Ville de départ" value={departure} onChange={setDeparture} />
        <VilleCombobox label="Ville d'arrivée" value={arrival} onChange={setArrival} />
        <button
          onClick={handleSearch}
          className="w-full py-3 px-6 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg transition-all"
        >
          Rechercher
        </button>
      </div>
    </div>
  );
};

export default SearchForm;
