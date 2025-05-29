import React, { useState } from 'react';
import RecettesPage from './RecettesPage';
import DepensesPage from './DepensesPage';
import EquilibrePage from './EquilibrePage';
import CompagnieStatistiquesMensuellesPage from './CompagnieStatistiquesMensuellesPage';

const CompagnieFinancesTabsPage: React.FC = () => {
  const tabs = ['Recettes', 'Dépenses', 'Équilibre', 'Statistiques'];
  const [selectedTab, setSelectedTab] = useState(0);

  return (
    <div className="p-6 bg-white min-h-screen">
      <h1 className="text-2xl font-bold mb-6">💰 Finances de la compagnie</h1>

      <div className="border-b border-gray-200 mb-4">
        <nav className="-mb-px flex space-x-6">
          {tabs.map((tab, index) => (
            <button
              key={tab}
              onClick={() => setSelectedTab(index)}
              className={`px-3 py-2 font-medium text-sm border-b-2 ${
                selectedTab === index
                  ? 'border-yellow-500 text-yellow-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      <div className="bg-gray-50 p-4 rounded shadow">
        {selectedTab === 0 && <RecettesPage />}
        {selectedTab === 1 && <DepensesPage />}
        {selectedTab === 2 && <EquilibrePage />}
        {selectedTab === 3 && <CompagnieStatistiquesMensuellesPage />}
      </div>
    </div>
  );
};

export default CompagnieFinancesTabsPage;