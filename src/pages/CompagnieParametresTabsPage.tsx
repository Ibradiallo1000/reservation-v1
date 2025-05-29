import React, { useState } from 'react';
import ParametresVitrine from './ParametresVitrine';
import ParametresPersonnel from './ParametresPersonnel';
import ParametresSecurite from './ParametresSecurite';
import ParametresReseauxPage from './ParametresReseauxPage';
import ParametresLegauxPage from './ParametresLegauxPage';

const CompagnieParametresTabsPage = () => {
  const [selectedTab, setSelectedTab] = useState<'vitrine' | 'personnel' | 'securite' | 'reseaux' | 'legaux'>('vitrine');

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Paramètres de la compagnie</h1>

      <div className="flex gap-4 mb-4">
        <button
          onClick={() => setSelectedTab('vitrine')}
          className={`px-4 py-2 rounded ${
            selectedTab === 'vitrine' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
          }`}
        >
          Vitrine publique
        </button>
        <button
          onClick={() => setSelectedTab('personnel')}
          className={`px-4 py-2 rounded ${
            selectedTab === 'personnel' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
          }`}
        >
          Personnel
        </button>
        <button
          onClick={() => setSelectedTab('securite')}
          className={`px-4 py-2 rounded ${
            selectedTab === 'securite' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
          }`}
        >
          Sécurité
        </button>
        <button
          onClick={() => setSelectedTab('reseaux')}
          className={`px-4 py-2 rounded ${
            selectedTab === 'reseaux' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
          }`}
        >
          Réseaux sociaux
        </button>
        <button
          onClick={() => setSelectedTab('legaux')}
          className={`px-4 py-2 rounded ${
            selectedTab === 'legaux' ? 'bg-yellow-600 text-white' : 'bg-gray-200'
          }`}
        >
          Mentions & politique
        </button>
      </div>

      {selectedTab === 'vitrine' && <ParametresVitrine />}
      {selectedTab === 'personnel' && <ParametresPersonnel />}
      {selectedTab === 'securite' && <ParametresSecurite />}
      {selectedTab === 'reseaux' && <ParametresReseauxPage />}
      {selectedTab === 'legaux' && <ParametresLegauxPage />}
    </div>
  );
};

export default CompagnieParametresTabsPage;
