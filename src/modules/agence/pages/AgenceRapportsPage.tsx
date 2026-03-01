// src/pages/AgenceRapportsPage.tsx

import React from "react";
import { useAuth } from "@/contexts/AuthContext";
import { StandardLayoutWrapper, PageHeader, SectionCard } from "@/ui";

const AgenceRapportsPage: React.FC = () => {
  const { user, company } = useAuth();

  return (
    <StandardLayoutWrapper>
      <PageHeader
        title="Rapports de l'agence"
        subtitle="Synthèse et rapports d'activité"
      />

      <SectionCard title="Contexte">
        <p className="text-sm">
          <span className="font-semibold">Compagnie :</span>{" "}
          {company?.nom || "—"}
        </p>
        <p className="text-sm mt-1">
          <span className="font-semibold">Agence :</span>{" "}
          {user?.agencyNom || user?.agencyName || "—"}
        </p>
      </SectionCard>

      <SectionCard title="Module Rapports">
        <p className="text-center text-gray-500 mb-2">
          Cette page servira à afficher :
        </p>
        <ul className="text-sm list-disc list-inside text-left max-w-md mx-auto text-gray-600">
          <li>Rapports journaliers</li>
          <li>Rapports mensuels</li>
          <li>Statistiques agence</li>
          <li>Exports PDF / Excel</li>
        </ul>
        <p className="mt-4 text-xs text-gray-400 text-center">
          (Page créée volontairement simple pour éviter tout blocage)
        </p>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default AgenceRapportsPage;
