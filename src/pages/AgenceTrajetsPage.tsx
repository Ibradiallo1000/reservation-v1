
// ✅ Fichier minimal de test - src/pages/AgenceTrajetsPage.tsx

import React, { useEffect } from 'react';

const AgenceTrajetsPage: React.FC = () => {
  useEffect(() => {
    console.log("✅ AgenceTrajetsPage monté !");
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-gray-800">
      <h1 className="text-3xl font-bold">Bienvenue sur la page des trajets 🚍</h1>
    </div>
  );
};

export default AgenceTrajetsPage;
