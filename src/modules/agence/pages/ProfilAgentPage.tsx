import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { StandardLayoutWrapper, PageHeader, SectionCard } from '@/ui';

const ProfilAgentPage: React.FC = () => {
  const { user } = useAuth();

  return (
    <StandardLayoutWrapper maxWidthClass="max-w-xl">
      <PageHeader title="Mon profil" />
      <SectionCard title="Informations">
      <div className="space-y-4 text-gray-700">
        <div className="flex justify-between border-b pb-2">
          <span className="font-semibold text-gray-600">Nom d'utilisateur :</span>
          <span>{user?.displayName || user?.nom || 'Non spécifié'}</span>
        </div>
        
        <div className="flex justify-between border-b pb-2">
          <span className="font-semibold text-gray-600">Email :</span>
          <span className="text-blue-600">{user?.email || 'Non spécifié'}</span>
        </div>
        
        <div className="flex justify-between border-b pb-2">
          <span className="font-semibold text-gray-600">Rôle :</span>
          <span className="capitalize">{user?.role || 'Non spécifié'}</span>
        </div>
        
        <div className="flex justify-between border-b pb-2">
          <span className="font-semibold text-gray-600">Agence :</span>
          <span>{user?.agencyName || 'Non spécifié'}</span>
        </div>
        
        <div className="flex justify-between border-b pb-2">
          <span className="font-semibold text-gray-600">Ville :</span>
          <span>{user?.ville || 'Non spécifié'}</span>
        </div>
      </div>

      <p className="mt-6 text-sm text-gray-500 italic">
        Pour modifier vos informations, veuillez contacter votre administrateur.
      </p>
      </SectionCard>
    </StandardLayoutWrapper>
  );
};

export default ProfilAgentPage;