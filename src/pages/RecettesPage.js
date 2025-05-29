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
// ✅ src/pages/RecettesPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const RecettesPage = () => {
    const { user } = useAuth();
    const [recettes, setRecettes] = useState([]);
    const [total, setTotal] = useState(0);
    useEffect(() => {
        const fetchRecettes = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(user === null || user === void 0 ? void 0 : user.companyId))
                return;
            const q = query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé'));
            const snap = yield getDocs(q);
            const data = snap.docs.map(doc => doc.data());
            setRecettes(data);
            const totalMontant = data.reduce((sum, r) => sum + (r.montant || 0), 0);
            setTotal(totalMontant);
        });
        fetchRecettes();
    }, [user]);
    return (_jsxs("div", { children: [_jsx("h2", { className: "text-lg font-semibold mb-2", children: "\uD83D\uDCE5 Recettes" }), _jsxs("p", { className: "text-sm text-gray-600 mb-4", children: ["Total encaiss\u00E9 : ", _jsxs("span", { className: "font-bold text-green-600", children: [total.toLocaleString(), " FCFA"] })] }), _jsxs("table", { className: "w-full text-sm border-collapse", children: [_jsx("thead", { className: "bg-gray-100", children: _jsxs("tr", { children: [_jsx("th", { className: "border p-2", children: "Date" }), _jsx("th", { className: "border p-2", children: "Nom" }), _jsx("th", { className: "border p-2", children: "Montant" }), _jsx("th", { className: "border p-2", children: "Canal" })] }) }), _jsx("tbody", { children: recettes.map((r, i) => {
                            var _a;
                            return (_jsxs("tr", { children: [_jsx("td", { className: "border p-2", children: r.date }), _jsx("td", { className: "border p-2", children: r.nomClient }), _jsxs("td", { className: "border p-2", children: [(_a = r.montant) === null || _a === void 0 ? void 0 : _a.toLocaleString(), " FCFA"] }), _jsx("td", { className: "border p-2", children: r.canal })] }, i));
                        }) })] })] }));
};
export default RecettesPage;
