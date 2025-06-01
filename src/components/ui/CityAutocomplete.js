var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebaseConfig';
const CityAutocomplete = ({ label, value, onChange }) => {
    const [suggestions, setSuggestions] = useState([]);
    const [filtered, setFiltered] = useState([]);
    useEffect(() => {
        const fetchCities = () => __awaiter(void 0, void 0, void 0, function* () {
            const snap = yield getDocs(collection(db, 'cities'));
            const cities = snap.docs.map((doc) => doc.data().name);
            setSuggestions(cities);
        });
        fetchCities();
    }, []);
    useEffect(() => {
        if (value.length >= 2) {
            const f = suggestions.filter(city => city.toLowerCase().includes(value.toLowerCase())).slice(0, 5);
            setFiltered(f);
        }
        else {
            setFiltered([]);
        }
    }, [value, suggestions]);
    return (_jsxs("div", { className: "relative", children: [_jsx("label", { className: "block text-sm font-semibold mb-1", children: label }), _jsx("input", { type: "text", value: value, onChange: (e) => onChange(e.target.value), className: "w-full px-3 py-2 border rounded bg-white/20 text-white placeholder-white", placeholder: `Choisir ${label.toLowerCase()}` }), filtered.length > 0 && (_jsx("ul", { className: "absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow text-black", children: filtered.map((city, index) => (_jsx("li", { onClick: () => {
                        onChange(city);
                        setFiltered([]);
                    }, className: "px-3 py-2 hover:bg-gray-100 cursor-pointer", children: city }, index))) }))] }));
};
export default CityAutocomplete;
