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
// ✅ src/pages/DepensesPage.tsx
import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebaseConfig';
import { useAuth } from './contexts/AuthContext';
const DepensesPage = () => {
    const { user } = useAuth();
    const [depenses, setDepenses] = useState([]);
    const [total, setTotal] = useState(0);
    useEffect(() => {
        const fetchDepenses = () => __awaiter(void 0, void 0, void 0, function* () {
            if (!(user === null || user === void 0 ? void 0 : user.companyId))
                return;
            const q = query(collection(db, 'depenses'), where('companyId', '==', user.companyId));
            const snap = yield getDocs(q);
            const data = snap.docs.map(doc => doc.data());
            setDepenses(data);
            const totalDepenses = data.reduce((sum, d) => sum + (d.montant || 0), 0);
            setTotal(totalDepenses);
        });
        fetchDepenses();
    }, [user]);
    return (_jsxs("div", { className: "p-6 bg-white rounded shadow", children: [_jsx("h2", { className: "text-lg font-semibold mb-2", children: "\uD83D\uDCE4 D\u00E9penses" }), _jsxs("p", { className: "text-sm text-gray-600 mb-4", children: ["Total des d\u00E9penses : ", _jsxs("span", { className: "font-bold text-red-600", children: [total.toLocaleString(), " FCFA"] })] }), _jsxs("table", { className: "w-full text-sm border-collapse", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-gray-100", children: [_jsx("th", { className: "border p-2", children: "Date" }), _jsx("th", { className: "border p-2", children: "Description" }), _jsx("th", { className: "border p-2", children: "Montant" })] }) }), _jsx("tbody", { children: depenses.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "text-center text-gray-500 p-4", children: "Aucune d\u00E9pense enregistr\u00E9e." }) })) : (depenses.map((d, i) => (_jsxs("tr", { children: [_jsx("td", { className: "border p-2", children: d.date || '-' }), _jsx("td", { className: "border p-2", children: d.description || '-' }), _jsxs("td", { className: "border p-2 text-right", children: [(d.montant || 0).toLocaleString(), " FCFA"] })] }, i)))) })] })] }));
};
export default DepensesPage;
