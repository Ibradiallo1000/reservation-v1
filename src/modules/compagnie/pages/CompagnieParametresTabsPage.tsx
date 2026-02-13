// =============================================
// src/pages/CompagnieParametresTabsPage.tsx
// VERSION CORRIGÉE MULTI-RÔLE (ADMIN + CEO)
// =============================================

import React, { useEffect, useState } from 'react';
import { useParams } from "react-router-dom";

import ParametresVitrine from '@/modules/compagnie/components/parametres/ParametresVitrine';
import ParametresPersonnel from '@/modules/compagnie/components/parametres/ParametresPersonnel';
import ParametresSecurite from '@/modules/compagnie/components/parametres/ParametresSecurite';
import ParametresReseauxPage from '@/modules/compagnie/components/parametres/ParametresReseauxPage';
import ParametresLegauxPage from '@/modules/compagnie/components/parametres/ParametresLegauxPage';
import ParametresPlan from '@/modules/compagnie/components/parametres/ParametresPlan';
import ParametresServices from '@/modules/compagnie/components/parametres/ParametresServices';

import { useAuth } from '@/contexts/AuthContext';
import { usePageHeader } from '@/contexts/PageHeaderContext';

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/firebaseConfig';

import useCompanyTheme from '@/shared/hooks/useCompanyTheme';
import { Company } from '@/types/companyTypes';

type TabKey =
  | 'plan'
  | 'vitrine'
  | 'personnel'
  | 'securite'
  | 'reseaux'
  | 'legaux'
  | 'services';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'plan', label: 'Plan & abonnement' },
  { key: 'vitrine', label: 'Vitrine publique' },
  { key: 'services', label: 'Services proposés' },
  { key: 'personnel', label: 'Personnel' },
  { key: 'securite', label: 'Sécurité' },
  { key: 'reseaux', label: 'Réseaux sociaux' },
  { key: 'legaux', label: 'Mentions & politique' },
];

const CompagnieParametresTabsPage: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState<TabKey>('vitrine');

  const { user, company } = useAuth();
  const { companyId: companyIdFromUrl } = useParams();

  // 🔥 IMPORTANT : priorité URL (mode inspection)
  const companyId = companyIdFromUrl ?? user?.companyId ?? "";

  const [companyInfo, setCompanyInfo] = useState<Company | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const theme = useCompanyTheme(companyInfo || company || undefined);
  const { setHeader, resetHeader } = usePageHeader();

  /* =========================
     Chargement compagnie
  ========================= */
  useEffect(() => {
    if (!companyId) {
      setCompanyInfo(null);
      setLoading(false);
      return;
    }

    const fetchCompany = async () => {
      try {
        const ref = doc(db, 'companies', companyId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          setCompanyInfo({
            id: snap.id,
            ...(snap.data() as any),
          });
        } else {
          setCompanyInfo(null);
        }
      } catch (e) {
        console.error('Erreur chargement compagnie:', e);
        setCompanyInfo(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [companyId]);

  /* =========================
     Header dynamique
  ========================= */
  useEffect(() => {
    setHeader({
      title: 'Paramètres de la compagnie',
      bg: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.secondary} 100%)`,
      fg: '#fff',
    });

    return () => resetHeader();
  }, [
    setHeader,
    resetHeader,
    theme.colors.primary,
    theme.colors.secondary,
  ]);

  /* =========================
     Rendu onglet actif
  ========================= */
  const renderTab = () => {
    switch (selectedTab) {
      case 'plan':
        return <ParametresPlan companyId={companyId} />;

      case 'vitrine':
        return <ParametresVitrine companyId={companyId} />;

      case 'services':
        return <ParametresServices companyId={companyId} />;

      case 'personnel':
        return <ParametresPersonnel companyId={companyId} />;

      case 'securite':
        return <ParametresSecurite companyId={companyId} />;

      case 'reseaux':
        return <ParametresReseauxPage companyId={companyId} />;

      case 'legaux':
        return <ParametresLegauxPage companyId={companyId} />;

      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">

      <div className="flex flex-wrap gap-2 md:gap-3 mb-6">
        {TABS.map(tab => {
          const active = selectedTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={[
                'px-4 py-2 rounded-full text-sm font-medium transition-all border',
                active ? 'shadow-sm' : 'hover:bg-gray-50',
              ].join(' ')}
              style={{
                backgroundColor: active ? theme.colors.primary : '#fff',
                color: active ? '#fff' : '#1f2937',
                borderColor: active
                  ? `${theme.colors.primary}55`
                  : '#e5e7eb',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

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
