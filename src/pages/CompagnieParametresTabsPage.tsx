import React, { useState, useEffect } from 'react';
import ParametresVitrine from './ParametresVitrine';
import ParametresPersonnel from './ParametresPersonnel';
import ParametresSecurite from './ParametresSecurite';
import ParametresReseauxPage from './ParametresReseauxPage';
import ParametresLegauxPage from './ParametresLegauxPage';
import { useAuth } from '@/contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import useCompanyTheme from '../hooks/useCompanyTheme';
import { Company } from '@/types/companyTypes';

const CompagnieParametresTabsPage = () => {
  const [selectedTab, setSelectedTab] = useState<'vitrine' | 'personnel' | 'securite' | 'reseaux' | 'legaux'>('vitrine');
  const { user } = useAuth();
  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);

  useEffect(() => {
    const fetchCompany = async () => {
      if (!user?.companyId) return;
      const docRef = doc(db, 'companies', user.companyId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setCompanyInfo({ id: docSnap.id, ...docSnap.data() } as Company);
      }
    };
    fetchCompany();
  }, [user?.companyId]);

  const { colors } = useCompanyTheme(companyInfo);

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6" style={{ color: colors.primary }}>
        Paramètres de la compagnie
      </h1>

      <div className="flex gap-4 mb-4">
        {[
          { key: 'vitrine', label: 'Vitrine publique' },
          { key: 'personnel', label: 'Personnel' },
          { key: 'securite', label: 'Sécurité' },
          { key: 'reseaux', label: 'Réseaux sociaux' },
          { key: 'legaux', label: 'Mentions & politique' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setSelectedTab(tab.key as any)}
            className={`px-4 py-2 rounded transition-all`}
            style={{
              backgroundColor: selectedTab === tab.key ? colors.primary : '#e5e7eb',
              color: selectedTab === tab.key ? colors.text : '#1f2937'
            }}
          >
            {tab.label}
          </button>
        ))}
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
