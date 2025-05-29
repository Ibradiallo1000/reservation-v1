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
// ✅ src/pages/EquilibrePage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { useAuth } from '@/contexts/AuthContext';
const EquilibrePage = () => {
    const { user } = useAuth();
    const [recettes, setRecettes] = useState(0);
    const [depenses, setDepenses] = useState(0);
    const [balance, setBalance] = useState(0);
    useEffect(() => {
        const fetchData = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(user === null || user === void 0 ? void 0 : user.companyId))
                return;
            // Recettes
            const recettesSnap = yield getDocs(query(collection(db, 'reservations'), where('compagnieId', '==', user.companyId), where('statut', '==', 'payé')));
            const totalRecettes = recettesSnap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0);
            setRecettes(totalRecettes);
            // Dépenses
            const depensesSnap = yield getDocs(query(collection(db, 'depenses'), where('companyId', '==', user.companyId)));
            const totalDepenses = depensesSnap.docs.reduce((sum, doc) => sum + (doc.data().montant || 0), 0);
            setDepenses(totalDepenses);
            // Balance
            setBalance(totalRecettes - totalDepenses);
        });
        fetchData();
    }, [user]);
    return (_jsxs("div", { className: "p-4 bg-white rounded shadow", children: [_jsx("h2", { className: "text-lg font-semibold mb-2", children: "\uD83D\uDCCA \u00C9quilibre financier" }), _jsx("div", { className: "text-sm text-gray-600 mb-4", children: "Cette section affiche le r\u00E9sultat net de la compagnie : recettes totales - d\u00E9penses totales." }), _jsxs("ul", { className: "text-sm space-y-2", children: [_jsxs("li", { children: ["\uD83D\uDCB0 Recettes totales : ", _jsxs("span", { className: "font-semibold text-green-600", children: [recettes.toLocaleString(), " FCFA"] })] }), _jsxs("li", { children: ["\uD83D\uDCE4 D\u00E9penses totales : ", _jsxs("span", { className: "font-semibold text-red-500", children: [depenses.toLocaleString(), " FCFA"] })] }), _jsxs("li", { children: ["\uD83E\uDDFE R\u00E9sultat net : ", _jsxs("span", { className: `font-bold ${balance >= 0 ? 'text-green-700' : 'text-red-700'}`, children: [balance.toLocaleString(), " FCFA"] })] })] })] }));
};
export default EquilibrePage;
