// =============================================
// src/pages/CompagnieParametresTabsPage.tsx
// =============================================
import React, { useEffect, useState } from 'react';
import ParametresVitrine from './ParametresVitrine';
import ParametresPersonnel from './ParametresPersonnel';
import ParametresSecurite from './ParametresSecurite';
import ParametresReseauxPage from './ParametresReseauxPage';
import ParametresLegauxPage from './ParametresLegauxPage';
import ParametresPlan from './ParametresPlan';
import ParametresServices from './ParametresServices';

import { useAuth } from '@/contexts/AuthContext';
import { usePageHeader } from '@/contexts/PageHeaderContext';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

import useCompanyTheme from '@/hooks/useCompanyTheme';
import { Company } from '@/types/companyTypes';

type TabKey = 'plan' | 'vitrine' | 'personnel' | 'securite' | 'reseaux' | 'legaux' | 'services';


const TABS: { key: TabKey; label: string }[] = [
  { key: 'plan',      label: 'Plan & abonnement' },
  { key: 'vitrine',   label: 'Vitrine publique' },
  { key: 'services', label: 'Services proposés' },
  { key: 'personnel', label: 'Personnel' },
  { key: 'securite',  label: 'Sécurité' },
  { key: 'reseaux',   label: 'Réseaux sociaux' },
  { key: 'legaux',    label: 'Mentions & politique' },
  
];

const CompagnieParametresTabsPage: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<TabKey>('vitrine');
  const { user, company } = useAuth();
  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const theme = useCompanyTheme(companyInfo || company || undefined);
  const { setHeader, resetHeader } = usePageHeader();

  // Charger les infos compagnie (nom/logo/couleurs) si besoin
  useEffect(() => {
    (async () => {
      if (!user?.companyId) {
        setCompanyInfo(null);
        setLoading(false);
        return;
      }
      try {
        const ref = doc(db, 'companies', user.companyId);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          setCompanyInfo({ id: snap.id, ...(snap.data() as any) });
        } else {
          setCompanyInfo(null);
        }
      } catch (e) {
        console.error('Erreur chargement compagnie:', e);
        setCompanyInfo(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.companyId]);

  // Header sticky dynamique (titre + sous-titre)
  useEffect(() => {
    const title = 'Paramètres de la compagnie';
    setHeader({
      title,
      // pas d’actions dans ce header
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: '#fff',
    });
    return () => resetHeader();
  }, [
    setHeader,
    resetHeader,
    companyInfo?.nom,
    company?.nom,
    theme.colors.primary,
    theme.colors.secondary,
  ]);

  // Rendu de l’onglet courant
  const renderTab = () => {
    switch (selectedTab) {
      case 'plan':      return <ParametresPlan />;
      case 'vitrine':
        return <ParametresVitrine />;
      case 'services':
        return <ParametresServices />;
      case 'personnel':
        return <ParametresPersonnel />;
      case 'securite':
        return <ParametresSecurite />;
      case 'reseaux':
        return <ParametresReseauxPage />;
      case 'legaux':
        return <ParametresLegauxPage />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      {/* NOTICE: le titre principal est déjà géré par le header sticky du layout */}

      {/* Barre d’onglets */}
      <div className="flex flex-wrap gap-2 md:gap-3 mb-6">
        {TABS.map(tab => {
          const active = selectedTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={[
                'px-4 py-2 rounded-full text-sm font-medium transition-all border',
                active
                  ? 'shadow-sm'
                  : 'hover:bg-gray-50',
              ].join(' ')}
              style={{
                backgroundColor: active ? theme.colors.primary : '#fff',
                color: active ? '#fff' : '#1f2937',
                borderColor: active ? `${theme.colors.primary}55` : '#e5e7eb',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Contenu */}
      {loading ? (
        <div className="bg-white rounded-xl border p-8 text-center text-gray-600">
          Chargement…
        </div>
      ) : (
        renderTab()
      )}
    </div>
  );
};

export default CompagnieParametresTabsPage;
