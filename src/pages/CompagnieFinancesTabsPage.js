import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import RecettesPage from './RecettesPage';
import DepensesPage from './DepensesPage';
import EquilibrePage from './EquilibrePage';
import CompagnieStatistiquesMensuellesPage from './CompagnieStatistiquesMensuellesPage';
const CompagnieFinancesTabsPage = () => {
    const tabs = ['Recettes', 'Dépenses', 'Équilibre', 'Statistiques'];
    const [selectedTab, setSelectedTab] = useState(0);
    return (_jsxs("div", { className: "p-6 bg-white min-h-screen", children: [_jsx("h1", { className: "text-2xl font-bold mb-6", children: "\uD83D\uDCB0 Finances de la compagnie" }), _jsx("div", { className: "border-b border-gray-200 mb-4", children: _jsx("nav", { className: "-mb-px flex space-x-6", children: tabs.map((tab, index) => (_jsx("button", { onClick: () => setSelectedTab(index), className: `px-3 py-2 font-medium text-sm border-b-2 ${selectedTab === index
                            ? 'border-yellow-500 text-yellow-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700'}`, children: tab }, tab))) }) }), _jsxs("div", { className: "bg-gray-50 p-4 rounded shadow", children: [selectedTab === 0 && _jsx(RecettesPage, {}), selectedTab === 1 && _jsx(DepensesPage, {}), selectedTab === 2 && _jsx(EquilibrePage, {}), selectedTab === 3 && _jsx(CompagnieStatistiquesMensuellesPage, {})] })] }));
};
export default CompagnieFinancesTabsPage;
