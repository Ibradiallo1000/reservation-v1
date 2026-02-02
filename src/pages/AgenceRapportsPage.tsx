// src/pages/AgenceRapportsPage.tsx

import React from "react";
import { useAuth } from "@/contexts/AuthContext";

const AgenceRapportsPage: React.FC = () => {
  const { user, company } = useAuth();

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      {/* Titre */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Rapports de l’agence
        </h1>
        <p className="text-sm text-gray-500">
          Synthèse et rapports d’activité
        </p>
      </div>

      {/* Infos contexte */}
      <div className="bg-white rounded-lg shadow border p-4 mb-6">
        <p className="text-sm">
          <span className="font-semibold">Compagnie :</span>{" "}
          {company?.nom || "—"}
        </p>
        <p className="text-sm">
          <span className="font-semibold">Agence :</span>{" "}
          {user?.agencyNom || user?.agencyName || "—"}
        </p>
      </div>

      {/* Placeholder clair */}
      <div className="bg-white rounded-lg shadow border p-6 text-center text-gray-500">
        <p className="text-lg font-medium mb-2">
          📊 Module Rapports
        </p>
        <p className="text-sm">
          Cette page servira à afficher :
        </p>
        <ul className="mt-3 text-sm list-disc list-inside text-left max-w-md mx-auto">
          <li>Rapports journaliers</li>
          <li>Rapports mensuels</li>
          <li>Statistiques agence</li>
          <li>Exports PDF / Excel</li>
        </ul>

        <p className="mt-4 text-xs text-gray-400">
          (Page créée volontairement simple pour éviter tout blocage)
        </p>
      </div>
    </div>
  );
};

export default AgenceRapportsPage;
