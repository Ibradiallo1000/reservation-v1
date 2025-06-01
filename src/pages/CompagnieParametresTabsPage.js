import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import ParametresVitrine from './ParametresVitrine';
import ParametresPersonnel from './ParametresPersonnel';
import ParametresSecurite from './ParametresSecurite';
import ParametresReseauxPage from './ParametresReseauxPage';
import ParametresLegauxPage from './ParametresLegauxPage';
const CompagnieParametresTabsPage = () => {
    const [selectedTab, setSelectedTab] = useState('vitrine');
    return (_jsxs("div", { className: "max-w-5xl mx-auto p-6", children: [_jsx("h1", { className: "text-2xl font-bold text-gray-800 mb-6", children: "Param\u00E8tres de la compagnie" }), _jsxs("div", { className: "flex gap-4 mb-4", children: [_jsx("button", { onClick: () => setSelectedTab('vitrine'), className: `px-4 py-2 rounded ${selectedTab === 'vitrine' ? 'bg-yellow-600 text-white' : 'bg-gray-200'}`, children: "Vitrine publique" }), _jsx("button", { onClick: () => setSelectedTab('personnel'), className: `px-4 py-2 rounded ${selectedTab === 'personnel' ? 'bg-yellow-600 text-white' : 'bg-gray-200'}`, children: "Personnel" }), _jsx("button", { onClick: () => setSelectedTab('securite'), className: `px-4 py-2 rounded ${selectedTab === 'securite' ? 'bg-yellow-600 text-white' : 'bg-gray-200'}`, children: "S\u00E9curit\u00E9" }), _jsx("button", { onClick: () => setSelectedTab('reseaux'), className: `px-4 py-2 rounded ${selectedTab === 'reseaux' ? 'bg-yellow-600 text-white' : 'bg-gray-200'}`, children: "R\u00E9seaux sociaux" }), _jsx("button", { onClick: () => setSelectedTab('legaux'), className: `px-4 py-2 rounded ${selectedTab === 'legaux' ? 'bg-yellow-600 text-white' : 'bg-gray-200'}`, children: "Mentions & politique" })] }), selectedTab === 'vitrine' && _jsx(ParametresVitrine, {}), selectedTab === 'personnel' && _jsx(ParametresPersonnel, {}), selectedTab === 'securite' && _jsx(ParametresSecurite, {}), selectedTab === 'reseaux' && _jsx(ParametresReseauxPage, {}), selectedTab === 'legaux' && _jsx(ParametresLegauxPage, {})] }));
};
export default CompagnieParametresTabsPage;
