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
const VilleInput = ({ label, value, onChange }) => {
    const [villes, setVilles] = useState([]);
    useEffect(() => {
        const fetchVilles = () => __awaiter(void 0, void 0, void 0, function* () {
            const snap = yield getDocs(collection(db, 'villes'));
            const noms = snap.docs.map(doc => doc.data().nom);
            setVilles(noms);
        });
        fetchVilles();
    }, []);
    return (_jsxs("div", { children: [_jsx("label", { className: "block font-medium mb-1", children: label }), _jsx("input", { list: "liste-villes", className: "w-full border px-3 py-2 rounded", value: value, onChange: e => onChange(e.target.value), placeholder: "Entrer une ville" }), _jsx("datalist", { id: "liste-villes", children: villes.map((ville, idx) => (_jsx("option", { value: ville }, idx))) })] }));
};
export default VilleInput;
